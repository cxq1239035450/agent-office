import { useEffect, useState } from "react";
import type {
  AgentProfile,
  AgentRuntimeState,
  AgentWorkStatus,
  RoomConfig,
} from "@agent-office/shared";
import { Character } from "./Character";
import { Icon, type IconName } from "./Icon";
import { resolveSpriteKey } from "../game/pixelSprites";
import { STATUS_LABELS } from "../game/buildingModel";
import "../styles/studioScene.css";

interface Props {
  room: RoomConfig;
  states: Record<string, AgentRuntimeState>;
  selectedAgentId: string | null;
  preview: boolean;
  onAgent: (id: string) => void;
}

const STATUS_ICONS: Record<AgentWorkStatus, IconName> = {
  idle: "clock",
  thinking: "spark",
  reading: "file",
  writing: "file",
  running_cmd: "terminal",
  calling_mcp: "plug",
  delegating: "team",
  waiting_approval: "shield",
  error: "shield",
};

function previewState(
  agent: AgentProfile,
  lead: boolean,
): { status: AgentWorkStatus; text: string } {
  if (lead) return { status: "delegating", text: "正在分派任务" };
  const sprite = agent.avatar?.sprite;
  if (sprite === "writer") return { status: "idle", text: "脚本已完成" };
  if (sprite === "designer") return { status: "writing", text: "制作封面" };
  if (sprite === "editor") return { status: "idle", text: "等待素材" };
  if (sprite === "ops")
    return { status: "waiting_approval", text: "需要你确认" };
  return { status: "reading", text: "查阅资料" };
}

/** A fixed-size view of the active team; paging never changes the office footprint. */
export function StudioScene({
  room,
  states,
  selectedAgentId,
  preview,
  onAgent,
}: Props) {
  const lead = room.agents.find((agent) => agent.id === room.leadAgentId);
  const workers = room.agents.filter((agent) => agent.id !== room.leadAgentId);
  const [page, setPage] = useState(0);
  const selectedIndex = workers.findIndex(
    (agent) => agent.id === selectedAgentId,
  );
  const pageCount = Math.max(1, Math.ceil(workers.length / 4));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleWorkers = workers.slice(visiblePage * 4, visiblePage * 4 + 4);

  useEffect(() => {
    setPage(selectedIndex < 0 ? 0 : Math.floor(selectedIndex / 4));
  }, [room.id, selectedIndex]);

  function renderAgent(agent: AgentProfile, slot: string) {
    const isLead = agent.id === room.leadAgentId;
    const runtime = states[`${room.id}:${agent.id}`];
    const example = preview ? previewState(agent, isLead) : undefined;
    const status = example?.status ?? runtime?.status ?? "idle";
    const text =
      example?.text ?? (runtime?.bubbleText?.trim() || STATUS_LABELS[status]);
    const selected = (selectedAgentId ?? room.leadAgentId) === agent.id;
    return (
      <button
        key={agent.id}
        type="button"
        className={`studio-seat studio-seat-${slot} studio-seat-${status}${selected ? " is-selected" : ""}`}
        aria-label={`与${isLead ? "主管" : "专员"}${agent.name}沟通：${text}${preview ? "（示例状态）" : ""}`}
        aria-pressed={selected}
        title={`${agent.name} · ${agent.title}
${text}`}
        onClick={() => onAgent(agent.id)}
      >
        <span className="studio-portrait-mask" aria-hidden="true">
          <Character
            id={resolveSpriteKey(
              agent.avatar?.sprite,
              agent.roleType,
              agent.provider,
            )}
            size={200}
            className="studio-portrait"
          />
        </span>
        <span className="studio-seat-label">
          <strong>{agent.name}</strong>
          <span className="studio-seat-status">
            <Icon name={STATUS_ICONS[status]} size={13} />
            <span>{text}</span>
          </span>
        </span>
      </button>
    );
  }

  return (
    <section className="studio-scene" aria-label={`${room.name}办公区`}>
      <div className="studio-scene-frame">
        <img
          className="studio-room-art"
          src="/art/studio-room.png"
          alt=""
          draggable={false}
        />
        {lead ? (
          renderAgent(lead, "lead")
        ) : (
          <span className="studio-missing-lead">暂无主管</span>
        )}
        {visibleWorkers.map((agent, index) =>
          renderAgent(agent, String(index)),
        )}
      </div>
      {workers.length > 4 && (
        <div className="studio-scene-pages">
          <span aria-live="polite">
            专员工位 {visiblePage * 4 + 1}–
            {Math.min((visiblePage + 1) * 4, workers.length)} / {workers.length}
          </span>
          <div>
            <button
              type="button"
              aria-label="上一组专员工位"
              disabled={visiblePage === 0}
              onClick={() => setPage(visiblePage - 1)}
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <span>
              {visiblePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="下一组专员工位"
              disabled={visiblePage + 1 >= pageCount}
              onClick={() => setPage(visiblePage + 1)}
            >
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
