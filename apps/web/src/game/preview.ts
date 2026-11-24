import { CHARACTER_PRESETS, type RoomConfig } from "@agent-office/shared";

/** Explicit, read-only showcase. Never written to the server or the live event store. */
export const PREVIEW_ROOMS: RoomConfig[] = [
  { name: "主控大厅", roles: ["lead", "pm"] },
  { name: "调研资料室", roles: ["researcher", "analyst", "docs"] },
  { name: "研发工作室", roles: ["developer", "reviewer", "writer"] },
  {
    name: "内容工作室",
    roles: ["editor", "designer", "voice", "ops", "community"],
  },
].map(({ name, roles }, i) => ({
  id: `preview-${i}`,
  name,
  folderPath: `示例工作空间 / ${name}`,
  theme: "modern",
  description: "设计预览 · 不会执行任务或修改本地文件",
  leadAgentId: roles[0],
  createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
  updatedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
  skills: [],
  mcpServers: [],
  agents: roles.map((id, index) => {
    const p = CHARACTER_PRESETS.find((p) => p.id === id)!;
    return {
      id,
      name: p.label,
      title: p.defaultTitle,
      provider: "codex",
      roleType: index === 0 ? "lead" : "worker",
      instructions: `负责${p.label}相关工作，与团队共同完成交付。`,
      skills: [],
      mcpServers: [],
      avatar: { sprite: id, deskIndex: index, accentColor: p.badgeColor },
    };
  }),
}));
