import type {
  AgentProfile,
  ApprovalRequest,
  ApprovalStatus,
  CliProvider,
  DispatchTaskRequest,
  DispatchTaskResponse,
  McpServerConfig,
  RoomConfig,
  RunTaskResult,
  SkillAssignment,
  TaskLogRecallResult,
  TaskRecord,
} from '@agent-office/shared';

export interface ProviderHealth {
  available: boolean;
  version?: string;
}

export interface HealthResponse {
  ok: boolean;
  providers: {
    antigravity: ProviderHealth;
    codex: ProviderHealth;
  };
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getHealth: () => request<HealthResponse>('/api/health'),
  listRooms: () => request<RoomConfig[]>('/api/rooms'),
  getRoom: (roomId: string) => request<RoomConfig>(`/api/rooms/${roomId}`),
  createRoom: (body: {
    name: string;
    folderPath: string;
    description?: string;
    leadProvider?: CliProvider;
    theme?: RoomConfig['theme'];
  }) =>
    request<RoomConfig>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateRoom: (
    roomId: string,
    body: { name?: string; description?: string; theme?: RoomConfig['theme'] },
  ) =>
    request<RoomConfig>(`/api/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeRoom: (roomId: string) =>
    request<{ removed: boolean }>(`/api/rooms/${roomId}`, { method: 'DELETE' }),
  listFiles: (roomId: string, subPath = '') =>
    request<FileEntry[]>(
      `/api/rooms/${roomId}/files?path=${encodeURIComponent(subPath)}`,
    ),
  addAgent: (
    roomId: string,
    body: {
      name: string;
      title: string;
      provider: CliProvider;
      instructions: string;
      sprite?: string;
      skills?: string[];
      mcpServers?: string[];
    },
  ) =>
    request<AgentProfile>(`/api/rooms/${roomId}/agents`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAgent: (
    roomId: string,
    agentId: string,
    body: Partial<
      Pick<
        AgentProfile,
        'name' | 'title' | 'provider' | 'instructions' | 'skills' | 'mcpServers'
      >
    > & { sprite?: string },
  ) =>
    request<AgentProfile>(`/api/rooms/${roomId}/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeAgent: (roomId: string, agentId: string) =>
    request<{ removed: boolean }>(`/api/rooms/${roomId}/agents/${agentId}`, {
      method: 'DELETE',
    }),
  runAgent: (roomId: string, agentId: string, prompt: string) =>
    request<RunTaskResult>(`/api/rooms/${roomId}/agents/${agentId}/run`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  dispatchTask: (
    roomId: string,
    agentId: string,
    body: DispatchTaskRequest,
  ) =>
    request<DispatchTaskResponse>(
      `/api/rooms/${roomId}/agents/${agentId}/dispatch`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  passThrough: (
    roomId: string,
    agentId: string,
    body: { prompt: string; async?: boolean; isolateWorktree?: boolean },
  ) =>
    request<DispatchTaskResponse>(
      `/api/rooms/${roomId}/agents/${agentId}/pass-through`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  stopAgent: (roomId: string, agentId: string, taskId?: string) =>
    request<{ stopped: boolean }>(`/api/rooms/${roomId}/agents/${agentId}/stop`, {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }),
  listTasks: (roomId: string, limit = 30) =>
    request<TaskRecord[]>(`/api/rooms/${roomId}/tasks?limit=${limit}`),
  getTask: (roomId: string, taskId: string) =>
    request<TaskRecord>(`/api/rooms/${roomId}/tasks/${taskId}`),
  recallTaskLog: (
    roomId: string,
    taskId: string,
    opts?: { offset?: number; limit?: number; grep?: string },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.grep) qs.set('grep', opts.grep);
    const q = qs.toString();
    return request<TaskLogRecallResult>(
      `/api/rooms/${roomId}/tasks/${taskId}/log${q ? `?${q}` : ''}`,
    );
  },
  cleanupWorktree: (roomId: string, taskId: string) =>
    request<{ removed: boolean }>(
      `/api/rooms/${roomId}/tasks/${taskId}/worktree`,
      { method: 'DELETE' },
    ),
  listApprovals: (roomId: string, pendingOnly = true) =>
    request<ApprovalRequest[]>(
      `/api/rooms/${roomId}/approvals?pending=${pendingOnly ? 'true' : 'false'}`,
    ),
  resolveApproval: (
    roomId: string,
    approvalId: string,
    decision: Exclude<ApprovalStatus, 'pending'>,
    responseText?: string,
  ) =>
    request<ApprovalRequest>(
      `/api/rooms/${roomId}/approvals/${approvalId}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, responseText }),
      },
    ),
  upsertSkill: (
    roomId: string,
    body: { id: string; description?: string; content: string; enabled?: boolean },
  ) =>
    request<SkillAssignment>(`/api/rooms/${roomId}/skills`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  toggleSkill: (roomId: string, skillId: string, enabled: boolean) =>
    request<SkillAssignment>(`/api/rooms/${roomId}/skills/${skillId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  removeSkill: (roomId: string, skillId: string) =>
    request<{ removed: boolean }>(`/api/rooms/${roomId}/skills/${skillId}`, {
      method: 'DELETE',
    }),
  upsertMcp: (roomId: string, body: McpServerConfig) =>
    request<McpServerConfig>(`/api/rooms/${roomId}/mcp`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  toggleMcp: (roomId: string, serverName: string, enabled: boolean) =>
    request<McpServerConfig>(
      `/api/rooms/${roomId}/mcp/${encodeURIComponent(serverName)}`,
      { method: 'PATCH', body: JSON.stringify({ enabled }) },
    ),
  removeMcp: (roomId: string, serverName: string) =>
    request<{ removed: boolean }>(
      `/api/rooms/${roomId}/mcp/${encodeURIComponent(serverName)}`,
      { method: 'DELETE' },
    ),
};
