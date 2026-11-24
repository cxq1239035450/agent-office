import { useEffect, useRef, type CSSProperties } from "react";
import type { AgentRuntimeState, RoomConfig } from "@agent-office/shared";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { buildingFloors, STATUS_LABELS } from "../game/buildingModel";
import { resolveSpriteKey } from "../game/pixelSprites";

interface Props {
  rooms: RoomConfig[];
  states: Record<string, AgentRuntimeState>;
  selectedRoomId: string | null;
  selectedAgentId: string | null;
  zoom: number;
  preview: boolean;
  onRoom: (id: string) => void;
  onAgent: (room: string, agent: string) => void;
  onCreate: () => void;
}
export function Building({
  rooms,
  states,
  selectedRoomId,
  selectedAgentId,
  zoom,
  preview,
  onRoom,
  onAgent,
  onCreate,
}: Props) {
  const floors = buildingFloors(rooms);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selected = root.current?.querySelector<HTMLElement>(
      '[data-selected="true"]',
    );
    selected?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [selectedRoomId]);
  return (
    <div className="building-viewport" ref={root}>
      <div
        className="building"
        style={{ "--building-width": `${zoom * 100}%` } as CSSProperties}
      >
        <button className="new-floor" onClick={onCreate}>
          <span>{rooms.length + 1}F</span>
          <Icon name="plus" size={16} /> 创建工作区，增加一层
        </button>
        <div className="building-floors">
          <div className="elevator-shaft" aria-hidden="true">
            <div className="elevator-rail" />
            <div
              className="elevator-car"
              style={{
                top: `${
                  (Math.max(
                    0,
                    floors.findIndex((f) => f.room.id === selectedRoomId),
                  ) *
                    100) /
                  Math.max(floors.length, 1)
                }%`,
              }}
            >
              <span />
              <span />
            </div>
          </div>
          {floors.map(({ room, floor }) => (
            <section
              key={room.id}
              className={`building-floor theme-${room.theme} ${room.id === selectedRoomId ? "selected" : ""}`}
              data-selected={room.id === selectedRoomId}
              style={
                {
                  "--occupants": Math.min(room.agents.length, 6),
                } as CSSProperties
              }
            >
              <button
                className="floor-hit"
                aria-label={`选择 ${floor}F ${room.name}`}
                onClick={() => onRoom(room.id)}
              />
              <button className="floor-label" onClick={() => onRoom(room.id)}>
                <b>{floor}F</b>
                <span>{room.name}</span>
              </button>
              <span className="floor-population">
                {room.agents.length} 位成员
              </span>
              <div className="floor-people">
                {room.agents.slice(0, 6).map((agent, index) => {
                  const status = preview
                    ? index === 3
                      ? "waiting_approval"
                      : "writing"
                    : (states[`${room.id}:${agent.id}`]?.status ?? "idle");
                  const label = preview ? "动作预览" : STATUS_LABELS[status];
                  return (
                    <button
                      key={agent.id}
                      className={`floor-person status-${status} ${selectedAgentId === agent.id && room.id === selectedRoomId ? "selected" : ""}`}
                      onClick={() => onAgent(room.id, agent.id)}
                      aria-label={`${agent.name} · ${label}`}
                      title={
                        states[`${room.id}:${agent.id}`]?.bubbleText || label
                      }
                    >
                      {index === 0 ||
                      status === "waiting_approval" ||
                      status === "error" ? (
                        <span className="person-bubble">
                          <i />
                          {label}
                        </span>
                      ) : null}
                      <Character
                        id={resolveSpriteKey(
                          agent.avatar?.sprite,
                          agent.roleType,
                          agent.provider,
                        )}
                        className="floor-sprite"
                        size={76}
                      />
                      <span className="person-name">{agent.name}</span>
                    </button>
                  );
                })}
              </div>
              {room.agents.length > 6 && (
                <button className="more-people" onClick={() => onRoom(room.id)}>
                  另有 {room.agents.length - 6} 位成员 · 查看团队
                </button>
              )}
            </section>
          ))}
          {floors.length === 0 && (
            <section className="building-floor empty-floor">
              <div className="empty-room-message">
                <Character id="lead" size={90} />
                <h2>你的团队，从这一层开始</h2>
                <p>绑定本地文件夹，建立第一个工作区。</p>
                <button className="btn btn-primary" onClick={onCreate}>
                  <Icon name="plus" size={16} />
                  创建第一个工作区
                </button>
              </div>
            </section>
          )}
        </div>
        <div className="building-foundation" />
      </div>
    </div>
  );
}
