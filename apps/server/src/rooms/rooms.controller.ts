import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  ApprovalStatus,
  DispatchTaskRequest,
  McpServerConfig,
} from '@agent-office/shared';
import { RuntimeService } from '../runtime/runtime.service';
import { WorktreeService } from '../runtime/worktree.service';
import {
  AddAgentDto,
  CreateRoomDto,
  RoomsService,
  UpdateAgentDto,
  UpdateRoomDto,
  UpsertSkillDto,
} from './rooms.service';

@Controller('api')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly runtimeService: RuntimeService,
    private readonly worktreeService: WorktreeService,
  ) {}

  @Get('health')
  async health() {
    const providers = await this.runtimeService.checkProviders();
    return { ok: true, providers };
  }

  @Get('rooms')
  listRooms() {
    return this.roomsService.listRooms();
  }

  @Post('rooms')
  createRoom(@Body() dto: CreateRoomDto) {
    return this.roomsService.createRoom(dto);
  }

  @Get('rooms/:roomId')
  getRoom(@Param('roomId') roomId: string) {
    return this.roomsService.getRoom(roomId);
  }

  @Patch('rooms/:roomId')
  updateRoom(@Param('roomId') roomId: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.updateRoom(roomId, dto);
  }

  @Delete('rooms/:roomId')
  removeRoom(@Param('roomId') roomId: string) {
    return this.roomsService.removeRoom(roomId);
  }

  @Get('rooms/:roomId/files')
  listFiles(
    @Param('roomId') roomId: string,
    @Query('path') subPath?: string,
  ) {
    return this.roomsService.listRoomFiles(roomId, subPath ?? '');
  }

  @Post('rooms/:roomId/agents')
  addAgent(@Param('roomId') roomId: string, @Body() dto: AddAgentDto) {
    return this.roomsService.addAgent(roomId, dto);
  }

  @Patch('rooms/:roomId/agents/:agentId')
  updateAgent(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.roomsService.updateAgent(roomId, agentId, dto);
  }

  @Delete('rooms/:roomId/agents/:agentId')
  removeAgent(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.roomsService.removeAgent(roomId, agentId);
  }

  /**
   * Backward-compatible synchronous/optional-async run endpoint.
   */
  @Post('rooms/:roomId/agents/:agentId/run')
  async runAgent(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
    @Body()
    body: {
      prompt: string;
      async?: boolean;
      routeMode?: DispatchTaskRequest['routeMode'];
      mandate?: string;
      isolateWorktree?: boolean;
      autoWakeLead?: boolean;
      parentTaskId?: string;
    },
  ) {
    const room = this.roomsService.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(
        `Agent ${agentId} not found in room ${roomId}`,
      );
    }
    if (!body?.prompt?.trim()) {
      throw new BadRequestException('prompt is required');
    }

    if (body.async) {
      const { task } = await this.runtimeService.dispatchTask(room, agent, {
        prompt: body.prompt,
        routeMode: body.routeMode,
        mandate: body.mandate,
        isolateWorktree: body.isolateWorktree,
        autoWakeLead: body.autoWakeLead,
        parentTaskId: body.parentTaskId,
        async: true,
      });
      return {
        success: true,
        output: `任务已异步派发 (taskId: ${task.id})`,
        taskId: task.id,
        logPath: task.logPath,
        worktreePath: task.worktreePath,
        worktreeBranch: task.worktreeBranch,
        task,
      };
    }

    return this.runtimeService.runAgentTask({
      room,
      agent,
      prompt: body.prompt,
      routeMode: body.routeMode,
      mandate: body.mandate,
    });
  }

  /**
   * Super-Agent Non-Blocking Dispatch & Subscription Pass-Through endpoint.
   */
  @Post('rooms/:roomId/agents/:agentId/dispatch')
  dispatchAgentTask(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
    @Body() body: DispatchTaskRequest,
  ) {
    const room = this.roomsService.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(
        `Agent ${agentId} not found in room ${roomId}`,
      );
    }
    if (!body?.prompt?.trim()) {
      throw new BadRequestException('prompt is required');
    }
    return this.runtimeService.dispatchTask(room, agent, {
      ...body,
      async: body.async ?? true,
    });
  }

  /**
   * Explicit Subscription Pass-Through Fast-Path: skips Lead Router and routes
   * directly to the target Worker's persistent session & active worktree.
   */
  @Post('rooms/:roomId/agents/:agentId/pass-through')
  passThroughToWorker(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
    @Body() body: { prompt: string; async?: boolean; isolateWorktree?: boolean },
  ) {
    const room = this.roomsService.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(
        `Agent ${agentId} not found in room ${roomId}`,
      );
    }
    if (!body?.prompt?.trim()) {
      throw new BadRequestException('prompt is required');
    }
    return this.runtimeService.dispatchTask(room, agent, {
      prompt: body.prompt,
      routeMode: 'pass_through',
      isolateWorktree: body.isolateWorktree,
      async: body.async ?? true,
    });
  }

  @Post('rooms/:roomId/agents/:agentId/stop')
  async stopAgent(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
    @Body() body?: { taskId?: string },
  ) {
    const room = this.roomsService.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(
        `Agent ${agentId} not found in room ${roomId}`,
      );
    }
    await this.runtimeService.stopAgentTask(
      agent.provider,
      roomId,
      agentId,
      body?.taskId,
    );
    return { stopped: true };
  }

  // -------------------- Tasks & Chain of Recall Endpoints --------------------

  @Get('rooms/:roomId/tasks')
  listTasks(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: string,
  ) {
    this.roomsService.getRoom(roomId);
    return this.runtimeService.listRoomTasks(
      roomId,
      limit ? Number(limit) : 50,
    );
  }

  @Get('rooms/:roomId/tasks/:taskId')
  getTask(
    @Param('roomId') roomId: string,
    @Param('taskId') taskId: string,
  ) {
    this.roomsService.getRoom(roomId);
    return this.runtimeService.getTaskOrThrow(roomId, taskId);
  }

  @Get('rooms/:roomId/tasks/:taskId/log')
  recallTaskLog(
    @Param('roomId') roomId: string,
    @Param('taskId') taskId: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('grep') grep?: string,
  ) {
    this.roomsService.getRoom(roomId);
    return this.runtimeService.recallTaskLog(roomId, taskId, {
      offsetLines: offset ? Number(offset) : undefined,
      limitLines: limit ? Number(limit) : undefined,
      grep,
    });
  }

  @Delete('rooms/:roomId/tasks/:taskId/worktree')
  async cleanupTaskWorktree(
    @Param('roomId') roomId: string,
    @Param('taskId') taskId: string,
  ) {
    const room = this.roomsService.getRoom(roomId);
    const task = this.runtimeService.getTaskOrThrow(roomId, taskId);
    if (!task.worktreePath) {
      return { removed: false };
    }
    return this.worktreeService.removeWorktree(room.folderPath, task.worktreePath);
  }

  // -------------------- Mandate / Human Approvals Endpoints --------------------

  @Get('rooms/:roomId/approvals')
  listApprovals(
    @Param('roomId') roomId: string,
    @Query('pending') pending?: string,
  ) {
    this.roomsService.getRoom(roomId);
    return this.runtimeService.listRoomApprovals(roomId, pending === 'true');
  }

  @Post('rooms/:roomId/approvals')
  requestApproval(
    @Param('roomId') roomId: string,
    @Body()
    body: {
      agentId?: string;
      taskId?: string;
      question: string;
      wait?: boolean;
      timeoutMs?: number;
    },
  ) {
    const room = this.roomsService.getRoom(roomId);
    const targetId = body.agentId ?? room.leadAgentId;
    const agent = room.agents.find((a) => a.id === targetId) ?? room.agents[0];
    if (!agent) {
      throw new NotFoundException('No agent found in room');
    }
    if (!body?.question?.trim()) {
      throw new BadRequestException('question is required');
    }
    return this.runtimeService.requestApproval(room, agent, {
      question: body.question.trim(),
      taskId: body.taskId,
      wait: body.wait,
      timeoutMs: body.timeoutMs,
    });
  }

  @Post('rooms/:roomId/approvals/:approvalId/resolve')
  resolveApproval(
    @Param('roomId') roomId: string,
    @Param('approvalId') approvalId: string,
    @Body()
    body: {
      decision: Exclude<ApprovalStatus, 'pending'>;
      responseText?: string;
    },
  ) {
    const room = this.roomsService.getRoom(roomId);
    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      throw new BadRequestException('decision must be approved or rejected');
    }
    return this.runtimeService.resolveApproval(
      room,
      approvalId,
      body.decision,
      body.responseText,
    );
  }

  // -------------------- Skills & MCP Endpoints --------------------

  @Post('rooms/:roomId/skills')
  upsertSkill(@Param('roomId') roomId: string, @Body() dto: UpsertSkillDto) {
    return this.roomsService.upsertSkill(roomId, dto);
  }

  @Patch('rooms/:roomId/skills/:skillId')
  toggleSkill(
    @Param('roomId') roomId: string,
    @Param('skillId') skillId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.roomsService.toggleSkill(roomId, skillId, body.enabled);
  }

  @Delete('rooms/:roomId/skills/:skillId')
  removeSkill(
    @Param('roomId') roomId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.roomsService.removeSkill(roomId, skillId);
  }

  @Post('rooms/:roomId/mcp')
  upsertMcp(
    @Param('roomId') roomId: string,
    @Body() body: McpServerConfig,
  ) {
    return this.roomsService.upsertMcpServer(roomId, body);
  }

  @Patch('rooms/:roomId/mcp/:serverName')
  toggleMcp(
    @Param('roomId') roomId: string,
    @Param('serverName') serverName: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.roomsService.toggleMcpServer(roomId, serverName, body.enabled);
  }

  @Delete('rooms/:roomId/mcp/:serverName')
  removeMcp(
    @Param('roomId') roomId: string,
    @Param('serverName') serverName: string,
  ) {
    return this.roomsService.removeMcpServer(roomId, serverName);
  }
}
