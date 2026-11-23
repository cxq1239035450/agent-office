import { Injectable } from '@nestjs/common';
import type {
  CliProvider,
  CliRuntimeAdapter,
  RunTaskRequest,
  RunTaskResult,
} from '@agent-office/shared';
import { OfficeGateway } from '../gateway/office.gateway';
import { AntigravityAdapter } from './antigravity.adapter';
import { CodexAdapter } from './codex.adapter';

@Injectable()
export class RuntimeService {
  private readonly adapters: Record<CliProvider, CliRuntimeAdapter>;

  constructor(private readonly gateway: OfficeGateway) {
    this.adapters = {
      antigravity: new AntigravityAdapter(),
      codex: new CodexAdapter(),
    };
  }

  async checkProviders() {
    const [antigravity, codex] = await Promise.all([
      this.adapters.antigravity.checkAvailable(),
      this.adapters.codex.checkAvailable(),
    ]);
    return { antigravity, codex };
  }

  async runAgentTask(request: RunTaskRequest): Promise<RunTaskResult> {
    const adapter = this.adapters[request.agent.provider];
    return adapter.runTask(request, (event) => {
      this.gateway.broadcast(event);
    });
  }

  async stopAgentTask(
    provider: CliProvider,
    roomId: string,
    agentId: string,
  ): Promise<void> {
    await this.adapters[provider].stopTask(roomId, agentId);
  }
}
