import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ApprovalRequest,
  ApprovalStatus,
  TaskLogRecallResult,
  TaskRecord,
  TaskStatus,
} from '@agent-office/shared';

export interface AgentSessionRecord {
  roomId: string;
  agentId: string;
  sessionId?: string;
  lastSummary?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  updatedAt: string;
}

@Injectable()
export class StateStoreService implements OnModuleInit, OnModuleDestroy {
  private db!: DatabaseSync;
  private readonly approvalEvents = new EventEmitter();
  readonly dataDir: string;
  readonly dbPath: string;

  constructor(
    @Optional() @Inject('AGENT_OFFICE_DATA_DIR') customDataDir?: string,
  ) {
    this.dataDir =
      customDataDir ??
      process.env.AGENT_OFFICE_DATA_DIR ??
      resolve(__dirname, '..', '..', '..', '..', 'data');
    mkdirSync(this.dataDir, { recursive: true });
    this.dbPath = join(this.dataDir, 'agent-office.sqlite');
    this.initDatabase();
  }

  async onModuleInit(): Promise<void> {
    this.recoverInterruptedTasks();
  }

  onModuleDestroy(): void {
    try {
      this.db?.close();
    } catch {
      // Ignore close errors during shutdown
    }
  }

  private initDatabase(): void {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS room_registry (
        room_id TEXT PRIMARY KEY,
        folder_path TEXT NOT NULL UNIQUE,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        provider TEXT NOT NULL,
        route_mode TEXT NOT NULL,
        parent_task_id TEXT,
        mandate TEXT,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        log_path TEXT,
        worktree_path TEXT,
        worktree_branch TEXT,
        session_id TEXT,
        error TEXT,
        heartbeat_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_room_created
        ON tasks(room_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_tasks_status
        ON tasks(status);

      CREATE TABLE IF NOT EXISTS agent_sessions (
        room_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        last_summary TEXT,
        worktree_path TEXT,
        worktree_branch TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (room_id, agent_id)
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        task_id TEXT,
        question TEXT NOT NULL,
        status TEXT NOT NULL,
        response_text TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_approvals_room_status
        ON approvals(room_id, status, created_at DESC);
    `);
  }

  /**
   * Compute-State Separation recovery: mark tasks interrupted by process crash/restart.
   */
  recoverInterruptedTasks(): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'failed',
          error = COALESCE(error, '服务重启，先前运行中的子进程已中断'),
          completed_at = ?
      WHERE status IN ('queued', 'running', 'waiting_approval')
    `);
    const res = stmt.run(now);
    this.db
      .prepare(
        `UPDATE approvals
         SET status = 'rejected',
             response_text = COALESCE(response_text, '服务重启自动关闭'),
             resolved_at = ?
         WHERE status = 'pending'`,
      )
      .run(now);
    return Number(res.changes ?? 0);
  }

  // -------------------- Room Registry --------------------

  listRegisteredFolders(): string[] {
    const rows = this.db
      .prepare('SELECT folder_path FROM room_registry ORDER BY updated_at ASC')
      .all() as Array<{ folder_path: string }>;
    return rows.map((r) => r.folder_path);
  }

  upsertRegisteredRoom(roomId: string, folderPath: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO room_registry (room_id, folder_path, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET
           folder_path = excluded.folder_path,
           updated_at = excluded.updated_at`,
      )
      .run(roomId, folderPath, now);
  }

  removeRegisteredRoom(roomId: string): void {
    this.db.prepare('DELETE FROM room_registry WHERE room_id = ?').run(roomId);
  }

  // -------------------- Tasks (CRUD + Heartbeat) --------------------

  createTask(task: TaskRecord): TaskRecord {
    this.db
      .prepare(
        `INSERT INTO tasks (
          id, room_id, agent_id, agent_name, provider, route_mode,
          parent_task_id, mandate, prompt, status, summary, log_path,
          worktree_path, worktree_branch, session_id, error,
          heartbeat_at, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.roomId,
        task.agentId,
        task.agentName,
        task.provider,
        task.routeMode,
        task.parentTaskId ?? null,
        task.mandate ?? null,
        task.prompt,
        task.status,
        task.summary ?? null,
        task.logPath ?? null,
        task.worktreePath ?? null,
        task.worktreeBranch ?? null,
        task.sessionId ?? null,
        task.error ?? null,
        task.heartbeatAt,
        task.createdAt,
        task.completedAt ?? null,
      );
    return task;
  }

  updateTask(
    taskId: string,
    patch: Partial<
      Pick<
        TaskRecord,
        | 'status'
        | 'summary'
        | 'logPath'
        | 'worktreePath'
        | 'worktreeBranch'
        | 'sessionId'
        | 'error'
        | 'heartbeatAt'
        | 'completedAt'
      >
    >,
  ): TaskRecord | undefined {
    const existing = this.getTask(taskId);
    if (!existing) return undefined;
    const next: TaskRecord = { ...existing, ...patch };
    this.db
      .prepare(
        `UPDATE tasks SET
          status = ?,
          summary = ?,
          log_path = ?,
          worktree_path = ?,
          worktree_branch = ?,
          session_id = ?,
          error = ?,
          heartbeat_at = ?,
          completed_at = ?
         WHERE id = ?`,
      )
      .run(
        next.status,
        next.summary ?? null,
        next.logPath ?? null,
        next.worktreePath ?? null,
        next.worktreeBranch ?? null,
        next.sessionId ?? null,
        next.error ?? null,
        next.heartbeatAt,
        next.completedAt ?? null,
        taskId,
      );
    return next;
  }

  touchTaskHeartbeat(taskId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE tasks SET heartbeat_at = ? WHERE id = ?')
      .run(now, taskId);
  }

  getTask(taskId: string): TaskRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskId) as Record<string, unknown> | undefined;
    return row ? this.mapTaskRow(row) : undefined;
  }

  listRoomTasks(roomId: string, limit = 50): TaskRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM tasks WHERE room_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(roomId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapTaskRow(r));
  }

  listActiveTasks(): TaskRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE status IN ('queued', 'running')`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapTaskRow(r));
  }

  // -------------------- Pass-Through Agent Sessions --------------------

  getAgentSession(
    roomId: string,
    agentId: string,
  ): AgentSessionRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM agent_sessions WHERE room_id = ? AND agent_id = ?',
      )
      .get(roomId, agentId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      roomId: String(row.room_id),
      agentId: String(row.agent_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      lastSummary: row.last_summary ? String(row.last_summary) : undefined,
      worktreePath: row.worktree_path ? String(row.worktree_path) : undefined,
      worktreeBranch: row.worktree_branch
        ? String(row.worktree_branch)
        : undefined,
      updatedAt: String(row.updated_at),
    };
  }

  upsertAgentSession(record: AgentSessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO agent_sessions (
          room_id, agent_id, session_id, last_summary,
          worktree_path, worktree_branch, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, agent_id) DO UPDATE SET
          session_id = COALESCE(excluded.session_id, agent_sessions.session_id),
          last_summary = COALESCE(excluded.last_summary, agent_sessions.last_summary),
          worktree_path = COALESCE(excluded.worktree_path, agent_sessions.worktree_path),
          worktree_branch = COALESCE(excluded.worktree_branch, agent_sessions.worktree_branch),
          updated_at = excluded.updated_at`,
      )
      .run(
        record.roomId,
        record.agentId,
        record.sessionId ?? null,
        record.lastSummary ?? null,
        record.worktreePath ?? null,
        record.worktreeBranch ?? null,
        record.updatedAt,
      );
  }

  // -------------------- Approvals (Mandate / ask_user) --------------------

  createApproval(req: ApprovalRequest): ApprovalRequest {
    this.db
      .prepare(
        `INSERT INTO approvals (
          id, room_id, agent_id, agent_name, task_id,
          question, status, response_text, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.id,
        req.roomId,
        req.agentId,
        req.agentName,
        req.taskId ?? null,
        req.question,
        req.status,
        req.responseText ?? null,
        req.createdAt,
        req.resolvedAt ?? null,
      );
    return req;
  }

  resolveApproval(
    approvalId: string,
    decision: Exclude<ApprovalStatus, 'pending'>,
    responseText?: string,
  ): ApprovalRequest | undefined {
    const existing = this.getApproval(approvalId);
    if (!existing) return undefined;
    const resolvedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE approvals
         SET status = ?, response_text = ?, resolved_at = ?
         WHERE id = ?`,
      )
      .run(decision, responseText ?? null, resolvedAt, approvalId);
    const updated = this.getApproval(approvalId);
    if (updated) {
      this.approvalEvents.emit(`resolved:${approvalId}`, updated);
    }
    return updated;
  }

  getApproval(approvalId: string): ApprovalRequest | undefined {
    const row = this.db
      .prepare('SELECT * FROM approvals WHERE id = ?')
      .get(approvalId) as Record<string, unknown> | undefined;
    return row ? this.mapApprovalRow(row) : undefined;
  }

  listRoomApprovals(
    roomId: string,
    onlyPending = false,
  ): ApprovalRequest[] {
    const sql = onlyPending
      ? `SELECT * FROM approvals WHERE room_id = ? AND status = 'pending' ORDER BY created_at DESC`
      : `SELECT * FROM approvals WHERE room_id = ? ORDER BY created_at DESC LIMIT 30`;
    const rows = this.db.prepare(sql).all(roomId) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapApprovalRow(r));
  }

  waitForApproval(
    approvalId: string,
    timeoutMs = 180_000,
  ): Promise<ApprovalRequest | undefined> {
    const current = this.getApproval(approvalId);
    if (!current || current.status !== 'pending') {
      return Promise.resolve(current);
    }
    return new Promise((resolvePromise) => {
      const eventName = `resolved:${approvalId}`;
      const onResolved = (updated: ApprovalRequest) => {
        clearTimeout(timer);
        resolvePromise(updated);
      };
      const timer = setTimeout(() => {
        this.approvalEvents.off(eventName, onResolved);
        resolvePromise(this.getApproval(approvalId));
      }, timeoutMs);
      this.approvalEvents.once(eventName, onResolved);
    });
  }

  // -------------------- Inline & Spill + Chain of Recall --------------------

  async initTaskSpillLog(
    roomFolderPath: string,
    task: TaskRecord,
  ): Promise<string> {
    const runsDir = join(roomFolderPath, '.agent-office', 'runs');
    await mkdir(runsDir, { recursive: true });
    const logPath = join(runsDir, `${task.id}.log`);
    const header = [
      `# Agent Office Task Run Log (Spill Storage)`,
      `task_id: ${task.id}`,
      `agent: ${task.agentName} (${task.agentId}) [${task.provider}]`,
      `route_mode: ${task.routeMode}`,
      ...(task.mandate ? [`mandate: ${task.mandate}`] : []),
      ...(task.worktreeBranch ? [`worktree_branch: ${task.worktreeBranch}`] : []),
      `created_at: ${task.createdAt}`,
      `--- PROMPT ---`,
      task.prompt,
      `--- STREAM ---`,
      '',
    ].join('\n');
    await writeFile(logPath, header, 'utf-8');
    return logPath;
  }

  async appendTaskSpillLog(
    logPath: string,
    chunk: string,
    stream: 'stdout' | 'stderr',
  ): Promise<void> {
    const prefix = stream === 'stderr' ? '[stderr] ' : '';
    const formatted = chunk
      .split('\n')
      .map((line, idx, arr) =>
        idx === arr.length - 1 && line === '' ? '' : `${prefix}${line}`,
      )
      .join('\n');
    if (!formatted) return;
    await appendFile(
      logPath,
      formatted.endsWith('\n') ? formatted : `${formatted}\n`,
      'utf-8',
    );
  }

  /**
   * Builds a high-signal Inline Summary from raw CLI NDJSON / stdout
   * while full details remain spilled in `.agent-office/runs/<taskId>.log`.
   */
  buildInlineSummary(rawOutput: string, maxChars = 600): string {
    if (!rawOutput.trim()) return '(无文本输出，详见溢写日志)';
    const extractedMessages: string[] = [];
    const plainLines: string[] = [];

    for (const line of rawOutput.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const obj = JSON.parse(trimmed) as Record<string, unknown>;
          const textCandidate =
            (typeof obj.text === 'string' && obj.text) ||
            (typeof obj.content === 'string' && obj.content) ||
            (typeof obj.message === 'string' && obj.message) ||
            (typeof obj.result === 'string' && obj.result) ||
            (typeof (obj.item as Record<string, unknown> | undefined)?.text ===
              'string' &&
              String((obj.item as Record<string, unknown>).text));
          if (textCandidate) {
            extractedMessages.push(textCandidate.trim());
          }
          continue;
        } catch {
          // Fall through as plain line
        }
      }
      plainLines.push(trimmed);
    }

    const combined =
      extractedMessages.length > 0
        ? extractedMessages.join('\n')
        : plainLines.slice(-15).join('\n');

    if (combined.length <= maxChars) return combined;
    return `...${combined.slice(-(maxChars - 3))}`;
  }

  /**
   * Chain of Recall: selectively expand spilled log slices or search matches by taskId.
   */
  async recallTaskLog(
    task: TaskRecord,
    opts?: { offsetLines?: number; limitLines?: number; grep?: string },
  ): Promise<TaskLogRecallResult> {
    if (!task.logPath) {
      return {
        taskId: task.id,
        logPath: '',
        totalLines: 0,
        matchedLines: 0,
        offsetLines: 0,
        limitLines: opts?.limitLines ?? 80,
        lines: [],
      };
    }

    const raw = await readFile(task.logPath, 'utf-8');
    const allLines = raw.split(/\r?\n/);
    const offset = Math.max(0, opts?.offsetLines ?? 0);
    const limit = Math.min(400, Math.max(1, opts?.limitLines ?? 80));
    const needle = opts?.grep?.trim().toLowerCase();

    const filtered = needle
      ? allLines
          .map((line, i) => `[L${i + 1}] ${line}`)
          .filter((line) => line.toLowerCase().includes(needle))
      : allLines.map((line, i) => `[L${i + 1}] ${line}`);

    return {
      taskId: task.id,
      logPath: task.logPath,
      totalLines: allLines.length,
      matchedLines: filtered.length,
      offsetLines: offset,
      limitLines: limit,
      lines: filtered.slice(offset, offset + limit),
    };
  }

  private mapTaskRow(row: Record<string, unknown>): TaskRecord {
    return {
      id: String(row.id),
      roomId: String(row.room_id),
      agentId: String(row.agent_id),
      agentName: String(row.agent_name),
      provider: row.provider as TaskRecord['provider'],
      routeMode: row.route_mode as TaskRecord['routeMode'],
      parentTaskId: row.parent_task_id ? String(row.parent_task_id) : undefined,
      mandate: row.mandate ? String(row.mandate) : undefined,
      prompt: String(row.prompt),
      status: row.status as TaskStatus,
      summary: row.summary ? String(row.summary) : undefined,
      logPath: row.log_path ? String(row.log_path) : undefined,
      worktreePath: row.worktree_path ? String(row.worktree_path) : undefined,
      worktreeBranch: row.worktree_branch
        ? String(row.worktree_branch)
        : undefined,
      sessionId: row.session_id ? String(row.session_id) : undefined,
      error: row.error ? String(row.error) : undefined,
      heartbeatAt: String(row.heartbeat_at),
      createdAt: String(row.created_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
    };
  }

  private mapApprovalRow(row: Record<string, unknown>): ApprovalRequest {
    return {
      id: String(row.id),
      roomId: String(row.room_id),
      agentId: String(row.agent_id),
      agentName: String(row.agent_name),
      taskId: row.task_id ? String(row.task_id) : undefined,
      question: String(row.question),
      status: row.status as ApprovalStatus,
      responseText: row.response_text ? String(row.response_text) : undefined,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    };
  }
}
