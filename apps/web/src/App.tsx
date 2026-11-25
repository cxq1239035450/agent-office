import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ApprovalRequest,
  CliProvider,
  OfficeEvent,
  RoomConfig,
  TaskRecord,
} from "@agent-office/shared";
import { api, type HealthResponse } from "./api/client";
import { AgentsTab } from "./components/AgentsTab";
import { FilesLogsTab } from "./components/FilesLogsTab";
import { AbilityCenter, type CapabilityPage } from "./components/AbilityCenter";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { StudioScene } from "./components/StudioScene";
import { StudioTaskPanel } from "./components/StudioTaskPanel";
import "./styles/studioHome.css";
import { Building } from "./components/Building";
import { Character } from "./components/Character";
import { Icon } from "./components/Icon";
import { PREVIEW_ROOMS } from "./game/preview";
import { resolveSpriteKey } from "./game/pixelSprites";
import { useOfficeStore } from "./store/officeStore";

type TabKey = "overview" | "agents" | "skills" | "mcp" | "files";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function readPersistedBool(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

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

  const [leftCollapsed, setLeftCollapsed] = useState(() =>
    readPersistedBool("agent_office_left_collapsed", false),
  );
  const [rightCollapsed, setRightCollapsed] = useState(
    () =>
      window.matchMedia("(max-width: 1100px)").matches ||
      readPersistedBool("agent_office_right_collapsed", false),
  );

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1100px)");
    const collapse = () => {
      if (compact.matches) setRightCollapsed(true);
    };
    compact.addEventListener("change", collapse);
    return () => compact.removeEventListener("change", collapse);
  }, []);

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
  const [capabilityPage, setCapabilityPage] = useState<CapabilityPage | null>(
    null,
  );
  const [view, setView] = useState<"studio" | "building">("studio");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [taskRoomId, setTaskRoomId] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");
  const [taskRevision, setTaskRevision] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [previewRoom, setPreviewRoom] = useState("preview-3");
  const [previewAgent, setPreviewAgent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [runs, setRuns] = useState<Record<string, boolean>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [showOutput, setShowOutput] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>(
    {},
  );
  const createDialog = useRef<HTMLDialogElement>(null);

  const toggleLeft = () =>
    setLeftCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("agent_office_left_collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  const toggleRight = (forceOpen?: boolean) =>
    setRightCollapsed((prev) => {
      const next = forceOpen !== undefined ? !forceOpen : !prev;
      try {
        localStorage.setItem("agent_office_right_collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  const visibleRooms = preview ? PREVIEW_ROOMS : rooms;
  const roomId = preview ? previewRoom : selectedRoomId;
  const agentId = preview ? previewAgent : selectedAgentId;
  const selectedRoom = visibleRooms.find((r) => r.id === roomId) ?? null;
  const lead = selectedRoom?.agents.find(
    (a) => a.id === selectedRoom.leadAgentId,
  );
  const selectedMember = selectedRoom?.agents.find((a) => a.id === agentId);
  const dockAgent = selectedMember ?? lead;
  const isPassThrough = Boolean(dockAgent && lead && dockAgent.id !== lead.id);
  const runKey =
    selectedRoom && dockAgent ? `${selectedRoom.id}:${dockAgent.id}` : "";
  const dockRuntime = runKey ? agentStates[runKey] : undefined;
  const running =
    !!runs[runKey] ||
    Boolean(
      !preview &&
      dockRuntime &&
      dockRuntime.status !== "idle" &&
      dockRuntime.status !== "error",
    );
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
          setConnection("重连中…");
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

  useEffect(() => {
    if (preview || !selectedRoomId) {
      setApprovals([]);
      return;
    }
    let cancelled = false;
    setApprovals([]);
    api
      .listApprovals(selectedRoomId, true)
      .then((items) => {
        if (!cancelled) setApprovals(items);
      })
      .catch(() => {
        /* Ignore background approval polling errors */
      });
    return () => {
      cancelled = true;
    };
  }, [preview, selectedRoomId, recentEvents[0]?.timestamp]);

  const openInspectorTab = (targetTab: TabKey) => {
    if (targetTab === "skills" || targetTab === "mcp") {
      setCapabilityPage(targetTab);
      return;
    }
    setTab(targetTab);
    if (rightCollapsed) toggleRight(true);
  };

  const chooseRoom = (id: string) => {
    if (
      id !== roomId &&
      prompt.trim() &&
      !window.confirm("切换工作区会放弃当前未发送的内容，继续？")
    )
      return false;
    if (id !== roomId) {
      setPrompt("");
      setShowOutput(false);
      if (preview) {
        setPreviewRoom(id);
        setPreviewAgent(null);
      } else selectRoom(id);
    }
    setView("studio");
    setTab("overview");
    return true;
  };

  const chooseAgent = (id: string, member: string) => {
    if (
      (id !== roomId || member !== dockAgent?.id) &&
      prompt.trim() &&
      !window.confirm("切换沟通对象会放弃当前未发送的内容，继续？")
    )
      return false;
    if (id !== roomId || member !== dockAgent?.id) {
      setPrompt("");
      setShowOutput(false);
    }
    if (preview) {
      setPreviewRoom(id);
      setPreviewAgent(member);
    } else selectAgent(id, member);
    setView("studio");
    setTab("overview");
    return true;
  };

  const refreshRoom = useCallback(async () => {
    if (selectedRoomId) upsertRoom(await api.getRoom(selectedRoomId));
  }, [selectedRoomId, upsertRoom]);

  async function handleResolveApproval(
    approvalId: string,
    decision: "approved" | "rejected",
  ) {
    if (!selectedRoomId) return;
    try {
      await api.resolveApproval(
        selectedRoomId,
        approvalId,
        decision,
        approvalNotes[approvalId]?.trim() || undefined,
      );
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    } catch (e) {
      setError(`处理审批失败：${message(e)}`);
    }
  }

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
      setView("studio");
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
    if (preview || !selectedRoom || !dockAgent || !prompt.trim()) return;
    const key = runKey;
    const text = prompt.trim();
    setRuns((v) => ({ ...v, [key]: true }));
    setShowOutput(true);
    setPrompt("");
    try {
      const { task } = await api.dispatchTask(selectedRoom.id, dockAgent.id, {
        prompt: text,
        routeMode: isPassThrough ? "pass_through" : "router",
        isolateWorktree: isPassThrough,
        async: true,
      });
      setTaskRevision((value) => value + 1);
      const wtLine = task.worktreeBranch
        ? `\n分支: ${task.worktreeBranch}`
        : "";
      setOutputs((v) => ({
        ...v,
        [key]: `已发送给 ${dockAgent.name}\n任务: ${task.id}${wtLine}`,
      }));
    } catch (e) {
      setOutputs((v) => ({ ...v, [key]: `派发失败：${message(e)}` }));
    } finally {
      setRuns((v) => ({ ...v, [key]: false }));
    }
  }

  const shellClass = [
    "office-shell studio-home",
    leftCollapsed ? "left-collapsed" : "",
    rightCollapsed ? "right-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pendingApprovals = approvals.filter(
    (approval) => approval.roomId === roomId,
  );
  const visibleTasks =
    taskRoomId === roomId
      ? tasks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];
  const lastTask =
    visibleTasks.find((task) => task.agentId === dockAgent?.id) ??
    visibleTasks[0];
  const latestEvent = recentEvents.find(
    (event) => event.roomId === selectedRoomId,
  )?.timestamp;
  useEffect(() => {
    let cancelled = false;
    if (preview || !selectedRoomId) {
      setTasks([]);
      setTaskRoomId(null);
      setTasksError("");
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    setTasksError("");
    api
      .listTasks(selectedRoomId, 30)
      .then((records) => {
        if (!cancelled) {
          setTasks(records);
          setTaskRoomId(selectedRoomId);
        }
      })
      .catch((error) => {
        if (!cancelled) setTasksError(message(error));
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId, preview, latestEvent, taskRevision]);

  const startCreate = () => {
    if (
      prompt.trim() &&
      !window.confirm("创建并进入新工作区会放弃当前未发送的内容，继续？")
    )
      return;
    setError("");
    setShowCreate(true);
  };
  const togglePreview = () => {
    if (
      prompt.trim() &&
      !window.confirm("切换预览会放弃当前未发送的内容，继续？")
    )
      return;
    setPrompt("");
    setShowOutput(false);
    setPreview((value) => !value);
    setView("studio");
    setTab("overview");
  };

  return (
    <div className={shellClass}>
      {capabilityPage && selectedRoom && !preview && (
        <AbilityCenter
          key={selectedRoom.id}
          room={selectedRoom}
          initialPage={capabilityPage}
          agentId={selectedAgentId}
          onClose={() => setCapabilityPage(null)}
          onRefresh={refreshRoom}
          onContact={(id) => {
            if (chooseAgent(selectedRoom.id, id)) setCapabilityPage(null);
          }}
        />
      )}
      <header className="app-header studio-header">
        <button
          type="button"
          className="btn-icon"
          onClick={toggleLeft}
          aria-label={leftCollapsed ? "展开工作区导航" : "收起工作区导航"}
        >
          <Icon name="panel-left" />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("building");
          }}
        >
          <span className="brand-mark">
            <Icon name="layers" size={27} />
          </span>
          <strong>Agent Office</strong>
        </a>
        <div className="header-actions">
          {pendingApprovals.length > 0 && (
            <button
              className="btn studio-attention"
              onClick={() => openInspectorTab("overview")}
            >
              <Icon name="shield" />
              待确认 {pendingApprovals.length}
            </button>
          )}
          <button
            className="btn studio-preview-toggle"
            onClick={togglePreview}
            aria-pressed={preview}
            title="只读设计预览"
          >
            <Icon name="play" size={15} />
            {preview ? "退出预览" : "预览"}
          </button>
          <button
            className="btn"
            disabled={!selectedRoom || preview}
            onClick={() => setCapabilityPage("members")}
            aria-label="能力配置"
          >
            <Icon name="settings" size={17} />
            <span>能力配置</span>
          </button>
          <button
            className="btn-icon"
            onClick={() => toggleRight()}
            aria-label={rightCollapsed ? "展开任务面板" : "收起任务面板"}
          >
            <Icon name="panel-right" />
          </button>
        </div>
      </header>

      <WorkspaceSidebar
        rooms={visibleRooms}
        selectedRoom={selectedRoom}
        selectedAgentId={agentId}
        states={agentStates}
        preview={preview}
        collapsed={leftCollapsed}
        onToggle={toggleLeft}
        onRoom={chooseRoom}
        onAgent={(id) => {
          if (selectedRoom) chooseAgent(selectedRoom.id, id);
        }}
        onCreate={startCreate}
        onOverview={() => setView("building")}
        onCapability={setCapabilityPage}
      />

      <main className="studio-main">
        <header className="studio-toolbar">
          <div className="studio-title">
            <h1>
              <Icon
                name={view === "building" ? "building" : "team"}
                size={28}
              />
              <span title={selectedRoom?.name}>
                {view === "building"
                  ? "我的办公大楼"
                  : selectedRoom?.name || "我的工作室"}
              </span>
            </h1>
          </div>
          <div className="studio-view-actions">
            <div className="studio-view-tabs" aria-label="工作区视图">
              <button
                aria-pressed={view === "studio"}
                onClick={() => setView("studio")}
              >
                办公区
              </button>
              <button
                aria-pressed={view === "building"}
                onClick={() => setView("building")}
              >
                大楼总览
              </button>
            </div>
            <button
              className="btn"
              disabled={!selectedRoom || preview}
              onClick={() => openInspectorTab("agents")}
            >
              <Icon name="team" size={16} />
              管理成员
            </button>
          </div>
        </header>
        {error && !showCreate && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              <Icon name="close" />
            </button>
          </div>
        )}
        {view === "building" ? (
          <section className="studio-building-stage">
            <div className="studio-building-tools">
              <div className="zoom-controls">
                <button
                  aria-label="缩小大楼"
                  disabled={zoom <= 0.7}
                  onClick={() =>
                    setZoom((n) => Math.max(0.7, +(n - 0.1).toFixed(1)))
                  }
                >
                  −
                </button>
                <button aria-label="重置缩放" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  aria-label="放大大楼"
                  disabled={zoom >= 1.4}
                  onClick={() =>
                    setZoom((n) => Math.min(1.4, +(n + 0.1).toFixed(1)))
                  }
                >
                  +
                </button>
              </div>
            </div>
            <Building
              rooms={visibleRooms}
              states={agentStates}
              selectedRoomId={roomId}
              selectedAgentId={agentId}
              zoom={zoom}
              preview={preview}
              onRoom={chooseRoom}
              onAgent={chooseAgent}
              onCreate={startCreate}
            />
          </section>
        ) : selectedRoom ? (
          <StudioScene
            room={selectedRoom}
            states={agentStates}
            selectedAgentId={agentId}
            preview={preview}
            onAgent={(id) => chooseAgent(selectedRoom.id, id)}
          />
        ) : (
          <section className="studio-welcome">
            <Character id="lead" size={120} />
            <h2>暂无工作区</h2>
            <button className="btn btn-emerald" onClick={startCreate}>
              <Icon name="plus" />
              新建工作区
            </button>
            <button className="btn" onClick={togglePreview}>
              预览
            </button>
          </section>
        )}

        {selectedRoom && (
          <section className="studio-conversation" aria-label="与成员沟通">
            <header>
              <div className="studio-recipient">
                <Character
                  id={
                    dockAgent
                      ? resolveSpriteKey(
                          dockAgent.avatar.sprite,
                          dockAgent.roleType,
                          dockAgent.provider,
                        )
                      : "lead"
                  }
                  size={40}
                />
                <select
                  id="studio-recipient"
                  aria-label="沟通对象"
                  value={dockAgent?.id ?? ""}
                  onChange={(e) => chooseAgent(selectedRoom.id, e.target.value)}
                >
                  {selectedRoom.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.id === selectedRoom.leadAgentId ? " · 主管" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-sm"
                disabled={preview}
                onClick={() => openInspectorTab("files")}
              >
                任务记录
                <Icon name="arrow" size={14} />
              </button>
            </header>
            {lastTask && !preview && (
              <div className="studio-dispatch-summary" aria-label="最近任务">
                <strong>{lastTask.prompt}</strong>
                {lastTask.summary && <p>{lastTask.summary}</p>}
              </div>
            )}
            <form className="studio-composer" onSubmit={sendPrompt}>
              <textarea
                rows={2}
                aria-label={
                  isPassThrough
                    ? `给 ${dockAgent?.name} 的指令`
                    : "给主管的任务"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={preview || !dockAgent}
              />
              <button
                type="submit"
                className="btn btn-emerald"
                disabled={preview || !dockAgent || !prompt.trim()}
              >
                <Icon name="send" size={18} />
                {isPassThrough ? "发送" : "交给主管"}
              </button>
            </form>
            <div className="studio-run-status">
              {!preview && connection !== "实时连接" && (
                <span role="status">{connection}</span>
              )}
              {!preview &&
                dockAgent &&
                (healthFailed ||
                  (health &&
                    !health.providers[dockAgent.provider]?.available)) && (
                  <span role="status">
                    {dockAgent.provider === "antigravity"
                      ? "Antigravity"
                      : "Codex"}{" "}
                    {healthFailed ? "离线" : "未就绪"}
                  </span>
                )}
              {(output || running) && (
                <button
                  aria-expanded={showOutput}
                  aria-controls="studio-output"
                  onClick={() => setShowOutput((value) => !value)}
                >
                  {showOutput ? "收起回执" : "派发回执"}
                </button>
              )}
              {running && !preview && (
                <button
                  className="studio-stop"
                  onClick={() =>
                    dockAgent &&
                    api
                      .stopAgent(
                        selectedRoom.id,
                        dockAgent.id,
                        dockRuntime?.taskId,
                      )
                      .catch((e) => setError(message(e)))
                  }
                >
                  停止当前任务
                </button>
              )}
            </div>
            {showOutput && (output || running) && (
              <div id="studio-output" className="studio-output" role="status">
                <pre>
                  {[output, dockRuntime?.bubbleText]
                    .filter(Boolean)
                    .join("\n\n") || "执行中…"}
                </pre>
              </div>
            )}
          </section>
        )}
      </main>

      <aside
        className="inspector-drawer studio-inspector"
        aria-label="工作区详情"
        aria-hidden={rightCollapsed}
        inert={rightCollapsed}
      >
        <div className="studio-inspector-nav">
          <div role="group" aria-label="详情面板">
            <button
              aria-pressed={tab === "overview"}
              onClick={() => setTab("overview")}
            >
              团队任务
            </button>
            <button
              aria-pressed={tab === "agents"}
              disabled={!selectedRoom || preview}
              onClick={() => setTab("agents")}
            >
              成员管理
            </button>
            <button
              aria-pressed={tab === "files"}
              disabled={!selectedRoom || preview}
              onClick={() => setTab("files")}
            >
              任务与文件
            </button>
          </div>
          <button
            className="btn-icon"
            aria-label="收起任务面板"
            onClick={() => toggleRight(false)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="drawer-body" key={`${roomId}:${tab}`}>
          {selectedRoom ? (
            <>
              {tab === "overview" && (
                <StudioTaskPanel
                  room={selectedRoom}
                  tasks={visibleTasks}
                  events={events}
                  loading={tasksLoading}
                  error={tasksError}
                  preview={preview}
                  onRetry={() => setTaskRevision((value) => value + 1)}
                  onTasks={() => setTab("files")}
                  onAgent={(id) => chooseAgent(selectedRoom.id, id)}
                >
                  {!preview && pendingApprovals.length > 0 && (
                    <section className="approval-banner">
                      <div className="approval-banner-title">
                        <Icon name="shield" size={15} />
                        待确认 ({pendingApprovals.length})
                      </div>
                      {pendingApprovals.map((ap) => (
                        <div key={ap.id} className="approval-card">
                          <div>
                            <strong>{ap.agentName}</strong>：{ap.question}
                          </div>
                          <input
                            className="field-input"
                            aria-label={`${ap.agentName}的审批批注`}
                            placeholder="批注（可选）"
                            value={approvalNotes[ap.id] ?? ""}
                            onChange={(e) =>
                              setApprovalNotes((prev) => ({
                                ...prev,
                                [ap.id]: e.target.value,
                              }))
                            }
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-emerald"
                              style={{ flex: 1 }}
                              onClick={() =>
                                handleResolveApproval(ap.id, "approved")
                              }
                            >
                              <Icon name="check" size={14} />
                              批准
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger-ghost"
                              onClick={() =>
                                handleResolveApproval(ap.id, "rejected")
                              }
                            >
                              驳回
                            </button>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
                </StudioTaskPanel>
              )}
              {!preview && tab === "agents" && (
                <AgentsTab
                  onConfigure={() => setCapabilityPage("members")}
                  room={selectedRoom}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={(id) => {
                    const target = id ?? lead?.id;
                    if (target && chooseAgent(selectedRoom.id, target))
                      setTab("agents");
                  }}
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
            </>
          ) : (
            <div className="studio-panel-empty">
              <Icon name="team" size={32} />
              <h2>团队任务</h2>
              <button className="btn" onClick={startCreate}>
                新建工作区
              </button>
            </div>
          )}
        </div>
      </aside>
      {/* ==================== CREATE WORKSPACE DIALOG ==================== */}
      <dialog
        ref={createDialog}
        className="create-dialog"
        aria-labelledby="create-workspace-title"
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
              <Icon name="building" size={22} />
            </span>
            <button
              type="button"
              className="btn-icon"
              aria-label="关闭新建工作区"
              disabled={creating}
              onClick={() => setShowCreate(false)}
            >
              <Icon name="close" size={16} />
            </button>
          </header>
          <h2 id="create-workspace-title">新建工作区</h2>
          <label>
            工作区名称
            <input
              className="field-input"
              autoFocus
              required
              maxLength={60}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </label>
          <label>
            文件夹绝对路径
            <input
              className="field-input"
              required
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            />
          </label>
          <div className="form-columns">
            <label>
              主管执行引擎
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
              主题
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary full-width"
            disabled={creating || !roomName.trim() || !folderPath.trim()}
          >
            <Icon name="plus" size={16} />
            {creating ? "创建中…" : "创建工作区"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
