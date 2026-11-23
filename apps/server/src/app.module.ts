import { Module } from '@nestjs/common';
import { OfficeGateway } from './gateway/office.gateway';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';
import { RuntimeService } from './runtime/runtime.service';
import { ConfigSyncService } from './sync/config-sync.service';

@Module({
  controllers: [RoomsController],
  providers: [OfficeGateway, ConfigSyncService, RoomsService, RuntimeService],
})
export class AppModule {}
