import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type {
  AgentProfile,
  CliProvider,
  McpServerConfig,
  RoomConfig,
  SkillAssignment,
} from '@agent-office/shared';
import { ConfigSyncService } from '../sync/config-sync.service';

export interface CreateRoomDto {
  name: string;
  folderPath: string;
  description?: string;
  leadProvider?: CliProvider;
  theme?: RoomConfig['theme'];
}

export interface UpdateRoomDto {
  name?: string;
  description?: string;
  theme?: RoomConfig['theme'];
}

export interface AddAgentDto {
  name: string;
  title: string;
  provider: CliProvider;
  instructions: string;
  sprite?: string;
  skills?: string[];
  mcpServers?: string[];
}

export interface UpdateAgentDto {
  name?: string;
  title?: string;
  provider?: CliProvider;
  instructions?: string;
  sprite?: string;
  skills?: string[];
  mcpServers?: string[];
}

export interface UpsertSkillDto {
  id: string;
  description?: string;
  content: string;
  enabled?: boolean;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

interface RegistryFile {
  roomFolders: string[];
}

@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly rooms = new Map<string, RoomConfig>();
  private readonly registryPath = resolve(
    process.cwd(),
    '..',
    '..',
    'data',
    'rooms-registry.json',
  );

  constructor(private readonly configSync: ConfigSyncService) {}

  async onModuleInit(): Promise<void> {
    await this.loadRegistry();
  }

  listRooms(): RoomConfig[] {
    return Array.from(this.rooms.values());
  }

  getRoom(roomId: string): RoomConfig {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    return room;
  }

  async createRoom(dto: CreateRoomDto): Promise<RoomConfig> {
    if (!dto.name?.trim() || !dto.folderPath?.trim()) {
      throw new BadRequestException('name and folderPath are required');
    }
    const absPath = resolve(dto.folderPath.trim());
    const metaDir = join(absPath, '.agent-office');
    await mkdir(metaDir, { recursive: true });

    // If this folder already has a room.json, load and register it instead of overwriting
    try {
      const existing = await this.loadRoomFromDisk(absPath);
      await this.saveRegistry();
      return existing;
    } catch {
      // Fresh room
    }

    const now = new Date().toISOString();
    const leadId = 'lead';
    const room: RoomConfig = {
      id: randomUUID(),
      name: dto.name.trim(),
      folderPath: absPath,
      description: dto.description?.trim() || '',
      theme: dto.theme ?? 'modern',
      leadAgentId: leadId,
      agents: [
        {
          id: leadId,
          name: `${dto.name.trim()} 主管`,
          title: 'Team Lead',
          roleType: 'lead',
          provider: dto.leadProvider ?? 'antigravity',
          instructions:
            '你是当前工作目录的主 Agent，负责理解需求、规划任务并协调房间内的子 Agent 完成工作。',
          skills: [],
          mcpServers: [],
          avatar: { sprite: 'lead', deskIndex: 0, accentColor: '#38bdf8' },
        },
      ],
      mcpServers: [],
      skills: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.persistRoom(room);
    this.rooms.set(room.id, room);
    await this.saveRegistry();
    return room;
  }

  async updateRoom(roomId: string, dto: UpdateRoomDto): Promise<RoomConfig> {
    const room = this.getRoom(roomId);
    if (dto.name !== undefined) room.name = dto.name.trim() || room.name;
    if (dto.description !== undefined) room.description = dto.description;
    if (dto.theme !== undefined) room.theme = dto.theme;
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return room;
  }

  async removeRoom(roomId: string): Promise<{ removed: boolean }> {
    const existed = this.rooms.delete(roomId);
    if (!existed) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    await this.saveRegistry();
    return { removed: true };
  }

  async listRoomFiles(roomId: string, subPath = ''): Promise<FileEntry[]> {
    const room = this.getRoom(roomId);
    const targetDir = resolve(room.folderPath, subPath);
    if (!targetDir.startsWith(room.folderPath)) {
      throw new BadRequestException('Invalid path outside room folder');
    }

    const entries = await readdir(targetDir, { withFileTypes: true });
    return entries
      .filter((e) => e.name !== 'node_modules' && e.name !== '.git')
      .map((e) => ({
        name: e.name,
        type: (e.isDirectory() ? 'dir' : 'file') as 'file' | 'dir',
        path: subPath ? `${subPath}/${e.name}` : e.name,
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async addAgent(roomId: string, dto: AddAgentDto): Promise<AgentProfile> {
    const room = this.getRoom(roomId);
    const agent: AgentProfile = {
      id: randomUUID().slice(0, 8),
      name: dto.name.trim(),
      title: dto.title.trim() || 'Worker',
      roleType: 'worker',
      provider: dto.provider,
      instructions: dto.instructions.trim(),
      skills: dto.skills ?? [],
      mcpServers: dto.mcpServers ?? [],
      avatar: {
        sprite:
          dto.sprite?.trim() ||
          (dto.provider === 'codex' ? 'developer' : 'researcher'),
        deskIndex: room.agents.length,
        accentColor: dto.provider === 'codex' ? '#34d399' : '#a78bfa',
      },
    };
    room.agents.push(agent);
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return agent;
  }

  async updateAgent(
    roomId: string,
    agentId: string,
    dto: UpdateAgentDto,
  ): Promise<AgentProfile> {
    const room = this.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
    if (dto.name !== undefined) agent.name = dto.name.trim() || agent.name;
    if (dto.title !== undefined) agent.title = dto.title.trim() || agent.title;
    if (dto.provider !== undefined) agent.provider = dto.provider;
    if (dto.instructions !== undefined) agent.instructions = dto.instructions;
    if (dto.sprite !== undefined) agent.avatar.sprite = dto.sprite;
    if (dto.skills !== undefined) agent.skills = dto.skills;
    if (dto.mcpServers !== undefined) agent.mcpServers = dto.mcpServers;

    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return agent;
  }

  async removeAgent(
    roomId: string,
    agentId: string,
  ): Promise<{ removed: boolean }> {
    const room = this.getRoom(roomId);
    if (agentId === room.leadAgentId) {
      throw new BadRequestException('Cannot delete the room lead agent');
    }
    const idx = room.agents.findIndex((a) => a.id === agentId);
    if (idx === -1) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
    room.agents.splice(idx, 1);
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return { removed: true };
  }

  async upsertSkill(
    roomId: string,
    dto: UpsertSkillDto,
  ): Promise<SkillAssignment> {
    const room = this.getRoom(roomId);
    const safeId = dto.id.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    if (!safeId) {
      throw new BadRequestException('Valid skill id is required');
    }

    const skillDir = join(room.folderPath, '.agents', 'skills', safeId);
    await mkdir(skillDir, { recursive: true });
    const skillFile = join(skillDir, 'SKILL.md');

    const markdown = dto.content.startsWith('---')
      ? dto.content
      : [
          '---',
          `name: ${safeId}`,
          `description: ${dto.description?.trim() || safeId}`,
          '---',
          '',
          dto.content,
          '',
        ].join('\n');

    await writeFile(skillFile, markdown, 'utf-8');

    const existing = room.skills.find((s) => s.id === safeId);
    if (existing) {
      existing.path = skillFile;
      if (dto.enabled !== undefined) existing.enabled = dto.enabled;
    } else {
      room.skills.push({
        id: safeId,
        path: skillFile,
        enabled: dto.enabled ?? true,
      });
    }

    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return room.skills.find((s) => s.id === safeId)!;
  }

  async toggleSkill(
    roomId: string,
    skillId: string,
    enabled: boolean,
  ): Promise<SkillAssignment> {
    const room = this.getRoom(roomId);
    const skill = room.skills.find((s) => s.id === skillId);
    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }
    skill.enabled = enabled;
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return skill;
  }

  async removeSkill(
    roomId: string,
    skillId: string,
  ): Promise<{ removed: boolean }> {
    const room = this.getRoom(roomId);
    const idx = room.skills.findIndex((s) => s.id === skillId);
    if (idx === -1) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }
    room.skills.splice(idx, 1);
    for (const agent of room.agents) {
      agent.skills = agent.skills.filter((s) => s !== skillId);
    }
    const skillDir = join(room.folderPath, '.agents', 'skills', skillId);
    await rm(skillDir, { recursive: true, force: true });
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return { removed: true };
  }

  async upsertMcpServer(
    roomId: string,
    config: McpServerConfig,
  ): Promise<McpServerConfig> {
    const room = this.getRoom(roomId);
    const name = config.name.trim();
    if (!name) {
      throw new BadRequestException('MCP server name is required');
    }

    const normalized: McpServerConfig = {
      ...config,
      name,
      enabled: config.enabled ?? true,
    };

    const idx = room.mcpServers.findIndex((s) => s.name === name);
    if (idx >= 0) {
      room.mcpServers[idx] = normalized;
    } else {
      room.mcpServers.push(normalized);
    }

    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return normalized;
  }

  async toggleMcpServer(
    roomId: string,
    serverName: string,
    enabled: boolean,
  ): Promise<McpServerConfig> {
    const room = this.getRoom(roomId);
    const srv = room.mcpServers.find((s) => s.name === serverName);
    if (!srv) {
      throw new NotFoundException(`MCP server ${serverName} not found`);
    }
    srv.enabled = enabled;
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return srv;
  }

  async removeMcpServer(
    roomId: string,
    serverName: string,
  ): Promise<{ removed: boolean }> {
    const room = this.getRoom(roomId);
    const idx = room.mcpServers.findIndex((s) => s.name === serverName);
    if (idx === -1) {
      throw new NotFoundException(`MCP server ${serverName} not found`);
    }
    room.mcpServers.splice(idx, 1);
    for (const agent of room.agents) {
      agent.mcpServers = agent.mcpServers.filter((m) => m !== serverName);
    }
    room.updatedAt = new Date().toISOString();
    await this.persistRoom(room);
    return { removed: true };
  }

  async loadRoomFromDisk(folderPath: string): Promise<RoomConfig> {
    const absPath = resolve(folderPath);
    const raw = await readFile(join(absPath, '.agent-office', 'room.json'), 'utf-8');
    const room = JSON.parse(raw) as RoomConfig;
    this.rooms.set(room.id, room);
    return room;
  }

  private async loadRegistry(): Promise<void> {
    try {
      const raw = await readFile(this.registryPath, 'utf-8');
      const data = JSON.parse(raw) as RegistryFile;
      for (const folder of data.roomFolders ?? []) {
        try {
          await this.loadRoomFromDisk(folder);
        } catch {
          // Skip missing or deleted folders gracefully
        }
      }
    } catch {
      // Registry file does not exist yet
    }
  }

  private async saveRegistry(): Promise<void> {
    const dataDir = resolve(this.registryPath, '..');
    await mkdir(dataDir, { recursive: true });
    const payload: RegistryFile = {
      roomFolders: Array.from(this.rooms.values()).map((r) => r.folderPath),
    };
    await writeFile(
      this.registryPath,
      JSON.stringify(payload, null, 2),
      'utf-8',
    );
  }

  private async persistRoom(room: RoomConfig): Promise<void> {
    const metaDir = join(room.folderPath, '.agent-office');
    await mkdir(metaDir, { recursive: true });
    await writeFile(
      join(metaDir, 'room.json'),
      JSON.stringify(room, null, 2),
      'utf-8',
    );
    await this.configSync.syncRoom(room);
  }
}
