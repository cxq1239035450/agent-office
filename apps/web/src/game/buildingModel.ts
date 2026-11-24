import type { AgentWorkStatus, RoomConfig } from "@agent-office/shared";

export const STATUS_LABELS: Record<AgentWorkStatus, string> = {
  idle: "待命",
  thinking: "处理中",
  reading: "查阅资料",
  writing: "制作中",
  running_cmd: "执行命令",
  calling_mcp: "调用工具",
  delegating: "协调任务",
  waiting_approval: "等待确认",
  error: "遇到问题",
};

/** Creation order is stable across updates; the newest room is always the highest floor. */
export function buildingFloors(rooms: RoomConfig[]) {
  return [...rooms]
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((room, index) => ({ room, floor: index + 1 }))
    .reverse();
}
