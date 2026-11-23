export type CliProvider = 'antigravity' | 'codex';

export type AgentRoleType = 'lead' | 'worker';

export interface SkillAssignment {
  /** Skill unique ID or folder name */
  id: string;
  /** Path to SKILL.md (global or room-local) */
  path: string;
  enabled: boolean;
}

export interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
}

export interface AgentAvatarConfig {
  sprite: string;
  deskIndex: number;
  accentColor: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  title: string;
  roleType: AgentRoleType;
  provider: CliProvider;
  model?: string;
  /** Responsibility / system instructions */
  instructions: string;
  skills: string[];
  mcpServers: string[];
  avatar: AgentAvatarConfig;
}

export interface RoomConfig {
  id: string;
  name: string;
  /** Absolute path to the local workspace folder managed by this room */
  folderPath: string;
  description?: string;
  theme: 'modern' | 'retro' | 'studio';
  leadAgentId: string;
  agents: AgentProfile[];
  mcpServers: McpServerConfig[];
  skills: SkillAssignment[];
  createdAt: string;
  updatedAt: string;
}
