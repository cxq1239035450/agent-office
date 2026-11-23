import type { AgentProfile, CliProvider, RoomConfig } from './workspace.js';
import type { OfficeEvent } from './events.js';

export interface RunTaskRequest {
  room: RoomConfig;
  agent: AgentProfile;
  prompt: string;
  sessionId?: string;
}

export interface RunTaskResult {
  success: boolean;
  output: string;
  sessionId?: string;
  error?: string;
}

export type OfficeEventListener = (event: OfficeEvent) => void;

export interface CliRuntimeAdapter {
  readonly provider: CliProvider;
  checkAvailable(): Promise<{ available: boolean; version?: string }>;
  runTask(
    request: RunTaskRequest,
    onEvent: OfficeEventListener,
  ): Promise<RunTaskResult>;
  stopTask(roomId: string, agentId: string): Promise<void>;
}
