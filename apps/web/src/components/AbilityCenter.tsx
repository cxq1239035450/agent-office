import { useEffect, useRef, useState } from "react";
import type { RoomConfig } from "@agent-office/shared";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { CapabilityLibrary } from "./CapabilityLibrary";
import { MemberCapabilities } from "./MemberCapabilities";
import { resolveSpriteKey } from "../game/pixelSprites";
import "../styles/capabilities.css";

export type CapabilityPage = "skills" | "mcp" | "members";
export type EditGuard = { dirty: boolean; busy: boolean; stale?: boolean };
export interface EditorProps {
  room: RoomConfig;
  onRefresh: () => Promise<void>;
  onGuard: (guard: EditGuard) => void;
}
export function AbilityCenter({
  room,
  initialPage,
  agentId,
  onClose,
  onRefresh,
  onContact,
}: {
  room: RoomConfig;
  initialPage: CapabilityPage;
  agentId: string | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onContact: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(initialPage);
  const [member, setMember] = useState(agentId ?? room.leadAgentId);
  const [guard, setGuard] = useState<EditGuard>({ dirty: false, busy: false });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (guard.dirty || guard.busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guard]);
  const canLeave = () =>
    !guard.busy &&
    (!guard.dirty || window.confirm("放弃尚未保存的配置更改？")) &&
    (!guard.stale ||
      window.confirm(
        "配置已保存，但列表尚未刷新。离开后可能看到旧数据，仍要离开？",
      ));
  const navigate = (next: CapabilityPage, id = member) => {
    if (next === page && id === member) return;
    if (canLeave()) {
      setGuard({ dirty: false, busy: false });
      setPage(next);
      setMember(id);
    }
  };
  const close = () => {
    if (canLeave()) onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="ability-center"
      aria-labelledby="ability-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="ability-header">
        <div>
          <Icon name="layers" size={28} />
          <h1 id="ability-title">能力中心</h1>
        </div>
        <button className="btn" onClick={close} disabled={guard.busy}>
          <Icon name="chevron-left" size={16} />
          返回工作室
        </button>
      </header>
      <div className="ability-layout">
        <nav className="ability-nav" aria-label="能力中心导航">
          <strong
            className="ability-room"
            aria-label={`当前工作区：${room.name}`}
          >
            <Icon name="building" />
            {room.name}
          </strong>
          <p className="ability-path" title={room.folderPath}>
            {room.folderPath}
          </p>
          {(
            [
              ["skills", "spark", "工作区 Skill 库"],
              ["mcp", "plug", "工作区 MCP"],
              ["members", "team", "成员配置"],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              aria-current={page === key ? "page" : undefined}
              className={page === key ? "active" : ""}
              onClick={() => navigate(key)}
              disabled={guard.busy}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
          <label className="ability-mobile-member">
            选择成员
            <select
              className="field-input"
              aria-label="选择成员"
              value={member}
              onChange={(e) => navigate("members", e.target.value)}
              disabled={guard.busy}
            >
              {room.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.roleType === "lead" ? "主管" : "专员"} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="ability-roster">
            {(["lead", "worker"] as const).map((role) => (
              <section key={role}>
                <h2 className="ability-group-title">
                  {role === "lead" ? "主管" : "专员"}
                </h2>
                {room.agents
                  .filter((a) => a.roleType === role)
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate("members", a.id)}
                      aria-pressed={page === "members" && member === a.id}
                      aria-label={`配置${a.name}`}
                      disabled={guard.busy}
                      className={
                        page === "members" && member === a.id ? "active" : ""
                      }
                    >
                      <Character
                        id={resolveSpriteKey(
                          a.avatar?.sprite,
                          a.roleType,
                          a.provider,
                        )}
                        size={44}
                      />
                      <span>
                        {a.name}
                        <small>{a.title}</small>
                      </span>
                    </button>
                  ))}
              </section>
            ))}
          </div>
        </nav>
        <main className="ability-content">
          {page === "members" ? (
            <MemberCapabilities
              key={`${room.id}:${member}`}
              room={room}
              memberId={member}
              onGuard={setGuard}
              onRefresh={onRefresh}
              onLibrary={(mode) => navigate(mode)}
              onContact={(id) => {
                if (canLeave()) onContact(id);
              }}
            />
          ) : (
            <CapabilityLibrary
              key={`${room.id}:${page}`}
              room={room}
              mode={page}
              onGuard={setGuard}
              onRefresh={onRefresh}
              onMember={(id) => navigate("members", id)}
            />
          )}
        </main>
      </div>
    </dialog>
  );
}
