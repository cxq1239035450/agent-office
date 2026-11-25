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
  /** Associated task ID in the Super-Agent task store */
  taskId?: string;
  /** Associated human approval request ID when status === 'waiting_approval' */
  approvalId?: string;
  /** Short human-readable label displayed in 2D speech bubble */
  bubbleText?: string;
  /** Target agent ID when status === 'delegating' */
  targetAgentId?: string;
  /** Optional tool or MCP server name */
  toolName?: string;
  /** Spilled log path handle */
  logPath?: string;
  /** Isolated Git worktree branch if applicable */
  worktreeBranch?: string;
  /** Detailed raw payload or log snippet */
  detail?: string;
}

export interface AgentRuntimeState {
  roomId: string;
  agentId: string;
  status: AgentWorkStatus;
  taskId?: string;
  approvalId?: string;
  bubbleText?: string;
  worktreeBranch?: string;
  lastUpdated: string;
}
