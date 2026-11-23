import {
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
import type { McpServerConfig } from '@agent-office/shared';
import { RuntimeService } from '../runtime/runtime.service';
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

  @Post('rooms/:roomId/agents/:agentId/run')
  runAgent(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
    @Body() body: { prompt: string },
  ) {
    const room = this.roomsService.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found in room ${roomId}`);
    }
    return this.runtimeService.runAgentTask({
      room,
      agent,
      prompt: body.prompt,
    });
  }

  @Post('rooms/:roomId/agents/:agentId/stop')
  async stopAgent(
    @Param('roomId') roomId: string,
    @Param('agentId') agentId: string,
  ) {
    const room = this.roomsService.getRoom(roomId);
    const agent = room.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found in room ${roomId}`);
    }
    await this.runtimeService.stopAgentTask(agent.provider, roomId, agentId);
    return { stopped: true };
  }

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
