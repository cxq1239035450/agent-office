import { useEffect, useRef, useState } from "react";
import type { McpServerConfig } from "@agent-office/shared";
import { api } from "../api/client";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { resolveSpriteKey } from "../game/pixelSprites";
import type { EditorProps } from "./AbilityCenter";
import { parseArguments, parseEnvironment } from "./capabilityForms";

const empty = () => ({
  id: "",
  content: "",
  description: "",
  enabled: true,
  transport: "stdio" as McpServerConfig["transport"],
  command: "",
  args: "",
  url: "",
  env: "{}",
});
export function CapabilityLibrary({
  room,
  mode,
  onRefresh,
  onGuard,
  onMember,
}: EditorProps & { mode: "skills" | "mcp"; onMember: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [baseline, setBaseline] = useState(JSON.stringify(empty()));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [detailTab, setDetailTab] = useState<"config" | "members">("config");
  const input = useRef<HTMLInputElement>(null);
  const isSkill = mode === "skills";
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    onGuard({ dirty, busy: busy || loading, stale: refreshFailed });
  }, [dirty, busy, loading, refreshFailed, onGuard]);
  const patch = (value: Partial<ReturnType<typeof empty>>) =>
    setDraft((d) => ({ ...d, ...value }));
  const items = isSkill
    ? room.skills.map((s) => ({
        id: s.id,
        enabled: s.enabled,
        subtitle: s.path,
      }))
    : room.mcpServers.map((s) => ({
        id: s.name,
        enabled: s.enabled,
        subtitle:
          s.transport === "stdio"
            ? `本地进程 · ${s.command || "未设置命令"}`
            : `${s.transport.toUpperCase()} · ${s.url || "未设置地址"}`,
      }));
  const assigned = (id: string) =>
    room.agents.filter((a) => (isSkill ? a.skills : a.mcpServers).includes(id));
  const filtered = items.filter(
    (s) =>
      s.id.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "on" ? s.enabled : !s.enabled)),
  );
  const canChange = () =>
    !busy && !loading && (!dirty || window.confirm("放弃尚未保存的更改？"));
  async function open(id: string | null) {
    if (!canChange()) return;
    setSelected(id);
    setCreating(id === null);
    setError("");
    setNotice("");
    setDetailTab("config");
    let next = empty();
    if (id && isSkill) {
      const item = room.skills.find((s) => s.id === id)!;
      next = { ...next, id, enabled: item.enabled };
    } else if (id) {
      const item = room.mcpServers.find((s) => s.name === id)!;
      next = {
        ...next,
        id,
        enabled: item.enabled,
        transport: item.transport,
        command: item.command ?? "",
        args: JSON.stringify(item.args ?? [], null, 2),
        url: item.url ?? "",
        env: JSON.stringify(item.env ?? {}, null, 2),
      };
    }
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }
  async function refreshView() {
    setRefreshFailed(false);
    try {
      await onRefresh();
      return true;
    } catch {
      setRefreshFailed(true);
      return false;
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || loading) return;
    setError("");
    setNotice("");
    const id = draft.id.trim();
    if (!id || (isSkill && !/^[a-z0-9_-]+$/.test(id))) {
      setError("技能标识请使用小写字母、数字、下划线或短横线。");
      return;
    }
    if (creating && items.some((s) => s.id === id)) {
      setError("名称已存在，请选择列表中的条目进行编辑。");
      return;
    }
    if (!isSkill && id === "agent-office-orchestrator") {
      setError("这是内置编排服务的保留名称，请使用其他名称。");
      return;
    }
    let mcp: McpServerConfig | undefined;
    try {
      if (!isSkill) {
        if (
          draft.transport !== "stdio" &&
          !/^https?:\/\//i.test(draft.url.trim())
        )
          throw new Error("请输入完整的 HTTP 或 HTTPS 地址。");
        mcp = {
          ...(selected ? room.mcpServers.find((s) => s.name === selected) : {}),
          name: id,
          transport: draft.transport,
          enabled: draft.enabled,
          ...(draft.transport === "stdio"
            ? {
                command: draft.command.trim(),
                args: parseArguments(draft.args),
                env: parseEnvironment(draft.env),
              }
            : { url: draft.url.trim() }),
        };
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      if (isSkill && !creating)
        await api.toggleSkill(room.id, id, draft.enabled);
      else if (isSkill)
        await api.upsertSkill(room.id, {
          id,
          description: draft.description,
          content: draft.content,
          enabled: draft.enabled,
        });
      else await api.upsertMcp(room.id, mcp!);
      setSelected(id);
      setCreating(false);
      setBaseline(JSON.stringify(draft));
      await refreshView();
      setNotice("已保存到当前工作区。");
    } catch (e) {
      setError(`保存失败，请重试：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !selected ||
      busy ||
      !window.confirm(
        isSkill
          ? `删除技能 ${selected}？技能文件和所有成员的对应分配会一并移除。`
          : `移除连接 ${selected}？所有成员的对应分配也会移除。`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (isSkill) await api.removeSkill(room.id, selected);
      else await api.removeMcp(room.id, selected);
      await refreshView();
      setSelected(null);
      setCreating(false);
      setDraft(empty());
      setBaseline(JSON.stringify(empty()));
      setNotice("已移除。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (!canChange()) {
      if (input.current) input.current.value = "";
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("请选择小于 1 MB 的 Markdown 文件。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const content = await file.text();
      const match = content.match(
        /^---\r?\n[\s\S]*?^name:\s*["']?([a-z0-9_-]+)/m,
      );
      const next = {
        ...empty(),
        id:
          match?.[1] ??
          (file.name.toLowerCase() === "skill.md"
            ? ""
            : file.name
                .replace(/\.md$/i, "")
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "-")),
        content,
      };
      setSelected(null);
      setCreating(true);
      setDraft(next);
      setBaseline(JSON.stringify(empty()));
      setDetailTab("config");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <header className="cap-page-heading">
        <div>
          <h1>
            <Icon name={isSkill ? "spark" : "plug"} size={30} />
            {isSkill ? "工作区 Skill 库" : "工作区 MCP 连接"}
          </h1>
        </div>
        <div className="cap-actions">
          {isSkill && (
            <>
              <input
                ref={input}
                type="file"
                accept=".md,text/markdown"
                hidden
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
              <button
                className="btn"
                disabled={busy || loading || refreshFailed}
                onClick={() => input.current?.click()}
              >
                <Icon name="file" size={16} />
                导入 Markdown
              </button>
            </>
          )}
          <button
            className="btn btn-emerald"
            disabled={busy || loading || refreshFailed}
            onClick={() => void open(null)}
          >
            <Icon name="plus" size={16} />
            {isSkill ? "新建 Skill" : "添加连接"}
          </button>
        </div>
      </header>
      {refreshFailed && (
        <div className="cap-error" role="alert">
          保存已完成，但列表刷新失败。
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await refreshView();
              setBusy(false);
            }}
          >
            重新加载列表
          </button>
        </div>
      )}
      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={error ? "cap-error" : "cap-success"}
        >
          {error || notice}
        </p>
      )}
      <div className="cap-library">
        <section
          className="cap-list-pane"
          aria-label={isSkill ? "技能列表" : "连接列表"}
        >
          <label className="cap-search">
            <Icon name="search" size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isSkill ? "搜索技能名称" : "搜索连接名称"}
              aria-label="搜索能力"
            />
          </label>
          <div className="cap-filter" role="group" aria-label="启用状态">
            {[
              ["all", "全部"],
              ["on", "已启用"],
              ["off", "已停用"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {filtered.map((item) => (
            <button
              key={item.id}
              className={`cap-library-row ${selected === item.id && !creating ? "active" : ""}`}
              aria-pressed={selected === item.id && !creating}
              disabled={busy || loading || refreshFailed}
              onClick={() => void open(item.id)}
            >
              <Icon name={isSkill ? "spark" : "plug"} size={21} />
              <span>
                <strong>{item.id}</strong>
                <small title={item.subtitle}>{item.subtitle}</small>
              </span>
              <span className="cap-row-meta">
                <small>{assigned(item.id).length} 位成员</small>
                <em className={item.enabled ? "enabled" : ""}>
                  {item.enabled ? "已启用" : "已停用"}
                </em>
              </span>
            </button>
          ))}
          {!filtered.length && (
            <div className="cap-empty">
              <Icon name={isSkill ? "spark" : "plug"} size={30} />
              <strong>
                {query || filter !== "all"
                  ? "没有匹配结果"
                  : isSkill
                    ? "暂无技能"
                    : "暂无 MCP 连接"}
              </strong>
            </div>
          )}
        </section>
        <section className="cap-detail-pane">
          {selected || creating ? (
            <>
              <header className="cap-detail-heading">
                <div className="cap-feature-icon">
                  <Icon name={isSkill ? "spark" : "plug"} size={26} />
                </div>
                <div>
                  <h2>
                    {creating
                      ? isSkill
                        ? "新建 Skill"
                        : "添加 MCP 连接"
                      : selected}
                  </h2>
                </div>
              </header>
              <div className="cap-tabs">
                <button
                  aria-pressed={detailTab === "config"}
                  className={detailTab === "config" ? "active" : ""}
                  onClick={() => setDetailTab("config")}
                >
                  {isSkill ? (creating ? "指令内容" : "技能概览") : "连接配置"}
                </button>
                <button
                  aria-pressed={detailTab === "members"}
                  className={detailTab === "members" ? "active" : ""}
                  onClick={() => setDetailTab("members")}
                  disabled={creating}
                >
                  已分配成员 {selected ? assigned(selected).length : ""}
                </button>
              </div>
              {detailTab === "members" ? (
                <div className="cap-assigned">
                  <dl
                    className="cap-scope-metadata"
                    aria-label="成员分配不限制工作区访问"
                  >
                    <dt>访问范围</dt>
                    <dd>工作区共享</dd>
                  </dl>
                  {selected &&
                    assigned(selected).map((a) => (
                      <button
                        key={a.id}
                        className="cap-person-link"
                        aria-label={`配置${a.name}`}
                        onClick={() => onMember(a.id)}
                      >
                        <Character
                          id={resolveSpriteKey(
                            a.avatar.sprite,
                            a.roleType,
                            a.provider,
                          )}
                          size={44}
                        />
                        <span>
                          <strong>{a.name}</strong>
                          <small>
                            {a.roleType === "lead" ? "主管" : "专员"} ·{" "}
                            {a.title}
                          </small>
                        </span>
                        <Icon name="arrow" size={16} />
                      </button>
                    ))}
                  {selected && !assigned(selected).length && (
                    <p className="muted">暂无分配</p>
                  )}
                </div>
              ) : (
                <form className="cap-edit-form" onSubmit={save}>
                  <fieldset disabled={busy || loading || refreshFailed}>
                    <label>
                      {isSkill ? "Skill 标识" : "连接名称"}
                      <input
                        className="field-input"
                        required
                        value={draft.id}
                        readOnly={!creating}
                        onChange={(e) => patch({ id: e.target.value })}
                        placeholder={
                          isSkill ? "video-editing" : "media-library"
                        }
                        pattern={isSkill ? "[a-z0-9_-]+" : undefined}
                      />
                    </label>
                    {isSkill ? (
                      <>
                        {creating && (
                          <label>
                            用途说明
                            <input
                              className="field-input"
                              value={draft.description}
                              onChange={(e) =>
                                patch({ description: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {creating && (
                          <label>
                            SKILL.md 内容
                            <textarea
                              className="field-input cap-code"
                              rows={13}
                              required
                              value={draft.content}
                              onChange={(e) =>
                                patch({ content: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {selected && (
                          <label>
                            本地 SKILL.md（只读）
                            <input
                              className="field-input cap-code"
                              readOnly
                              value={
                                room.skills.find((s) => s.id === selected)
                                  ?.path ?? ""
                              }
                              title={
                                room.skills.find((s) => s.id === selected)?.path
                              }
                              aria-label="本地 SKILL.md 文件路径，只读"
                            />
                          </label>
                        )}
                      </>
                    ) : (
                      <>
                        <label>
                          传输方式
                          <select
                            className="field-input"
                            value={draft.transport}
                            onChange={(e) =>
                              patch({
                                transport: e.target
                                  .value as McpServerConfig["transport"],
                              })
                            }
                          >
                            <option value="stdio">stdio · 本地进程</option>
                            <option value="http">HTTP · 远程端点</option>
                            <option value="sse">SSE · 远程端点</option>
                          </select>
                        </label>
                        {draft.transport === "stdio" ? (
                          <>
                            <label>
                              启动命令
                              <input
                                className="field-input"
                                value={draft.command}
                                required
                                onChange={(e) =>
                                  patch({ command: e.target.value })
                                }
                                placeholder="npx"
                              />
                            </label>
                            <label>
                              命令参数（每行一个或 JSON 数组）
                              <textarea
                                className="field-input cap-code"
                                rows={4}
                                value={draft.args}
                                onChange={(e) =>
                                  patch({ args: e.target.value })
                                }
                              />
                            </label>
                            <details>
                              <summary>环境变量</summary>
                              <label>
                                JSON 键值对象
                                <textarea
                                  className="field-input cap-code"
                                  rows={4}
                                  aria-label="JSON 键值对象"
                                  value={draft.env}
                                  onChange={(e) =>
                                    patch({ env: e.target.value })
                                  }
                                />
                              </label>
                            </details>
                          </>
                        ) : (
                          <label>
                            服务地址
                            <input
                              type="url"
                              className="field-input"
                              required
                              value={draft.url}
                              onChange={(e) => patch({ url: e.target.value })}
                              placeholder="https://example.com/mcp"
                            />
                          </label>
                        )}
                      </>
                    )}
                    <label className="cap-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(e) => patch({ enabled: e.target.checked })}
                      />
                      <span>{isSkill ? "启用技能" : "启用配置"}</span>
                    </label>
                  </fieldset>
                  {loading && <p role="status">正在读取技能文件…</p>}
                  <footer className="cap-save-bar">
                    <span role="status">
                      {busy ? "处理中…" : dirty ? "有未保存的更改" : ""}
                    </span>
                    {selected && (
                      <button
                        className="btn btn-danger-ghost"
                        type="button"
                        disabled={busy || loading || refreshFailed}
                        onClick={() => void remove()}
                        aria-label={`移除${isSkill ? "技能" : "连接"} ${selected}`}
                      >
                        <Icon name="trash" size={14} />
                        移除
                      </button>
                    )}
                    <button
                      className="btn btn-emerald"
                      disabled={
                        busy ||
                        loading ||
                        refreshFailed ||
                        (!dirty && !creating)
                      }
                    >
                      {busy ? "保存中…" : isSkill ? "保存技能" : "保存连接"}
                    </button>
                  </footer>
                </form>
              )}
            </>
          ) : (
            <div className="cap-empty cap-detail-empty">
              <Icon name={isSkill ? "spark" : "plug"} size={44} />
              <h2>{isSkill ? "未选择技能" : "未选择连接"}</h2>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
