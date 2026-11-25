import { useState, type ReactNode } from "react";
import type {
  OfficeEvent,
  RoomConfig,
  TaskRecord,
  TaskStatus,
} from "@agent-office/shared";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { resolveSpriteKey } from "../game/pixelSprites";
import { STATUS_LABELS } from "../game/buildingModel";
import "../styles/studioTaskPanel.css";

interface Props {
  room: RoomConfig;
  tasks: TaskRecord[];
  events: OfficeEvent[];
  loading: boolean;
  error: string;
  preview: boolean;
  onRetry: () => void;
  onTasks: () => void;
  onAgent: (id: string) => void;
  children?: ReactNode;
}

type TaskRow = Pick<
  TaskRecord,
  "id" | "agentId" | "agentName" | "prompt" | "status" | "summary" | "error"
>;

const TASK_LABELS: Record<TaskStatus, string> = {
  queued: "排队中",
  running: "进行中",
  waiting_approval: "待确认",
  completed: "已完成",
  failed: "执行失败",
  stalled: "已暂停",
  cancelled: "已停止",
};
const ACTIVE_STATUSES: TaskStatus[] = ["queued", "running", "waiting_approval"];

function sampleTasks(room: RoomConfig): TaskRow[] {
  const workers = room.agents.filter((agent) => agent.id !== room.leadAgentId);
  return workers.slice(0, 3).map((agent, index) => {
    const role = agent.avatar.sprite;
    const prompt =
      role === "writer"
        ? "撰写产品介绍脚本"
        : role === "designer"
          ? "制作产品封面"
          : role === "editor"
            ? "合成产品介绍视频"
            : `整理${agent.name}的交付内容`;
    return {
      id: `preview-task-${agent.id}`,
      agentId: agent.id,
      agentName: agent.name,
      prompt,
      status: (["completed", "running", "queued"] as const)[index],
    };
  });
}

function eventTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function StudioTaskPanel({
  room,
  tasks,
  events,
  loading,
  error,
  preview,
  onRetry,
  onTasks,
  onAgent,
  children,
}: Props) {
  const [filter, setFilter] = useState<"active" | "all">("all");
  const roomTasks: TaskRow[] = preview
    ? sampleTasks(room)
    : tasks
        .filter((task) => task.roomId === room.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filtered = roomTasks.filter(
    (task) => filter === "all" || ACTIVE_STATUSES.includes(task.status),
  );
  const roomEvents = events
    .filter((event) => event.roomId === room.id)
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 4);
  const lead = room.agents.find((agent) => agent.id === room.leadAgentId);
  const previewWorker = room.agents.find(
    (agent) => agent.id !== room.leadAgentId,
  );

  return (
    <section className="studio-task-panel" aria-label="团队任务">
      <div className="studio-task-toolbar">
        <div className="studio-task-filter" role="group" aria-label="任务筛选">
          <button
            type="button"
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
          >
            进行中
          </button>
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            全部
          </button>
        </div>
        {!preview && (
          <button
            type="button"
            className="studio-task-icon"
            onClick={onRetry}
            disabled={loading}
            aria-label="刷新团队任务"
            title="刷新团队任务"
          >
            <Icon name="refresh" size={17} />
          </button>
        )}
      </div>

      {children}

      {!preview && error && (
        <div className="studio-task-error" role="alert">
          <span>加载失败：{error}</span>
          <button type="button" onClick={onRetry} disabled={loading}>
            重试
          </button>
        </div>
      )}
      <section
        className="studio-task-list"
        aria-label="当前工作区任务"
        aria-busy={loading && !preview}
      >
        {!preview && loading && !roomTasks.length ? (
          <p className="studio-task-empty" role="status">
            加载中…
          </p>
        ) : filtered.length ? (
          filtered.slice(0, 6).map((task) => {
            const agent = room.agents.find(
              (member) => member.id === task.agentId,
            );
            return (
              <article className="studio-task-row" key={task.id}>
                <div className="studio-task-row-top">
                  <Icon
                    name={task.status === "completed" ? "check" : "file"}
                    size={22}
                  />
                  <h2 title={task.prompt}>{task.prompt}</h2>
                  <span
                    className="studio-task-status"
                    data-status={task.status}
                  >
                    {TASK_LABELS[task.status]}
                  </span>
                </div>
                <div className="studio-task-owner">
                  <span className="studio-task-sr-only">负责人：</span>
                  {agent && (
                    <Character
                      id={resolveSpriteKey(
                        agent.avatar.sprite,
                        agent.roleType,
                        agent.provider,
                      )}
                      size={30}
                    />
                  )}
                  <strong title={task.agentName}>{task.agentName}</strong>
                  <button
                    type="button"
                    className="studio-task-icon"
                    disabled={!agent}
                    title={`与${task.agentName}沟通`}
                    aria-label={`与${task.agentName}沟通：${task.prompt}`}
                    onClick={() => onAgent(task.agentId)}
                  >
                    <Icon name="send" size={16} />
                  </button>
                </div>
                {(task.error || task.summary) && (
                  <p
                    className={`studio-task-summary${task.error ? " is-error" : ""}`}
                    title={task.error || task.summary}
                  >
                    {task.error || task.summary}
                  </p>
                )}
              </article>
            );
          })
        ) : !error || preview ? (
          <p className="studio-task-empty" role="status">
            {filter === "active" ? "暂无进行中任务" : "暂无任务"}
          </p>
        ) : null}
      </section>
      {!preview && roomTasks.length > 0 && (
        <button type="button" className="studio-task-more" onClick={onTasks}>
          查看全部任务
          <Icon name="arrow" size={16} />
        </button>
      )}

      <section className="studio-activity" aria-label="最近动态">
        <h2>
          <Icon name="clock" size={22} />
          最近动态
        </h2>
        {preview ? (
          <div className="studio-activity-list">
            {lead && (
              <div className="studio-activity-row">
                <Character
                  id={resolveSpriteKey(
                    lead.avatar.sprite,
                    lead.roleType,
                    lead.provider,
                  )}
                  size={36}
                />
                <p>
                  <strong>{lead.name}</strong> 正在安排团队分工
                </p>
              </div>
            )}
            {previewWorker && (
              <div className="studio-activity-row">
                <Character
                  id={resolveSpriteKey(
                    previewWorker.avatar.sprite,
                    previewWorker.roleType,
                    previewWorker.provider,
                  )}
                  size={36}
                />
                <p>
                  <strong>{previewWorker.name}</strong> 已提交交付内容
                </p>
              </div>
            )}
          </div>
        ) : roomEvents.length ? (
          <div className="studio-activity-list">
            {roomEvents.map((event) => {
              const agent = room.agents.find(
                (member) => member.id === event.agentId,
              );
              const detail = event.bubbleText || STATUS_LABELS[event.status];
              return (
                <div className="studio-activity-row" key={event.id}>
                  {agent ? (
                    <Character
                      id={resolveSpriteKey(
                        agent.avatar.sprite,
                        agent.roleType,
                        agent.provider,
                      )}
                      size={36}
                    />
                  ) : (
                    <span className="studio-activity-placeholder">
                      <Icon name="team" size={18} />
                    </span>
                  )}
                  <p title={`${agent?.name ?? "团队成员"} · ${detail}`}>
                    <strong>{agent?.name ?? "团队成员"}</strong> {detail}
                    <time dateTime={event.timestamp}>
                      {eventTime(event.timestamp)}
                    </time>
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="studio-activity-empty">暂无动态</p>
        )}
      </section>
    </section>
  );
}
