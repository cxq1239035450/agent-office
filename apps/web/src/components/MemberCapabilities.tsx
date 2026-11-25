import { useEffect, useState } from "react";
import type { CliProvider } from "@agent-office/shared";
import { api } from "../api/client";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { resolveSpriteKey } from "../game/pixelSprites";
import type { EditorProps } from "./AbilityCenter";

export function MemberCapabilities({
  room,
  memberId,
  onRefresh,
  onGuard,
  onLibrary,
  onContact,
}: EditorProps & {
  memberId: string;
  onLibrary: (mode: "skills" | "mcp") => void;
  onContact: (id: string) => void;
}) {
  const agent = room.agents.find((a) => a.id === memberId) ?? room.agents[0];
  const initial = {
    name: agent?.name ?? "",
    title: agent?.title ?? "",
    instructions: agent?.instructions ?? "",
    provider: agent?.provider ?? ("codex" as CliProvider),
    skills: agent?.skills ?? [],
    mcpServers: agent?.mcpServers ?? [],
  };
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [tab, setTab] = useState<"profile" | "abilities">("abilities");
  const [chooser, setChooser] = useState<"skills" | "mcp">("skills");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(
    () => onGuard({ dirty, busy, stale: refreshFailed }),
    [dirty, busy, refreshFailed, onGuard],
  );
  if (!agent) return <div className="cap-empty">当前工作区没有成员。</div>;
  const toggle = (kind: "skills" | "mcpServers", id: string) => {
    if (busy || refreshFailed) return;
    setNotice("");
    setDraft((d) => ({
      ...d,
      [kind]: d[kind].includes(id)
        ? d[kind].filter((v) => v !== id)
        : [...d[kind], id],
    }));
  };
  const available =
    chooser === "skills"
      ? room.skills.map((s) => ({
          id: s.id,
          enabled: s.enabled,
          description: "工作区 Skill",
        }))
      : room.mcpServers.map((s) => ({
          id: s.name,
          enabled: s.enabled,
          description: s.transport === "stdio" ? "本地进程" : "远程端点",
        }));
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
  async function save() {
    if (!agent || busy || refreshFailed) return;
    if (
      !draft.name.trim() ||
      !draft.title.trim() ||
      !draft.instructions.trim()
    ) {
      setError("请填写成员名称、职位和职责。");
      setTab("profile");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.updateAgent(room.id, agent.id, draft);
      setBaseline(JSON.stringify(draft));
      await refreshView();
      setNotice("成员配置已保存。");
    } catch (e) {
      setError(`保存失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="cap-member-heading">
        <Character
          id={resolveSpriteKey(
            agent.avatar.sprite,
            agent.roleType,
            agent.provider,
          )}
          size={80}
        />
        <div>
          <h1>{agent.name}</h1>
          <p className="cap-member-identity">
            <span>{agent.title}</span>
            {agent.title !== (agent.roleType === "lead" ? "主管" : "专员") && (
              <span>{agent.roleType === "lead" ? "主管" : "专员"}</span>
            )}
            {agent.roleType !== "lead" && (
              <span>
                主管：
                {room.agents.find((a) => a.id === room.leadAgentId)?.name ??
                  "未设置"}
              </span>
            )}
          </p>
        </div>
        <button
          className="btn"
          disabled={busy}
          onClick={() => onContact(agent.id)}
          aria-label={`与${agent.name}沟通`}
        >
          <Icon name="send" size={16} />
          沟通
        </button>
      </header>
      <div className="cap-tabs">
        <button
          aria-pressed={tab === "profile"}
          className={tab === "profile" ? "active" : ""}
          onClick={() => setTab("profile")}
        >
          基本信息与职责
        </button>
        <button
          aria-pressed={tab === "abilities"}
          className={tab === "abilities" ? "active" : ""}
          onClick={() => setTab("abilities")}
        >
          Skills 与 MCP
        </button>
      </div>
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
      {tab === "profile" ? (
        <form
          className="cap-profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || refreshFailed}>
            <div className="form-columns">
              <label>
                成员名称
                <input
                  className="field-input"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                职位
                <input
                  className="field-input"
                  required
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              执行引擎
              <select
                className="field-input"
                value={draft.provider}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    provider: e.target.value as CliProvider,
                  })
                }
              >
                <option value="codex">Codex CLI</option>
                <option value="antigravity">Antigravity CLI</option>
              </select>
            </label>
            <label>
              职责说明
              <textarea
                className="field-input"
                rows={9}
                required
                aria-label="职责说明"
                value={draft.instructions}
                onChange={(e) =>
                  setDraft({ ...draft, instructions: e.target.value })
                }
              />
            </label>
          </fieldset>
        </form>
      ) : (
        <div className="cap-member-grid">
          <section
            className="cap-assignment-pane"
            aria-label="成员能力分配，工作区已启用能力由所有成员共享"
          >
            <dl className="cap-scope-metadata">
              <dt>访问范围</dt>
              <dd>工作区共享</dd>
            </dl>
            <header>
              <h2>
                <Icon name="spark" />
                已分配 Skills <small>{draft.skills.length}</small>
              </h2>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setChooser("skills");
                  setQuery("");
                }}
              >
                添加技能
              </button>
            </header>
            {draft.skills.map((id) => {
              const skill = room.skills.find((s) => s.id === id);
              return (
                <div className="cap-assignment-row" key={id}>
                  <Icon name="spark" size={19} />
                  <span>
                    <strong>{id}</strong>
                    <small>
                      {!skill
                        ? "工作区中已不存在"
                        : skill.enabled
                          ? "已启用"
                          : "工作区已停用"}
                    </small>
                  </span>
                  <button
                    className="btn-icon"
                    disabled={busy || refreshFailed}
                    onClick={() => toggle("skills", id)}
                    aria-label={`移除技能分配 ${id}`}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
            {!draft.skills.length && (
              <p className="cap-inline-empty">暂无技能分配</p>
            )}
            <header>
              <h2>
                <Icon name="plug" />
                已分配 MCP <small>{draft.mcpServers.length}</small>
              </h2>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setChooser("mcp");
                  setQuery("");
                }}
              >
                分配连接
              </button>
            </header>
            {draft.mcpServers.map((id) => {
              const srv = room.mcpServers.find((s) => s.name === id);
              return (
                <div className="cap-assignment-row" key={id}>
                  <Icon name="plug" size={19} />
                  <span>
                    <strong>{id}</strong>
                    <small>
                      {!srv
                        ? "工作区中已不存在"
                        : `${srv.transport} · ${srv.enabled ? "配置启用" : "工作区已停用"}`}
                    </small>
                  </span>
                  <button
                    className="btn-icon"
                    disabled={busy || refreshFailed}
                    onClick={() => toggle("mcpServers", id)}
                    aria-label={`移除 MCP 分配 ${id}`}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
            {!draft.mcpServers.length && (
              <p className="cap-inline-empty">暂无 MCP 分配</p>
            )}
          </section>
          <section className="cap-chooser">
            <h2>工作区能力</h2>
            <div className="cap-tabs">
              <button
                className={chooser === "skills" ? "active" : ""}
                aria-pressed={chooser === "skills"}
                onClick={() => {
                  setChooser("skills");
                  setQuery("");
                }}
              >
                Skills
              </button>
              <button
                className={chooser === "mcp" ? "active" : ""}
                aria-pressed={chooser === "mcp"}
                onClick={() => {
                  setChooser("mcp");
                  setQuery("");
                }}
              >
                MCP 连接
              </button>
            </div>
            <label className="cap-search">
              <Icon name="search" size={16} />
              <input
                aria-label="搜索可分配能力"
                placeholder="搜索名称"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {available
              .filter((a) => a.id.toLowerCase().includes(query.toLowerCase()))
              .map((a) => {
                const key = chooser === "skills" ? "skills" : "mcpServers";
                const checked = draft[key].includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={`cap-choice ${checked ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || refreshFailed}
                      onChange={() => toggle(key, a.id)}
                    />
                    <span>
                      <strong>{a.id}</strong>
                      <small>
                        {chooser === "mcp" && `${a.description} · `}
                        {a.enabled ? "已启用" : "已停用"}
                      </small>
                    </span>
                  </label>
                );
              })}
            {!available.filter((a) =>
              a.id.toLowerCase().includes(query.toLowerCase()),
            ).length && (
              <p className="cap-inline-empty">
                {query
                  ? "没有匹配结果"
                  : chooser === "skills"
                    ? "暂无技能"
                    : "暂无 MCP 连接"}
              </p>
            )}
            <button
              className="btn full-width"
              disabled={busy}
              onClick={() => onLibrary(chooser)}
            >
              <Icon name={chooser === "skills" ? "spark" : "plug"} size={16} />
              管理工作区{chooser === "skills" ? "技能" : "连接"}
            </button>
          </section>
        </div>
      )}
      <footer className="cap-member-footer">
        <span role="status">
          {busy ? "处理中…" : dirty ? "有未保存的更改" : ""}
        </span>
        <button
          className="btn"
          disabled={!dirty || busy || refreshFailed}
          onClick={() => {
            setDraft(JSON.parse(baseline));
            setError("");
            setNotice("");
          }}
        >
          放弃更改
        </button>
        <button
          className="btn btn-emerald"
          disabled={!dirty || busy || refreshFailed}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存成员配置"}
        </button>
      </footer>
    </>
  );
}
