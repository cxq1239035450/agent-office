import { Module } from '@nestjs/common';
import { OfficeGateway } from './gateway/office.gateway';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';
import { RuntimeService } from './runtime/runtime.service';
import { WatchdogService } from './runtime/watchdog.service';
import { WorktreeService } from './runtime/worktree.service';
import { StateStoreService } from './store/state-store.service';
import { ConfigSyncService } from './sync/config-sync.service';

@Module({
  controllers: [RoomsController],
  providers: [
    StateStoreService,
    OfficeGateway,
    ConfigSyncService,
    WorktreeService,
    WatchdogService,
    RoomsService,
    RuntimeService,
  ],
})
export class AppModule {}
