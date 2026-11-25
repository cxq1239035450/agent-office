import type { AgentProfile, CliProvider, RoomConfig } from './workspace.js';
import type { OfficeEvent } from './events.js';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'cancelled';

export type TaskRouteMode = 'router' | 'pass_through' | 'delegated';

export interface TaskRecord {
  id: string;
  roomId: string;
  agentId: string;
  agentName: string;
  provider: CliProvider;
  routeMode: TaskRouteMode;
  parentTaskId?: string;
  /** Immutable authorization / scope boundary bound to this task */
  mandate?: string;
  prompt: string;
  status: TaskStatus;
  /** Inline concise result summary kept in context */
  summary?: string;
  /** Out-of-band spilled log file path (.agent-office/runs/<taskId>.log) */
  logPath?: string;
  /** Isolated Git worktree directory if created */
  worktreePath?: string;
  /** Isolated Git worktree branch name */
  worktreeBranch?: string;
  /** CLI session/thread ID for Pass-Through fast-path continuity */
  sessionId?: string;
  error?: string;
  heartbeatAt: string;
  createdAt: string;
  completedAt?: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  roomId: string;
  agentId: string;
  agentName: string;
  taskId?: string;
  question: string;
  status: ApprovalStatus;
  responseText?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface TaskLogRecallResult {
  taskId: string;
  logPath: string;
  totalLines: number;
  matchedLines: number;
  offsetLines: number;
  limitLines: number;
  lines: string[];
}

export interface DispatchTaskRequest {
  prompt: string;
  routeMode?: TaskRouteMode;
  parentTaskId?: string;
  mandate?: string;
  /** Run asynchronously and return taskId immediately (non-blocking) */
  async?: boolean;
  /** Create an isolated Git worktree for worker tasks when inside a Git repo */
  isolateWorktree?: boolean;
  /** Automatically wake Lead Agent with Inline summary + Spill handle upon completion */
  autoWakeLead?: boolean;
  /** Explicit sessionId override; pass_through automatically uses stored agent session */
  sessionId?: string;
}

export interface DispatchTaskResponse {
  task: TaskRecord;
  /** Populated when async === false */
  output?: string;
}

export interface RunTaskRequest {
  taskId?: string;
  room: RoomConfig;
  agent: AgentProfile;
  prompt: string;
  mandate?: string;
  routeMode?: TaskRouteMode;
  /** Working directory override (e.g., isolated Git worktree path) */
  workingDir?: string;
  sessionId?: string;
  /** Recent inline context summary when continuing a thread without native CLI resume */
  priorSummary?: string;
}

export interface RunTaskResult {
  success: boolean;
  output: string;
  summary?: string;
  sessionId?: string;
  error?: string;
  taskId?: string;
  logPath?: string;
  worktreePath?: string;
  worktreeBranch?: string;
}

export type OfficeEventListener = (event: OfficeEvent) => void;

export type HeartbeatListener = (chunk: string, stream: 'stdout' | 'stderr') => void;

export interface CliRuntimeAdapter {
  readonly provider: CliProvider;
  checkAvailable(): Promise<{ available: boolean; version?: string }>;
  runTask(
    request: RunTaskRequest,
    onEvent: OfficeEventListener,
    onOutput?: HeartbeatListener,
  ): Promise<RunTaskResult>;
  stopTask(roomId: string, agentId: string, taskId?: string): Promise<void>;
}
