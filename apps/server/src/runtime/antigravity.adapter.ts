import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  CliRuntimeAdapter,
  HeartbeatListener,
  OfficeEventListener,
  RunTaskRequest,
  RunTaskResult,
} from '@agent-office/shared';

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    });
    killer.on('error', () => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore
      }
    });
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      // Ignore
    }
  }
}

export class AntigravityAdapter implements CliRuntimeAdapter {
  readonly provider = 'antigravity' as const;
  private activeByTask = new Map<string, ChildProcess>();
  private tasksByAgent = new Map<string, Set<string>>();

  async checkAvailable(): Promise<{ available: boolean; version?: string }> {
    return new Promise((resolve) => {
      const child = spawn('agy', ['--version'], {
        shell: true,
        windowsHide: true,
      });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk.toString()));
      child.on('error', () => resolve({ available: false }));
      child.on('close', (code) => {
        resolve({ available: code === 0, version: out.trim() || undefined });
      });
    });
  }

  async runTask(
    request: RunTaskRequest,
    onEvent: OfficeEventListener,
    onOutput?: HeartbeatListener,
  ): Promise<RunTaskResult> {
    const agentKey = `${request.room.id}:${request.agent.id}`;
    const taskKey = request.taskId ?? randomUUID();
    const cwd = request.workingDir ?? request.room.folderPath;

    const sections = [
      `[Role: ${request.agent.title}]`,
      request.agent.instructions,
      ...(request.mandate ? [`[Mandate / 授权边界]\n${request.mandate}`] : []),
      ...(request.priorSummary && !request.sessionId
        ? [`[近期线程上下文]\n${request.priorSummary}`]
        : []),
      `[Task]\n${request.prompt}`,
    ];
    const composedPrompt = sections.join('\n\n');
    // Flatten newlines when invoking via cmd.exe shell on Windows so arguments are never truncated
    const cliPrompt =
      process.platform === 'win32'
        ? composedPrompt.replace(/\r?\n/g, ' \\n ')
        : composedPrompt;

    const emit = (
      status: Parameters<OfficeEventListener>[0]['status'],
      bubbleText?: string,
      detail?: string,
    ) => {
      onEvent({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        roomId: request.room.id,
        agentId: request.agent.id,
        provider: this.provider,
        taskId: request.taskId,
        status,
        bubbleText,
        detail,
      });
    };

    emit(
      'thinking',
      request.routeMode === 'pass_through'
        ? '直通接收指令，思考中...'
        : 'Antigravity 正在思考...',
    );

    return new Promise((resolve) => {
      const args = [
        '--add-dir',
        cwd,
        '--output-format',
        'stream-json',
        '-p',
        cliPrompt,
      ];

      const child = spawn('agy', args, {
        cwd,
        shell: true,
        windowsHide: true,
        env: {
          ...process.env,
          AGENT_OFFICE_ROOM_ID: request.room.id,
          ...(request.taskId ? { AGENT_OFFICE_TASK_ID: request.taskId } : {}),
        },
      });

      this.trackProcess(agentKey, taskKey, child);
      let stdoutBuf = '';
      let stderrBuf = '';
      let detectedSessionId = request.sessionId;

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuf += text;
        onOutput?.(text, 'stdout');
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (typeof parsed.session_id === 'string') {
              detectedSessionId = parsed.session_id;
            } else if (typeof parsed.conversation_id === 'string') {
              detectedSessionId = parsed.conversation_id;
            }
            const type = String(parsed.type ?? '');
            if (type.includes('tool')) {
              emit(
                'calling_mcp',
                `调用工具: ${String(parsed.name ?? 'tool')}`,
                line,
              );
            } else {
              emit('writing', '生成回复中...', line);
            }
          } catch {
            // Non-JSON line fallback
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuf += text;
        onOutput?.(text, 'stderr');
      });

      child.on('error', (err) => {
        this.untrackProcess(agentKey, taskKey);
        emit('error', 'agy 启动失败', err.message);
        resolve({
          success: false,
          output: '',
          sessionId: detectedSessionId,
          error: err.message,
        });
      });

      child.on('close', (code) => {
        this.untrackProcess(agentKey, taskKey);
        if (code === 0) {
          emit('idle', '任务完成');
          resolve({
            success: true,
            output: stdoutBuf.trim(),
            sessionId: detectedSessionId,
          });
        } else {
          emit('error', `执行异常 (exit ${code})`, stderrBuf.trim());
          resolve({
            success: false,
            output: stdoutBuf.trim(),
            sessionId: detectedSessionId,
            error: stderrBuf.trim() || `Process exited with code ${code}`,
          });
        }
      });
    });
  }

  async stopTask(
    roomId: string,
    agentId: string,
    taskId?: string,
  ): Promise<void> {
    const agentKey = `${roomId}:${agentId}`;
    if (taskId) {
      const child = this.activeByTask.get(taskId);
      if (child) {
        killProcessTree(child);
        this.untrackProcess(agentKey, taskId);
      }
      return;
    }

    const tasks = this.tasksByAgent.get(agentKey);
    if (!tasks) return;
    for (const id of Array.from(tasks)) {
      const child = this.activeByTask.get(id);
      if (child) {
        killProcessTree(child);
      }
      this.untrackProcess(agentKey, id);
    }
  }

  private trackProcess(
    agentKey: string,
    taskKey: string,
    child: ChildProcess,
  ): void {
    this.activeByTask.set(taskKey, child);
    let set = this.tasksByAgent.get(agentKey);
    if (!set) {
      set = new Set();
      this.tasksByAgent.set(agentKey, set);
    }
    set.add(taskKey);
  }

  private untrackProcess(agentKey: string, taskKey: string): void {
    this.activeByTask.delete(taskKey);
    const set = this.tasksByAgent.get(agentKey);
    if (set) {
      set.delete(taskKey);
      if (set.size === 0) this.tasksByAgent.delete(agentKey);
    }
  }
}
