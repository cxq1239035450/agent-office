import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  CliRuntimeAdapter,
  OfficeEventListener,
  RunTaskRequest,
  RunTaskResult,
} from '@agent-office/shared';

/**
 * Codex CLI Adapter.
 * Phase 1 uses `codex exec --json` (JSON Lines).
 * Phase 2 can upgrade to persistent `codex app-server` JSON-RPC 2.0 sessions.
 */
export class CodexAdapter implements CliRuntimeAdapter {
  readonly provider = 'codex' as const;
  private activeProcesses = new Map<string, ChildProcess>();

  async checkAvailable(): Promise<{ available: boolean; version?: string }> {
    return new Promise((resolve) => {
      const child = spawn('codex', ['--version'], { shell: true });
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
  ): Promise<RunTaskResult> {
    const key = `${request.room.id}:${request.agent.id}`;
    const composedPrompt = `[Role: ${request.agent.title}]\n${request.agent.instructions}\n\nTask:\n${request.prompt}`;

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
        status,
        bubbleText,
        detail,
      });
    };

    emit('thinking', 'Codex 正在分析任务...');

    return new Promise((resolve) => {
      const child = spawn('codex', ['exec', '--json', composedPrompt], {
        cwd: request.room.folderPath,
        shell: true,
      });

      this.activeProcesses.set(key, child);
      let stdoutBuf = '';
      let stderrBuf = '';

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuf += text;
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            const type = String(parsed.type ?? '');
            if (type.includes('command')) {
              emit('running_cmd', '执行命令中...', line);
            } else if (type.includes('mcp')) {
              emit('calling_mcp', '调用 MCP...', line);
            } else if (type.includes('file') || type.includes('patch')) {
              emit('writing', '修改文件中...', line);
            } else {
              emit('thinking', '推理中...', line);
            }
          } catch {
            // Non-JSON line fallback
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(key);
        emit('error', 'codex 启动失败', err.message);
        resolve({ success: false, output: '', error: err.message });
      });

      child.on('close', (code) => {
        this.activeProcesses.delete(key);
        if (code === 0) {
          emit('idle', '任务完成');
          resolve({ success: true, output: stdoutBuf.trim() });
        } else {
          emit('error', `执行异常 (exit ${code})`, stderrBuf.trim());
          resolve({
            success: false,
            output: stdoutBuf.trim(),
            error: stderrBuf.trim() || `Process exited with code ${code}`,
          });
        }
      });
    });
  }

  async stopTask(roomId: string, agentId: string): Promise<void> {
    const key = `${roomId}:${agentId}`;
    const child = this.activeProcesses.get(key);
    if (child) {
      child.kill();
      this.activeProcesses.delete(key);
    }
  }
}
