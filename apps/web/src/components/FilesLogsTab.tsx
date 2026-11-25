import { useCallback, useEffect, useState } from "react";
import type {
  OfficeEvent,
  RoomConfig,
  TaskLogRecallResult,
  TaskRecord,
  TaskStatus,
} from "@agent-office/shared";
import { api, type FileEntry } from "../api/client";
import { Icon } from "./Icon";

interface Props {
  room: RoomConfig;
  events: OfficeEvent[];
  onRefreshRoom: () => Promise<void>;
  onRemoveRoom: (roomId: string) => Promise<void>;
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "排队中",
  running: "执行中",
  waiting_approval: "待确认",
  completed: "已完成",
  failed: "失败",
  stalled: "执行受阻",
  cancelled: "已停止",
};

export function FilesLogsTab({
  room,
  events,
  onRefreshRoom,
  onRemoveRoom,
}: Props) {
  const [subPath, setSubPath] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [recalledLog, setRecalledLog] = useState<TaskLogRecallResult | null>(
    null,
  );
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSubPath("");
    setSelectedTaskId(null);
    setRecalledLog(null);
  }, [room.id]);

  useEffect(() => {
    setError("");
    api
      .listFiles(room.id, subPath)
      .then(setFiles)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [room.id, subPath]);

  const loadTasks = useCallback(() => {
    api
      .listTasks(room.id, 25)
      .then(setTasks)
      .catch(() => {
        /* Ignore background refresh errors */
      });
  }, [room.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, events.length]);

  const handleRecallLog = async (taskId: string, grep?: string) => {
    setSelectedTaskId(taskId);
    setLoadingLog(true);
    try {
      const res = await api.recallTaskLog(room.id, taskId, {
        limit: 120,
        grep: grep?.trim() || undefined,
      });
      setRecalledLog(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingLog(false);
    }
  };

  const handleCleanupWorktree = async (taskId: string) => {
    await api.cleanupWorktree(room.id, taskId);
    loadTasks();
  };

  const roomEvents = events.filter((e) => e.roomId === room.id);

  function goUp() {
    const parts = subPath.split("/").filter(Boolean);
    parts.pop();
    setSubPath(parts.join("/"));
  }

  function statusBadgeClass(status: TaskStatus): string {
    if (status === "completed") return "badge-emerald";
    if (status === "running" || status === "queued") return "badge-violet";
    if (status === "waiting_approval") return "badge-amber";
    if (status === "stalled" || status === "failed") return "badge-danger";
    return "badge-neutral";
  }

  return (
    <>
      {/* Super-Agent Task Queue & Chain of Recall */}
      <section className="detail-section">
        <div className="section-header">
          <h3>
            <Icon name="terminal" size={16} />
            任务 ({tasks.length})
          </h3>
          <button type="button" className="btn btn-sm" onClick={loadTasks}>
            <Icon name="refresh" size={13} />
            刷新
          </button>
        </div>

        <div className="task-list">
          {tasks.length === 0 && <p className="muted">暂无任务</p>}
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`task-item-card ${selectedTaskId === t.id ? "selected" : ""}`}
            >
              <div className="task-item-top">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong>{t.agentName}</strong>
                </div>
                <span className={`badge ${statusBadgeClass(t.status)}`}>
                  {TASK_STATUS_LABELS[t.status]}
                </span>
              </div>

              <div className="task-prompt-line" title={t.prompt}>
                {t.prompt}
              </div>

              {t.worktreeBranch && (
                <div className="task-item-top">
                  <span className="badge badge-violet">
                    <Icon name="branch" size={11} />
                    {t.worktreeBranch}
                  </span>
                  {t.status !== "running" && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleCleanupWorktree(t.id)}
                    >
                      清理分支目录
                    </button>
                  )}
                </div>
              )}

              {(t.summary || t.error) && (
                <div
                  className={`task-summary-snippet ${t.error ? "is-error" : ""}`}
                >
                  {t.error ? `异常: ${t.error}` : t.summary}
                </div>
              )}

              <div className="task-item-top">
                <small className="muted">
                  {new Date(t.createdAt).toLocaleTimeString("zh-CN")}
                </small>
                {t.logPath && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleRecallLog(t.id, logSearch)}
                  >
                    <Icon name="search" size={12} />
                    查看日志
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {selectedTaskId && (
          <div className="panel-card">
            <div className="task-item-top">
              <strong>日志 ({selectedTaskId.slice(0, 8)})</strong>
              <button
                type="button"
                className="btn-icon"
                aria-label="关闭任务日志"
                onClick={() => {
                  setSelectedTaskId(null);
                  setRecalledLog(null);
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="field-input"
                aria-label="日志关键词"
                placeholder="搜索日志"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => handleRecallLog(selectedTaskId, logSearch)}
              >
                检索
              </button>
            </div>
            <pre className="code-log-box">
              {loadingLog
                ? "读取中…"
                : recalledLog
                  ? `# 共 ${recalledLog.totalLines} 行，命中 ${recalledLog.matchedLines} 行\n` +
                    (recalledLog.lines.join("\n") || "(无匹配行)")
                  : ""}
            </pre>
          </div>
        )}
      </section>

      {/* Workspace File Browser */}
      <section className="detail-section">
        <div className="section-header">
          <h3>
            <Icon name="folder" size={16} />
            工作区文件 {subPath ? `/${subPath}` : "/"}
          </h3>
          {subPath && (
            <button type="button" className="btn btn-sm" onClick={goUp}>
              返回上级
            </button>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="file-browser-box">
          {files.length === 0 && <span className="muted">当前目录为空</span>}
          {files.map((f) => {
            const content = (
              <>
                <Icon name={f.type === "dir" ? "folder" : "file"} size={14} />
                <span>{f.name}</span>
              </>
            );
            return f.type === "dir" ? (
              <button
                key={f.path}
                type="button"
                className="file-entry-row is-dir"
                onClick={() => setSubPath(f.path)}
              >
                {content}
              </button>
            ) : (
              <div key={f.path} className="file-entry-row">
                {content}
              </div>
            );
          })}
        </div>
      </section>

      {/* Live Event Stream & Room Settings */}
      <section className="detail-section">
        <div className="section-header">
          <h3>
            <Icon name="clock" size={16} />
            动态 ({roomEvents.length})
          </h3>
        </div>
        <div className="task-list" style={{ maxHeight: 130 }}>
          {roomEvents.length === 0 && <p className="muted">暂无动态</p>}
          {roomEvents.map((ev) => (
            <div key={ev.id} className="task-item-card">
              <div className="task-item-top">
                <span className="badge badge-neutral">{ev.provider}</span>
                <small className="muted">{ev.status}</small>
              </div>
              <div className="task-prompt-line">{ev.bubbleText ?? ""}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="panel-card">
          <div className="section-header">
            <h3>
              <Icon name="settings" size={15} />
              工作区设置
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-danger-ghost"
              onClick={() => onRemoveRoom(room.id)}
            >
              <Icon name="trash" size={13} />
              移除楼层
            </button>
          </div>
          <label className="field-label">
            主题
            <select
              className="field-input"
              value={room.theme}
              onChange={(e) =>
                api
                  .updateRoom(room.id, {
                    theme: e.target.value as RoomConfig["theme"],
                  })
                  .then(onRefreshRoom)
              }
            >
              <option value="modern">暖木办公室</option>
              <option value="retro">复古资料室</option>
              <option value="studio">创意工作室</option>
            </select>
          </label>
        </div>
      </section>
    </>
  );
}
