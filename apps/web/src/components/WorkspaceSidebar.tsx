import { useId, useLayoutEffect, useRef, useState } from "react";
import type {
  AgentProfile,
  AgentRuntimeState,
  RoomConfig,
} from "@agent-office/shared";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { buildingFloors, STATUS_LABELS } from "../game/buildingModel";
import { resolveSpriteKey } from "../game/pixelSprites";
import "../styles/workspaceSidebar.css";

export interface WorkspaceSidebarProps {
  rooms: RoomConfig[];
  selectedRoom: RoomConfig | null;
  selectedAgentId: string | null;
  states: Record<string, AgentRuntimeState>;
  preview: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onRoom: (id: string) => void;
  onAgent: (id: string) => void;
  onCreate: () => void;
  onOverview: () => void;
  onCapability: (page: "skills" | "mcp") => void;
}

function SidebarMember({
  agent,
  state,
  lead,
  selected,
  preview,
  onSelect,
}: {
  agent: AgentProfile;
  state?: AgentRuntimeState;
  lead: boolean;
  selected: boolean;
  preview: boolean;
  onSelect: () => void;
}) {
  const status = preview ? "idle" : (state?.status ?? "idle");
  const statusLabel = preview ? "预览" : STATUS_LABELS[status];
  return (
    <button
      type="button"
      className={`studio-sidebar__member ${lead ? "is-lead" : ""} ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`与${lead ? "主管" : "专员"}${agent.name}沟通，${statusLabel}`}
      title={`${agent.name} · ${agent.title || (lead ? "主管" : "专员")} · ${preview ? statusLabel : state?.bubbleText || statusLabel}`}
      onClick={onSelect}
    >
      <Character
        id={resolveSpriteKey(
          agent.avatar?.sprite,
          agent.roleType,
          agent.provider,
        )}
        size={50}
        className="studio-sidebar__avatar"
      />
      <span className="studio-sidebar__member-copy">
        <span className="studio-sidebar__member-name">
          <i
            className={`studio-sidebar__status status-${status}`}
            aria-hidden="true"
          />
          <strong>{agent.name}</strong>
        </span>
        {!preview && status !== "idle" && (
          <span className="studio-sidebar__activity">
            {state?.bubbleText || statusLabel}
          </span>
        )}
      </span>
      {(status === "waiting_approval" || status === "error" || !lead) && (
        <span className="studio-sidebar__member-action" aria-hidden="true">
          {status === "waiting_approval" || status === "error" ? (
            <span className={`studio-sidebar__attention status-${status}`}>
              !
            </span>
          ) : (
            <Icon name="send" size={15} />
          )}
        </span>
      )}
    </button>
  );
}

const normalizeSearch = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\\/g, "/");

function isOutsideDialog(event: {
  currentTarget: HTMLDialogElement;
  clientX: number;
  clientY: number;
}) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}

export function WorkspaceSidebar({
  rooms,
  selectedRoom,
  selectedAgentId,
  states,
  preview,
  collapsed,
  onToggle,
  onRoom,
  onAgent,
  onCreate,
  onOverview,
  onCapability,
}: WorkspaceSidebarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const outsidePress = useRef(false);
  const dialogId = useId();
  const titleId = useId();
  const floors = buildingFloors(rooms);
  const selectedFloor = floors.find(
    ({ room }) => room.id === selectedRoom?.id,
  )?.floor;
  const query = normalizeSearch(search);
  const filteredFloors = floors.filter(({ room }) =>
    normalizeSearch(`${room.name}\n${room.folderPath}`).includes(query),
  );
  const lead = selectedRoom?.agents.find(
    (agent) => agent.id === selectedRoom.leadAgentId,
  );
  const specialists =
    selectedRoom?.agents.filter((agent) => agent.id !== lead?.id) ?? [];
  const activeAgentId = selectedRoom?.agents.some(
    (agent) => agent.id === selectedAgentId,
  )
    ? selectedAgentId
    : lead?.id;

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!switcherOpen || !panel) return;
    if (!panel.open) panel.showModal();
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      panel.style.width = `${Math.min(440, width - 24)}px`;
      panel.style.maxHeight = `${Math.min(620, height - 24)}px`;
      const bounds = panel.getBoundingClientRect();
      const beside =
        width >= 800 && anchor.right + bounds.width + 24 <= offsetLeft + width;
      panel.style.left = `${beside ? anchor.right + 12 : offsetLeft + (width - bounds.width) / 2}px`;
      panel.style.top = `${
        offsetTop +
        Math.max(
          12,
          beside
            ? Math.min(anchor.top - offsetTop, height - bounds.height - 12)
            : (height - bounds.height) / 2,
        )
      }px`;
    };
    position();
    searchInput.current?.focus({ preventScroll: true });
    list.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest" });
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      if (panel.open) panel.close();
    };
  }, [switcherOpen]);

  const closeSwitcher = () => {
    dialog.current?.close();
    setSwitcherOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const openSwitcher = () => {
    setSearch("");
    outsidePress.current = false;
    setSwitcherOpen(true);
  };
  const chooseRoom = (id: string) => {
    closeSwitcher();
    if (id !== selectedRoom?.id) onRoom(id);
  };

  return (
    <nav
      className={`studio-sidebar ${collapsed ? "is-collapsed" : ""}`}
      aria-label="工作区与团队导航"
    >
      <div className="studio-sidebar__top">
        <h2>
          <Icon name="layers" size={21} />
          <span>工作区</span>
          <span className="studio-sidebar__count">{rooms.length}</span>
        </h2>
        <button
          type="button"
          className="studio-sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? "展开导航" : "收起导航"}
          title={collapsed ? "展开导航" : "收起导航"}
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? "chevron-right" : "panel-left"} size={17} />
        </button>
      </div>

      <div className="studio-sidebar__workspace">
        <button
          ref={trigger}
          type="button"
          className="studio-sidebar__switcher"
          onClick={openSwitcher}
          aria-haspopup="dialog"
          aria-expanded={switcherOpen}
          aria-controls={dialogId}
          aria-label={`切换工作区，当前${selectedRoom?.name ?? "未选择工作区"}`}
          title={
            selectedRoom
              ? `${selectedRoom.name}\n${selectedRoom.folderPath}`
              : "选择或创建工作区"
          }
        >
          <Icon name="building" size={23} />
          <span className="studio-sidebar__workspace-copy">
            <span className="studio-sidebar__workspace-name">
              {selectedFloor !== undefined && (
                <b className="studio-sidebar__floor">{selectedFloor}F</b>
              )}
              <strong>{selectedRoom?.name ?? "选择工作区"}</strong>
            </span>
          </span>
          <span className="studio-sidebar__switcher-chevron">
            <Icon name="chevron-right" size={16} />
          </span>
        </button>
      </div>

      <section className="studio-sidebar__team" aria-label="团队成员">
        <div className="studio-sidebar__lead">
          <h2>
            <Icon name="shield" size={16} />
            <span>主管</span>
          </h2>
          {lead && selectedRoom ? (
            <SidebarMember
              agent={lead}
              state={states[`${selectedRoom.id}:${lead.id}`]}
              lead
              selected={activeAgentId === lead.id}
              preview={preview}
              onSelect={() => onAgent(lead.id)}
            />
          ) : (
            <p className="studio-sidebar__empty">
              {selectedRoom ? "暂无主管" : "未选择工作区"}
            </p>
          )}
        </div>
        <div className="studio-sidebar__specialists">
          <h2>
            <Icon name="team" size={16} />
            <span>专员</span>
            <span className="studio-sidebar__count">{specialists.length}</span>
          </h2>
          <div
            className="studio-sidebar__roster"
            key={selectedRoom?.id ?? "empty"}
            role="list"
            aria-label="专员列表"
          >
            {specialists.map((agent) => (
              <div key={agent.id} role="listitem">
                <SidebarMember
                  agent={agent}
                  state={
                    selectedRoom
                      ? states[`${selectedRoom.id}:${agent.id}`]
                      : undefined
                  }
                  lead={false}
                  selected={activeAgentId === agent.id}
                  preview={preview}
                  onSelect={() => onAgent(agent.id)}
                />
              </div>
            ))}
            {selectedRoom && specialists.length === 0 && (
              <p className="studio-sidebar__empty">暂无专员</p>
            )}
          </div>
        </div>
      </section>

      <div className="studio-sidebar__capabilities" aria-label="工作区能力配置">
        <button
          type="button"
          disabled={preview || !selectedRoom}
          onClick={() => onCapability("skills")}
          title={preview ? "预览模式下不可配置" : "配置工作区 Skills"}
          aria-label="配置工作区 Skills"
        >
          <Icon name="layers" size={25} />
          <span>Skills</span>
        </button>
        <button
          type="button"
          disabled={preview || !selectedRoom}
          onClick={() => onCapability("mcp")}
          title={preview ? "预览模式下不可配置" : "配置工作区 MCP"}
          aria-label="配置工作区 MCP"
        >
          <Icon name="plug" size={25} />
          <span>MCP</span>
        </button>
      </div>

      <dialog
        ref={dialog}
        id={dialogId}
        className="studio-workspace-dialog"
        aria-labelledby={titleId}
        onClose={() => setSwitcherOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          closeSwitcher();
        }}
        onPointerDown={(event) => {
          outsidePress.current =
            event.target === event.currentTarget && isOutsideDialog(event);
        }}
        onClick={(event) => {
          if (
            outsidePress.current &&
            event.target === event.currentTarget &&
            isOutsideDialog(event)
          )
            closeSwitcher();
          outsidePress.current = false;
        }}
      >
        <header className="studio-workspace-dialog__header">
          <h2 id={titleId}>切换工作区</h2>
          <span role="status" aria-live="polite" aria-atomic="true">
            {query
              ? `${filteredFloors.length} / ${rooms.length}`
              : rooms.length}
          </span>
          <button
            type="button"
            className="studio-workspace-dialog__close"
            onClick={closeSwitcher}
            aria-label="关闭工作区列表"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="studio-workspace-dialog__search">
          <Icon name="search" size={20} />
          <input
            ref={searchInput}
            type="search"
            value={search}
            placeholder="搜索名称或目录"
            aria-label="搜索工作区名称或目录"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeSwitcher();
              }
            }}
            onChange={(event) => {
              setSearch(event.target.value);
              if (list.current) list.current.scrollTop = 0;
            }}
          />
        </div>
        <div
          ref={list}
          className="studio-workspace-dialog__list"
          role="list"
          aria-label="工作区列表"
        >
          {filteredFloors.map(({ room, floor }) => (
            <div key={room.id} role="listitem">
              <button
                type="button"
                className="studio-workspace-dialog__room"
                onClick={() => chooseRoom(room.id)}
                aria-pressed={room.id === selectedRoom?.id}
                title={`${room.name}\n${room.folderPath}`}
              >
                <Icon name="building" size={23} />
                <span className="studio-workspace-dialog__room-copy">
                  <span>
                    <b className="studio-sidebar__floor">{floor}F</b>
                    <strong>{room.name}</strong>
                  </span>
                  <small>{room.folderPath}</small>
                </span>
                {room.id === selectedRoom?.id && (
                  <span className="studio-workspace-dialog__selected">
                    <Icon name="check" size={20} />
                    <span className="studio-sidebar__sr-only">当前工作区</span>
                  </span>
                )}
              </button>
            </div>
          ))}
          {filteredFloors.length === 0 && (
            <div className="studio-workspace-dialog__empty">
              <Icon name={rooms.length ? "search" : "building"} size={28} />
              <strong>
                {rooms.length ? "没有匹配的工作区" : "还没有工作区"}
              </strong>
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    searchInput.current?.focus();
                  }}
                >
                  清空搜索
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="studio-workspace-dialog__footer">
          <button
            type="button"
            disabled={preview}
            title={preview ? "预览模式下不可新建" : undefined}
            onClick={() => {
              closeSwitcher();
              onCreate();
            }}
          >
            <Icon name="plus" size={19} />
            新建工作区
          </button>
          <button
            type="button"
            onClick={() => {
              closeSwitcher();
              onOverview();
            }}
          >
            大楼总览
            <Icon name="arrow" size={17} />
          </button>
        </footer>
      </dialog>
    </nav>
  );
}
