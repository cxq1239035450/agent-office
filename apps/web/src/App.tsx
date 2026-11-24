import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  CliProvider,
  OfficeEvent,
  RoomConfig,
} from "@agent-office/shared";
import { api, type HealthResponse } from "./api/client";
import { AgentsTab } from "./components/AgentsTab";
import { FilesLogsTab } from "./components/FilesLogsTab";
import { SkillsMcpTab } from "./components/SkillsMcpTab";
import { Building } from "./components/Building";
import { Character } from "./components/Character";
import { Icon } from "./components/Icon";
import { buildingFloors, STATUS_LABELS } from "./game/buildingModel";
import { PREVIEW_ROOMS } from "./game/preview";
import { resolveSpriteKey } from "./game/pixelSprites";
import { useOfficeStore } from "./store/officeStore";

type TabKey = "overview" | "agents" | "skills" | "mcp" | "files";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function App() {
  const {
    rooms,
    selectedRoomId,
    selectedAgentId,
    agentStates,
    recentEvents,
    setRooms,
    upsertRoom,
    removeRoomLocal,
    selectRoom,
    selectAgent,
    pushEvent,
  } = useOfficeStore();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [connection, setConnection] = useState("连接中");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [provider, setProvider] = useState<CliProvider>("codex");
  const [theme, setTheme] = useState<RoomConfig["theme"]>("modern");
  const [tab, setTab] = useState<TabKey>("overview");
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [previewRoom, setPreviewRoom] = useState("preview-3");
  const [previewAgent, setPreviewAgent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [runs, setRuns] = useState<Record<string, boolean>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [showOutput, setShowOutput] = useState(false);
  const createDialog = useRef<HTMLDialogElement>(null);
  const visibleRooms = preview ? PREVIEW_ROOMS : rooms;
  const roomId = preview ? previewRoom : selectedRoomId;
  const agentId = preview ? previewAgent : selectedAgentId;
  const selectedRoom = visibleRooms.find((r) => r.id === roomId) ?? null;
  const floors = buildingFloors(visibleRooms);
  const floorNumber = floors.find((f) => f.room.id === roomId)?.floor;
  const lead = selectedRoom?.agents.find(
    (a) => a.id === selectedRoom.leadAgentId,
  );
  const runKey = selectedRoom && lead ? `${selectedRoom.id}:${lead.id}` : "";
  const running = !!runs[runKey];
  const output = outputs[runKey];
  const events = preview ? [] : recentEvents.filter((e) => e.roomId === roomId);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    api
      .getHealth()
      .then((v) => !disposed && setHealth(v))
      .catch(() => !disposed && setHealthFailed(true));
    api
      .listRooms()
      .then((v) => !disposed && setRooms(v))
      .catch((e) => !disposed && setError(`无法加载工作区：${message(e)}`));
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/office`,
      );
      socket.onopen = () => !disposed && setConnection("实时连接");
      socket.onmessage = ({ data }) => {
        if (disposed) return;
        try {
          const e = JSON.parse(data) as OfficeEvent;
          if (e.roomId && e.agentId && e.status) pushEvent(e);
        } catch {
          /* Ignore non-event frames. */
        }
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnection("连接中断，重连中");
          retry = setTimeout(connect, 3000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [setRooms, pushEvent]);
  useEffect(() => {
    if (showCreate) createDialog.current?.showModal();
    else createDialog.current?.close();
  }, [showCreate]);
  useEffect(() => {
    setPrompt("");
    setShowOutput(false);
  }, [roomId]);
  const chooseRoom = (id: string) => {
    if (preview) {
      setPreviewRoom(id);
      setPreviewAgent(null);
    } else selectRoom(id);
    setTab("overview");
  };
  const chooseAgent = (id: string, member: string) => {
    if (preview) {
      setPreviewRoom(id);
      setPreviewAgent(member);
      setTab("overview");
    } else {
      selectAgent(id, member);
      setTab("agents");
    }
  };
  const refreshRoom = useCallback(async () => {
    if (selectedRoomId) upsertRoom(await api.getRoom(selectedRoomId));
  }, [selectedRoomId, upsertRoom]);
  async function createRoom(e: FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const created = await api.createRoom({
        name: roomName.trim(),
        folderPath: folderPath.trim(),
        leadProvider: provider,
        theme,
      });
      upsertRoom(created);
      selectRoom(created.id);
      setPreview(false);
      setTab("overview");
      setShowCreate(false);
      setRoomName("");
      setFolderPath("");
    } catch (e) {
      setError(`创建失败：${message(e)}`);
    } finally {
      setCreating(false);
    }
  }
  async function removeRoom(id: string) {
    if (!window.confirm("从大楼移除此工作区？本地工作文件会保留。")) return;
    try {
      await api.removeRoom(id);
      removeRoomLocal(id);
      setTab("overview");
    } catch (e) {
      setError(message(e));
    }
  }
  async function sendPrompt(e: FormEvent) {
    e.preventDefault();
    if (preview || !selectedRoom || !lead || !prompt.trim() || running) return;
    const key = runKey;
    const text = prompt.trim();
    setRuns((v) => ({ ...v, [key]: true }));
    setOutputs((v) => ({ ...v, [key]: "" }));
    setShowOutput(true);
    setPrompt("");
    try {
      const result = await api.runAgent(selectedRoom.id, lead.id, text);
      setOutputs((v) => ({
        ...v,
        [key]: result.success
          ? result.output || "本轮执行完成。"
          : result.error || "任务执行失败",
      }));
    } catch (e) {
      setOutputs((v) => ({ ...v, [key]: `执行失败：${message(e)}` }));
    } finally {
      setRuns((v) => ({ ...v, [key]: false }));
    }
  }
  return (
    <div className="office-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("overview");
          }}
        >
          <Icon name="building" size={30} />
          <strong>Agent 大楼</strong>
        </a>
        <span className="engine-status">
          <i
            className={
              health?.providers.codex.available ? "online-dot" : "offline-dot"
            }
          />
          Codex CLI{" "}
          {health === null
            ? healthFailed
              ? "连接失败"
              : "检测中"
            : health.providers.codex.available
              ? "可用"
              : "未检测到"}
        </span>
        <div className="header-actions">
          <button
            className={`btn ${preview ? "preview-active" : ""}`}
            onClick={() => {
              setPreview(!preview);
              setTab("overview");
            }}
          >
            <Icon name="play" size={16} />
            {preview ? "退出设计预览" : "设计预览"}
          </button>
          <button
            className="btn"
            disabled={!selectedRoom || preview}
            onClick={() => setTab("files")}
          >
            <Icon name="file" size={16} />
            任务记录
          </button>
        </div>
      </header>
      <nav className="workspace-sidebar" aria-label="工作区导航">
        <h2>
          <Icon name="layers" />
          我的工作区
        </h2>
        <button
          className="btn btn-primary create-workspace"
          onClick={() => {
            setError("");
            setShowCreate(true);
          }}
        >
          <Icon name="plus" size={18} />
          新建工作区
        </button>
        <div className="floor-nav">
          {floors.map(({ room, floor }) => (
            <button
              key={room.id}
              className={`floor-nav-item ${room.id === roomId ? "active" : ""}`}
              onClick={() => chooseRoom(room.id)}
            >
              <span className="floor-index">{floor}F</span>
              <span>
                <strong>{room.name}</strong>
                <small>
                  {room.agents.length} 位成员 ·{" "}
                  {room.skills.filter((s) => s.enabled).length} 项技能
                </small>
              </span>
            </button>
          ))}
          {!floors.length && (
            <p className="nav-empty">
              还没有工作区
              <br />
              创建房间，大楼就会增加一层。
            </p>
          )}
        </div>
        <div className="sidebar-tools">
          {(
            [
              ["skills", "spark", "技能库"],
              ["mcp", "plug", "MCP 连接"],
              ["files", "folder", "工作文件"],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              disabled={!selectedRoom || preview}
              onClick={() => setTab(key)}
            >
              <Icon name={icon} />
              {label}
              <Icon name="arrow" size={14} />
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <Icon name="folder" size={18} />
          <span>
            本地工作空间<small>{preview ? "只读设计预览" : connection}</small>
          </span>
        </div>
      </nav>
      <main className="office-main">
        <div className="stage-heading">
          <div>
            <h1>工作区总览</h1>
            <p>
              {visibleRooms.length} 个工作区 <span>·</span>{" "}
              {visibleRooms.reduce((n, r) => n + r.agents.length, 0)} 位成员
            </p>
          </div>
          <span className="stage-note">一个工作区，一层新可能</span>
        </div>
        {error && !showCreate && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {preview && (
          <div className="preview-banner">
            <Icon name="play" size={14} />
            设计预览 · 示例人物与动作，不会执行任务或写入文件
          </div>
        )}
        <Building
          rooms={visibleRooms}
          states={agentStates}
          selectedRoomId={roomId}
          selectedAgentId={agentId}
          preview={preview}
          zoom={zoom}
          onRoom={chooseRoom}
          onAgent={chooseAgent}
          onCreate={() => {
            setError("");
            setShowCreate(true);
          }}
        />
        <div className="stage-footer">
          <div className="legend">
            <span>
              <i className="offline-dot" />
              待命
            </span>
            <span>
              <i className="online-dot" />
              工作中
            </span>
            <span>
              <i className="waiting-dot" />
              等待确认
            </span>
          </div>
          <div className="zoom-controls">
            <button
              aria-label="缩小大楼"
              disabled={zoom <= 0.7}
              onClick={() => setZoom((n) => Math.max(0.7, n - 0.1))}
            >
              −
            </button>
            <button aria-label="重置缩放" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="放大大楼"
              disabled={zoom >= 1.5}
              onClick={() => setZoom((n) => Math.min(1.5, n + 0.1))}
            >
              +
            </button>
          </div>
        </div>
      </main>
      <aside className="inspector-drawer" aria-label="工作区详情">
        {selectedRoom ? (
          <>
            <header className="drawer-header">
              <div>
                <Icon name="folder" />
                <h2>
                  {floorNumber}F {selectedRoom.name}
                </h2>
                <span className="room-state">
                  {preview ? "预览" : "工作区"}
                </span>
              </div>
              <p title={selectedRoom.folderPath}>
                <Icon name="folder" size={14} />
                {selectedRoom.folderPath}
              </p>
            </header>
            <div className="tab-bar">
              {(
                [
                  ["overview", "总览"],
                  ["agents", "团队"],
                  ["skills", "技能"],
                  ["mcp", "MCP"],
                  ["files", "文件"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  disabled={preview && key !== "overview"}
                  className={`tab-btn ${tab === key ? "active" : ""}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="drawer-body" key={`${selectedRoom.id}:${tab}`}>
              {tab === "overview" && (
                <>
                  <section className="detail-section">
                    <h3>
                      <Icon name="clock" size={18} />
                      当前动态
                    </h3>
                    {preview ? (
                      <div className="task-summary">
                        <strong>{selectedRoom.name}协作预览</strong>
                        <p>
                          选择人物查看形象。创建真实工作区后，任务状态将在这里实时更新。
                        </p>
                      </div>
                    ) : events.length ? (
                      <div className="task-summary">
                        <strong>{STATUS_LABELS[events[0].status]}</strong>
                        <p>{events[0].bubbleText || "正在处理当前任务"}</p>
                        <small>
                          {new Date(events[0].timestamp).toLocaleTimeString(
                            "zh-CN",
                          )}
                        </small>
                      </div>
                    ) : (
                      <div className="task-summary">
                        <strong>团队已就位</strong>
                        <p>向主 Agent 提交需求，或选择成员直接派发任务。</p>
                      </div>
                    )}
                  </section>
                  <section className="detail-section">
                    <h3>
                      <Icon name="team" size={18} />
                      成员<span>{selectedRoom.agents.length}</span>
                    </h3>
                    <div className="member-list">
                      {selectedRoom.agents.map((a) => {
                        const status = preview
                          ? "idle"
                          : (agentStates[`${selectedRoom.id}:${a.id}`]
                              ?.status ?? "idle");
                        return (
                          <button
                            key={a.id}
                            className={`member-row ${agentId === a.id ? "selected" : ""}`}
                            onClick={() => chooseAgent(selectedRoom.id, a.id)}
                          >
                            <Character
                              id={resolveSpriteKey(
                                a.avatar?.sprite,
                                a.roleType,
                                a.provider,
                              )}
                              size={46}
                            />
                            <span>
                              <strong>{a.name}</strong>
                              <small>{a.title}</small>
                            </span>
                            <em className={`member-status status-${status}`}>
                              {preview ? "预览" : STATUS_LABELS[status]}
                            </em>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="detail-section">
                    <h3>
                      <Icon name="layers" size={18} />
                      能力配置
                    </h3>
                    <div className="capability-chips">
                      {selectedRoom.skills
                        .filter((s) => s.enabled)
                        .map((s) => (
                          <button key={s.id} onClick={() => setTab("skills")}>
                            <Icon name="spark" size={14} />
                            {s.id}
                          </button>
                        ))}
                      {selectedRoom.mcpServers
                        .filter((s) => s.enabled)
                        .map((s) => (
                          <button key={s.name} onClick={() => setTab("mcp")}>
                            <Icon name="plug" size={14} />
                            {s.name}
                          </button>
                        ))}
                      {!selectedRoom.skills.some((s) => s.enabled) &&
                        !selectedRoom.mcpServers.some((s) => s.enabled) && (
                          <p className="muted">
                            {preview
                              ? "为不同角色分配专属技能与工具。"
                              : "尚未配置技能或 MCP，可在管理面板添加。"}
                          </p>
                        )}
                    </div>
                    <button
                      className="btn btn-primary full-width"
                      disabled={preview}
                      onClick={() => setTab("agents")}
                    >
                      <Icon name="team" size={17} />
                      管理成员与能力
                    </button>
                  </section>
                  <section className="detail-section">
                    <h3>
                      <Icon name="file" size={18} />
                      工作文件
                    </h3>
                    <button
                      className="file-link"
                      disabled={preview}
                      onClick={() => setTab("files")}
                    >
                      <Icon name="folder" size={18} />
                      <span>浏览工作区文件</span>
                      <Icon name="arrow" size={16} />
                    </button>
                  </section>
                </>
              )}
              {!preview && tab === "agents" && (
                <AgentsTab
                  room={selectedRoom}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={(id) => selectAgent(selectedRoom.id, id)}
                  onRefreshRoom={refreshRoom}
                />
              )}
              {!preview && (tab === "skills" || tab === "mcp") && (
                <SkillsMcpTab
                  room={selectedRoom}
                  mode={tab}
                  onRefreshRoom={refreshRoom}
                />
              )}
              {!preview && tab === "files" && (
                <FilesLogsTab
                  room={selectedRoom}
                  events={recentEvents}
                  onRefreshRoom={refreshRoom}
                  onRemoveRoom={removeRoom}
                />
              )}
            </div>
          </>
        ) : (
          <div className="inspector-empty">
            <Character size={110} />
            <h2>欢迎来到你的 Agent 大楼</h2>
            <p>
              每层楼连接一个本地文件夹。
              <br />
              为成员分配职责，让工作有序展开。
            </p>
            <button className="btn" onClick={() => setPreview(true)}>
              先看看办公室
            </button>
          </div>
        )}
      </aside>
      <footer className="command-dock">
        <div className="lead-info">
          <Character
            id={
              lead
                ? resolveSpriteKey(
                    lead.avatar?.sprite,
                    lead.roleType,
                    lead.provider,
                  )
                : "lead"
            }
            size={57}
          />
          <div>
            <strong>{lead?.name || "主 Agent"}</strong>
            <small>
              <i className={running ? "online-dot" : "offline-dot"} />
              {preview
                ? "设计预览，不执行任务"
                : running
                  ? "正在处理你的需求…"
                  : selectedRoom
                    ? `负责 ${selectedRoom.name}`
                    : "创建工作区后开始协作"}
            </small>
          </div>
        </div>
        <form onSubmit={sendPrompt}>
          <input
            aria-label="给主 Agent 的任务"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="告诉主 Agent，你希望团队完成什么…"
            disabled={preview || !lead || running}
          />
          <button
            className="send-button"
            aria-label="发送任务"
            disabled={preview || !lead || running || !prompt.trim()}
          >
            <Icon name="send" size={19} />
          </button>
        </form>
        {running && (
          <button
            className="btn"
            onClick={() =>
              selectedRoom &&
              lead &&
              api
                .stopAgent(selectedRoom.id, lead.id)
                .catch((e) => setError(message(e)))
            }
          >
            停止
          </button>
        )}
        <button
          className="output-toggle"
          disabled={!output && !running}
          onClick={() => setShowOutput(!showOutput)}
        >
          <Icon name="file" size={17} />
          执行结果
        </button>
        {showOutput && (output || running) && (
          <div className="output-popover">
            <div>
              <strong>本轮执行结果</strong>
              <button
                aria-label="收起执行结果"
                onClick={() => setShowOutput(false)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <pre>{output || "正在执行，实时状态显示在当前楼层。"}</pre>
          </div>
        )}
      </footer>
      <dialog
        ref={createDialog}
        className="create-dialog"
        onCancel={(e) => {
          if (creating) e.preventDefault();
          else setShowCreate(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !creating) setShowCreate(false);
        }}
      >
        <form onSubmit={createRoom}>
          <header>
            <span className="dialog-icon">
              <Icon name="building" size={24} />
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭新建工作区"
              disabled={creating}
              onClick={() => setShowCreate(false)}
            >
              <Icon name="close" />
            </button>
          </header>
          <h2>为你的团队，添一层新空间</h2>
          <p>每个工作区都有独立的目录、成员和能力配置。</p>
          <label>
            工作区名称
            <input
              className="field-input"
              autoFocus
              required
              maxLength={60}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="例如：内容工作室"
            />
          </label>
          <label>
            本地文件夹路径
            <input
              className="field-input"
              required
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="例如：E:\workspaces\content"
            />
          </label>
          <div className="form-columns">
            <label>
              主 Agent 引擎
              <select
                className="field-input"
                value={provider}
                onChange={(e) => setProvider(e.target.value as CliProvider)}
              >
                <option value="codex">Codex CLI</option>
                <option value="antigravity">Antigravity CLI</option>
              </select>
            </label>
            <label>
              房间氛围
              <select
                className="field-input"
                value={theme}
                onChange={(e) =>
                  setTheme(e.target.value as RoomConfig["theme"])
                }
              >
                <option value="modern">暖木办公室</option>
                <option value="retro">复古资料室</option>
                <option value="studio">创意工作室</option>
              </select>
            </label>
          </div>
          <div className="floor-notice">
            <Icon name="layers" size={17} />
            创建后将在楼顶新增 {rooms.length + 1}F
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-primary full-width"
            disabled={creating || !roomName.trim() || !folderPath.trim()}
          >
            <Icon name="plus" size={17} />
            {creating ? "正在创建工作区…" : "创建并新增楼层"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
