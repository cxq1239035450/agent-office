import type { CliProvider } from './workspace.js';

export type AgentWorkStatus =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running_cmd'
  | 'calling_mcp'
  | 'delegating'
  | 'waiting_approval'
  | 'error';

export interface OfficeEvent {
  id: string;
  timestamp: string;
  roomId: string;
  agentId: string;
  provider: CliProvider;
  status: AgentWorkStatus;
  /** Short human-readable label displayed in 2D speech bubble */
  bubbleText?: string;
  /** Target agent ID when status === 'delegating' */
  targetAgentId?: string;
  /** Optional tool or MCP server name */
  toolName?: string;
  /** Detailed raw payload or log snippet */
  detail?: string;
}

export interface AgentRuntimeState {
  roomId: string;
  agentId: string;
  status: AgentWorkStatus;
  bubbleText?: string;
  lastUpdated: string;
}
