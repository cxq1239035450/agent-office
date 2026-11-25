import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CliProvider } from '@agent-office/shared';
import { OfficeGateway } from '../gateway/office.gateway';
import { StateStoreService } from '../store/state-store.service';

export interface WatchedTaskEntry {
  taskId: string;
  roomId: string;
  agentId: string;
  provider: CliProvider;
  lastHeartbeatMs: number;
  lastPersistedMs: number;
  pausedForApproval: boolean;
  onStall: () => Promise<void> | void;
}

@Injectable()
export class WatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly watched = new Map<string, WatchedTaskEntry>();
  private timer?: ReturnType<typeof setInterval>;
  readonly checkIntervalMs: number;
  readonly stallTimeoutMs: number;

  constructor(
    private readonly stateStore: StateStoreService,
    private readonly gateway: OfficeGateway,
  ) {
    this.checkIntervalMs = Number(
      process.env.AGENT_OFFICE_WATCHDOG_INTERVAL_MS ?? 15_000,
    );
    this.stallTimeoutMs = Number(
      process.env.AGENT_OFFICE_WATCHDOG_TIMEOUT_MS ?? 120_000,
    );
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.scanOnce();
    }, this.checkIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  register(entry: {
    taskId: string;
    roomId: string;
    agentId: string;
    provider: CliProvider;
    onStall: () => Promise<void> | void;
  }): void {
    const now = Date.now();
    this.watched.set(entry.taskId, {
      ...entry,
      lastHeartbeatMs: now,
      lastPersistedMs: now,
      pausedForApproval: false,
    });
  }

  heartbeat(taskId: string, nowMs = Date.now()): void {
    const item = this.watched.get(taskId);
    if (!item) return;
    item.lastHeartbeatMs = nowMs;
    if (nowMs - item.lastPersistedMs >= 3000) {
      item.lastPersistedMs = nowMs;
      this.stateStore.touchTaskHeartbeat(taskId);
    }
  }

  setApprovalPause(taskId: string, paused: boolean): void {
    const item = this.watched.get(taskId);
    if (!item) return;
    item.pausedForApproval = paused;
    item.lastHeartbeatMs = Date.now();
  }

  unregister(taskId: string): void {
    this.watched.delete(taskId);
  }

  /**
   * Checks all active tasks for silent hangs or deadlocks and intercepts stalled processes.
   */
  async scanOnce(nowMs = Date.now()): Promise<string[]> {
    const stalledIds: string[] = [];

    for (const [taskId, item] of Array.from(this.watched.entries())) {
      if (item.pausedForApproval) continue;
      if (nowMs - item.lastHeartbeatMs <= this.stallTimeoutMs) continue;

      this.watched.delete(taskId);
      stalledIds.push(taskId);

      try {
        await item.onStall();
      } catch {
        // Ignore kill cleanup errors
      }

      const nowIso = new Date(nowMs).toISOString();
      this.stateStore.updateTask(taskId, {
        status: 'stalled',
        error: `Watchdog 检测到超过 ${Math.round(this.stallTimeoutMs / 1000)}s 无心跳输出，已自动中止卡死进程`,
        completedAt: nowIso,
        heartbeatAt: nowIso,
      });

      this.gateway.broadcast({
        id: randomUUID(),
        timestamp: nowIso,
        roomId: item.roomId,
        agentId: item.agentId,
        provider: item.provider,
        taskId,
        status: 'error',
        bubbleText: 'Watchdog: 响应超时已拦截',
        detail: `Task ${taskId} exceeded heartbeat timeout (${this.stallTimeoutMs}ms).`,
      });
    }

    return stalledIds;
  }
}
