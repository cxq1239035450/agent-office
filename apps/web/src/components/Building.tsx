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
        style={{ "--building-scale": zoom } as CSSProperties}
      >
        <button className="new-floor" onClick={onCreate}>
          <span>{rooms.length + 1}F</span>
          <Icon name="plus" size={15} />
          新建工作区
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

          {floors.map(({ room, floor }) => {
            const workingCount = preview
              ? Math.max(1, room.agents.length - 1)
              : room.agents.filter((a) => {
                  const st = states[`${room.id}:${a.id}`]?.status ?? "idle";
                  return (
                    st !== "idle" && st !== "waiting_approval" && st !== "error"
                  );
                }).length;
            const approvalCount = preview
              ? room.agents.length > 3
                ? 1
                : 0
              : room.agents.filter(
                  (a) =>
                    states[`${room.id}:${a.id}`]?.status === "waiting_approval",
                ).length;

            return (
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

                <div className="floor-badges">
                  {approvalCount > 0 && (
                    <span className="floor-population needs-approval">
                      待确认 {approvalCount}
                    </span>
                  )}
                  {workingCount > 0 && (
                    <span className="floor-population active-work">
                      工作中 {workingCount}
                    </span>
                  )}
                </div>

                <div className="floor-people">
                  {room.agents.slice(0, 6).map((agent, index) => {
                    const stateEntry = states[`${room.id}:${agent.id}`];
                    const status = preview
                      ? index === 3
                        ? "waiting_approval"
                        : "writing"
                      : (stateEntry?.status ?? "idle");
                    const label = preview
                      ? index === 3
                        ? "等待确认"
                        : "协作中"
                      : stateEntry?.bubbleText?.slice(0, 18) ||
                        STATUS_LABELS[status];
                    return (
                      <button
                        key={agent.id}
                        className={`floor-person status-${status} ${selectedAgentId === agent.id && room.id === selectedRoomId ? "selected" : ""}`}
                        onClick={() => onAgent(room.id, agent.id)}
                        aria-label={`${agent.name} · ${label}`}
                        title={stateEntry?.bubbleText || STATUS_LABELS[status]}
                      >
                        {status !== "idle" ? (
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
                  <button
                    className="more-people"
                    onClick={() => onRoom(room.id)}
                  >
                    +{room.agents.length - 6} 位成员
                  </button>
                )}
              </section>
            );
          })}

          {floors.length === 0 && (
            <section className="building-floor empty-floor">
              <div className="empty-room-message">
                <Character id="lead" size={88} />
                <h2>暂无工作区</h2>
                <button className="btn btn-primary" onClick={onCreate}>
                  <Icon name="plus" size={16} />
                  新建工作区
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
