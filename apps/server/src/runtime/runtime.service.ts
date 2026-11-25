import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AgentProfile,
  ApprovalRequest,
  ApprovalStatus,
  CliProvider,
  CliRuntimeAdapter,
  DispatchTaskRequest,
  DispatchTaskResponse,
  RoomConfig,
  RunTaskRequest,
  RunTaskResult,
  TaskLogRecallResult,
  TaskRecord,
} from '@agent-office/shared';
import { OfficeGateway } from '../gateway/office.gateway';
import { StateStoreService } from '../store/state-store.service';
import { AntigravityAdapter } from './antigravity.adapter';
import { CodexAdapter } from './codex.adapter';
import { WatchdogService } from './watchdog.service';
import { WorktreeService } from './worktree.service';

@Injectable()
export class RuntimeService {
  private readonly adapters: Record<CliProvider, CliRuntimeAdapter>;

  constructor(
    private readonly gateway: OfficeGateway,
    private readonly stateStore: StateStoreService,
    private readonly worktreeService: WorktreeService,
    private readonly watchdog: WatchdogService,
  ) {
    this.adapters = {
      antigravity: new AntigravityAdapter(),
      codex: new CodexAdapter(),
    };
  }

  /** Allows test harnesses to swap a mock adapter without spawning external CLIs. */
  setAdapter(provider: CliProvider, adapter: CliRuntimeAdapter): void {
    this.adapters[provider] = adapter;
  }

  async checkProviders() {
    const [antigravity, codex] = await Promise.all([
      this.adapters.antigravity.checkAvailable(),
      this.adapters.codex.checkAvailable(),
    ]);
    return { antigravity, codex };
  }

  /**
   * Super-Agent core entry point: supports Thin Router dispatch, Async Worker delegation
   * (with isolated Git worktrees + Inline/Spill logs), and Subscription Pass-Through fast-path.
   */
  async dispatchTask(
    room: RoomConfig,
    agent: AgentProfile,
    dto: DispatchTaskRequest,
  ): Promise<DispatchTaskResponse> {
    const taskId = randomUUID();
    const now = new Date().toISOString();
    const routeMode =
      dto.routeMode ??
      (agent.id === room.leadAgentId ? 'router' : 'pass_through');

    const existingSession = this.stateStore.getAgentSession(room.id, agent.id);
    const shouldIsolate =
      agent.roleType === 'worker' && dto.isolateWorktree !== false;

    const prepared = shouldIsolate
      ? await this.worktreeService.prepareWorkerWorkspace(
          room,
          agent,
          taskId,
          routeMode === 'pass_through'
            ? {
                path: existingSession?.worktreePath,
                branch: existingSession?.worktreeBranch,
              }
            : undefined,
        )
      : { workingDir: room.folderPath, isolated: false };

    const sessionId =
      dto.sessionId ??
      (routeMode === 'pass_through' ? existingSession?.sessionId : undefined);

    const initialTask: TaskRecord = {
      id: taskId,
      roomId: room.id,
      agentId: agent.id,
      agentName: agent.name,
      provider: agent.provider,
      routeMode,
      parentTaskId: dto.parentTaskId,
      mandate: dto.mandate,
      prompt: dto.prompt,
      status: 'running',
      worktreePath: prepared.worktreePath,
      worktreeBranch: prepared.worktreeBranch,
      sessionId,
      heartbeatAt: now,
      createdAt: now,
    };

    const logPath = await this.stateStore.initTaskSpillLog(
      room.folderPath,
      initialTask,
    );
    initialTask.logPath = logPath;
    this.stateStore.createTask(initialTask);

    if (routeMode === 'delegated') {
      const lead = room.agents.find((a) => a.id === room.leadAgentId);
      if (lead) {
        this.gateway.broadcast({
          id: randomUUID(),
          timestamp: now,
          roomId: room.id,
          agentId: lead.id,
          provider: lead.provider,
          taskId,
          status: 'delegating',
          targetAgentId: agent.id,
          bubbleText: `派发任务 → ${agent.name}`,
          worktreeBranch: prepared.worktreeBranch,
        });
      }
    }

    this.watchdog.register({
      taskId,
      roomId: room.id,
      agentId: agent.id,
      provider: agent.provider,
      onStall: () =>
        this.adapters[agent.provider].stopTask(room.id, agent.id, taskId),
    });

    const execution = this.executeAndFinalize(
      room,
      agent,
      dto,
      initialTask,
      prepared.workingDir,
      existingSession?.lastSummary,
    );

    if (dto.async) {
      execution.catch(() => {
        // Handled inside executeAndFinalize
      });
      return { task: initialTask };
    }

    const { finalTask, rawOutput } = await execution;
    return {
      task: finalTask,
      output: rawOutput,
    };
  }

  /** Backward-compatible synchronous helper returning `RunTaskResult`. */
  async runAgentTask(request: RunTaskRequest): Promise<RunTaskResult> {
    const { task, output } = await this.dispatchTask(
      request.room,
      request.agent,
      {
        prompt: request.prompt,
        routeMode: request.routeMode,
        mandate: request.mandate,
        sessionId: request.sessionId,
        async: false,
      },
    );
    return {
      success: task.status === 'completed',
      output: output ?? task.summary ?? '',
      summary: task.summary,
      sessionId: task.sessionId,
      error: task.error,
      taskId: task.id,
      logPath: task.logPath,
      worktreePath: task.worktreePath,
      worktreeBranch: task.worktreeBranch,
    };
  }

  async stopAgentTask(
    provider: CliProvider,
    roomId: string,
    agentId: string,
    taskId?: string,
  ): Promise<void> {
    const active = this.stateStore
      .listRoomTasks(roomId, 50)
      .filter(
        (t) =>
          t.agentId === agentId &&
          (taskId ? t.id === taskId : true) &&
          (t.status === 'running' ||
            t.status === 'queued' ||
            t.status === 'waiting_approval'),
      );

    const now = new Date().toISOString();
    for (const t of active) {
      this.watchdog.unregister(t.id);
      this.stateStore.updateTask(t.id, {
        status: 'cancelled',
        error: '已手动停止任务',
        completedAt: now,
        heartbeatAt: now,
      });
    }

    await this.adapters[provider].stopTask(roomId, agentId, taskId);

    this.gateway.broadcast({
      id: randomUUID(),
      timestamp: now,
      roomId,
      agentId,
      provider,
      taskId,
      status: 'idle',
      bubbleText: '已停止',
    });
  }

  listRoomTasks(roomId: string, limit = 50): TaskRecord[] {
    return this.stateStore.listRoomTasks(roomId, limit);
  }

  getTaskOrThrow(roomId: string, taskId: string): TaskRecord {
    const task = this.stateStore.getTask(taskId);
    if (!task || task.roomId !== roomId) {
      throw new NotFoundException(`Task ${taskId} not found in room ${roomId}`);
    }
    return task;
  }

  async recallTaskLog(
    roomId: string,
    taskId: string,
    opts?: { offsetLines?: number; limitLines?: number; grep?: string },
  ): Promise<TaskLogRecallResult> {
    const task = this.getTaskOrThrow(roomId, taskId);
    return this.stateStore.recallTaskLog(task, opts);
  }

  // -------------------- Human-in-the-Loop Mandate / Approvals --------------------

  async requestApproval(
    room: RoomConfig,
    agent: AgentProfile,
    params: {
      question: string;
      taskId?: string;
      wait?: boolean;
      timeoutMs?: number;
    },
  ): Promise<ApprovalRequest> {
    const now = new Date().toISOString();
    const approval: ApprovalRequest = {
      id: randomUUID(),
      roomId: room.id,
      agentId: agent.id,
      agentName: agent.name,
      taskId: params.taskId,
      question: params.question,
      status: 'pending',
      createdAt: now,
    };
    this.stateStore.createApproval(approval);

    if (params.taskId) {
      this.watchdog.setApprovalPause(params.taskId, true);
      this.stateStore.updateTask(params.taskId, {
        status: 'waiting_approval',
        heartbeatAt: now,
      });
    }

    this.gateway.broadcast({
      id: randomUUID(),
      timestamp: now,
      roomId: room.id,
      agentId: agent.id,
      provider: agent.provider,
      taskId: params.taskId,
      approvalId: approval.id,
      status: 'waiting_approval',
      bubbleText: `待确认: ${params.question.slice(0, 36)}`,
      detail: params.question,
    });

    if (params.wait === false) {
      return approval;
    }

    const resolved = await this.stateStore.waitForApproval(
      approval.id,
      params.timeoutMs ?? 180_000,
    );

    if (params.taskId) {
      this.watchdog.setApprovalPause(params.taskId, false);
      const currentTask = this.stateStore.getTask(params.taskId);
      if (currentTask?.status === 'waiting_approval') {
        this.stateStore.updateTask(params.taskId, {
          status: 'running',
          heartbeatAt: new Date().toISOString(),
        });
      }
    }

    return resolved ?? approval;
  }

  resolveApproval(
    room: RoomConfig,
    approvalId: string,
    decision: Exclude<ApprovalStatus, 'pending'>,
    responseText?: string,
  ): ApprovalRequest {
    const current = this.stateStore.getApproval(approvalId);
    if (!current || current.roomId !== room.id) {
      throw new NotFoundException(`Approval ${approvalId} not found`);
    }
    const updated = this.stateStore.resolveApproval(
      approvalId,
      decision,
      responseText,
    )!;
    const agent = room.agents.find((a) => a.id === updated.agentId);
    if (agent) {
      this.gateway.broadcast({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        roomId: room.id,
        agentId: agent.id,
        provider: agent.provider,
        taskId: updated.taskId,
        approvalId: updated.id,
        status: decision === 'approved' ? 'thinking' : 'idle',
        bubbleText:
          decision === 'approved' ? '已获批，继续执行' : '人工已驳回请求',
        detail: responseText,
      });
    }
    return updated;
  }

  listRoomApprovals(roomId: string, onlyPending = false): ApprovalRequest[] {
    return this.stateStore.listRoomApprovals(roomId, onlyPending);
  }

  private async executeAndFinalize(
    room: RoomConfig,
    agent: AgentProfile,
    dto: DispatchTaskRequest,
    task: TaskRecord,
    workingDir: string,
    priorSummary?: string,
  ): Promise<{ finalTask: TaskRecord; rawOutput: string }> {
    const adapter = this.adapters[agent.provider];
    const result = await adapter.runTask(
      {
        taskId: task.id,
        room,
        agent,
        prompt: task.prompt,
        mandate: task.mandate,
        routeMode: task.routeMode,
        workingDir,
        sessionId: task.sessionId,
        priorSummary,
      },
      (event) => {
        this.gateway.broadcast({
          ...event,
          taskId: task.id,
          logPath: task.logPath,
          worktreeBranch: task.worktreeBranch,
        });
      },
      (chunk, stream) => {
        this.watchdog.heartbeat(task.id);
        if (task.logPath) {
          void this.stateStore.appendTaskSpillLog(task.logPath, chunk, stream);
        }
      },
    );

    this.watchdog.unregister(task.id);

    // Preserve Watchdog 'stalled' or manual 'cancelled' terminal states
    const latest = this.stateStore.getTask(task.id);
    if (latest && (latest.status === 'stalled' || latest.status === 'cancelled')) {
      return { finalTask: latest, rawOutput: result.output };
    }

    const baseSummary = this.stateStore.buildInlineSummary(
      result.output || result.error || '',
    );
    const wtChanges = await this.worktreeService.summarizeWorktreeChanges(
      task.worktreePath,
    );
    const inlineSummary = wtChanges
      ? `${baseSummary}\n[${wtChanges}]`
      : baseSummary;

    const completedAt = new Date().toISOString();
    const finalSessionId = result.sessionId ?? task.sessionId;
    const finalTask =
      this.stateStore.updateTask(task.id, {
        status: result.success ? 'completed' : 'failed',
        summary: inlineSummary,
        sessionId: finalSessionId,
        error: result.error,
        heartbeatAt: completedAt,
        completedAt,
      }) ?? task;

    this.stateStore.upsertAgentSession({
      roomId: room.id,
      agentId: agent.id,
      sessionId: finalSessionId,
      lastSummary: inlineSummary,
      worktreePath: task.worktreePath,
      worktreeBranch: task.worktreeBranch,
      updatedAt: completedAt,
    });

    // Event-driven Router callback awakening when delegated worker finishes
    if (dto.autoWakeLead && task.routeMode === 'delegated') {
      const lead = room.agents.find((a) => a.id === room.leadAgentId);
      if (lead && lead.id !== agent.id) {
        const callbackPrompt = [
          `[Worker 异步任务回执]`,
          `- 专员: ${agent.name} (${agent.id})`,
          `- 任务 ID: ${finalTask.id}`,
          `- 状态: ${finalTask.status}`,
          ...(finalTask.worktreeBranch
            ? [`- Git Worktree 分支: ${finalTask.worktreeBranch}`]
            : []),
          ...(finalTask.logPath
            ? [`- 溢写日志句柄 (Spill Log): ${finalTask.logPath}`]
            : []),
          `- Inline 摘要:\n${inlineSummary}`,
          `\n请验收结果并决定是否合并或继续派发后续步骤。如需查看详细输出，请调用 recall_task_log(taskId="${finalTask.id}")。`,
        ].join('\n');
        void this.dispatchTask(room, lead, {
          prompt: callbackPrompt,
          routeMode: 'router',
          parentTaskId: finalTask.id,
          async: true,
        });
      }
    }

    return { finalTask, rawOutput: result.output };
  }
}
