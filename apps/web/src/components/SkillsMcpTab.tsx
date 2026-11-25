import { useState } from "react";
import type { RoomConfig } from "@agent-office/shared";
import { api } from "../api/client";
import { Icon } from "./Icon";
import "../styles/capabilities.css";

interface Props {
  room: RoomConfig;
  mode: "skills" | "mcp";
  onRefreshRoom: () => Promise<void>;
}

export function SkillsMcpTab({ room, mode, onRefreshRoom }: Props) {
  const [skillId, setSkillId] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillContent, setSkillContent] = useState("");

  const [mcpName, setMcpName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");

  async function handleAddSkill(e: React.FormEvent) {
    e.preventDefault();
    if (!skillId.trim() || !skillContent.trim()) return;
    await api.upsertSkill(room.id, {
      id: skillId.trim(),
      description: skillDesc.trim(),
      content: skillContent.trim(),
      enabled: true,
    });
    setSkillId("");
    setSkillDesc("");
    setSkillContent("");
    await onRefreshRoom();
  }

  async function handleAddMcp(e: React.FormEvent) {
    e.preventDefault();
    if (!mcpName.trim()) return;
    await api.upsertMcp(room.id, {
      name: mcpName.trim(),
      transport,
      command: transport === "stdio" ? command.trim() : undefined,
      args:
        transport === "stdio"
          ? argsText
              .split(" ")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      url: transport === "http" ? url.trim() : undefined,
      enabled: true,
    });
    setMcpName("");
    setCommand("");
    setArgsText("");
    setUrl("");
    await onRefreshRoom();
  }

  if (mode === "skills") {
    return (
      <>
        <form onSubmit={handleAddSkill} className="panel-card cap-legacy-form">
          <div className="section-header">
            <h3>
              <Icon name="spark" size={16} />
              新建 Skill
            </h3>
          </div>
          <label>
            Skill 标识
            <input
              className="field-input"
              placeholder="seo-audit"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
            />
          </label>
          <label>
            用途
            <input
              className="field-input"
              value={skillDesc}
              onChange={(e) => setSkillDesc(e.target.value)}
            />
          </label>
          <label>
            SKILL.md 内容
            <textarea
              className="field-input"
              rows={4}
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={!skillId.trim() || !skillContent.trim()}
            className="btn btn-emerald full-width"
          >
            <Icon name="plus" size={15} />
            保存技能
          </button>
        </form>

        <div className="section-header">
          <h3>已配置技能 ({room.skills.length})</h3>
        </div>
        <div className="member-list">
          {room.skills.length === 0 && <p className="muted">暂无技能</p>}
          {room.skills.map((skill) => (
            <div key={skill.id} className="task-item-card">
              <div className="task-item-top">
                <strong>{skill.id}</strong>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      aria-label={`启用技能 ${skill.id}`}
                      onChange={(e) =>
                        api
                          .toggleSkill(room.id, skill.id, e.target.checked)
                          .then(onRefreshRoom)
                      }
                    />
                    <span>{skill.enabled ? "已启用" : "已停用"}</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger-ghost"
                    aria-label={`移除技能 ${skill.id}`}
                    onClick={() =>
                      api.removeSkill(room.id, skill.id).then(onRefreshRoom)
                    }
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
              <small className="muted" style={{ wordBreak: "break-all" }}>
                {skill.path}
              </small>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleAddMcp} className="panel-card cap-legacy-form">
        <div className="section-header">
          <h3>
            <Icon name="plug" size={16} />
            添加 MCP
          </h3>
        </div>
        <div className="form-columns">
          <label>
            连接名称
            <input
              className="field-input"
              placeholder="github"
              value={mcpName}
              onChange={(e) => setMcpName(e.target.value)}
            />
          </label>
          <label>
            传输方式
            <select
              className="field-input"
              value={transport}
              onChange={(e) => setTransport(e.target.value as "stdio" | "http")}
            >
              <option value="stdio">stdio（本地进程）</option>
              <option value="http">http（远程端点）</option>
            </select>
          </label>
        </div>
        {transport === "stdio" ? (
          <>
            <label>
              启动命令
              <input
                className="field-input"
                placeholder="npx"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </label>
            <label>
              命令参数（空格分隔）
              <input
                className="field-input"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label>
            服务地址
            <input
              className="field-input"
              placeholder="https://example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={!mcpName.trim()}
          className="btn btn-primary full-width"
        >
          <Icon name="plus" size={15} />
          添加连接
        </button>
      </form>

      <div className="section-header">
        <h3>MCP 连接 ({room.mcpServers.length})</h3>
      </div>
      <div className="member-list">
        {room.mcpServers.length === 0 && <p className="muted">暂无 MCP 连接</p>}
        {room.mcpServers.map((srv) => (
          <div key={srv.name} className="task-item-card">
            <div className="task-item-top">
              <strong>{srv.name}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={srv.enabled}
                    aria-label={`启用 MCP 配置 ${srv.name}`}
                    onChange={(e) =>
                      api
                        .toggleMcp(room.id, srv.name, e.target.checked)
                        .then(onRefreshRoom)
                    }
                  />
                  <span>{srv.enabled ? "启用" : "停用"}</span>
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-danger-ghost"
                  aria-label={`移除连接 ${srv.name}`}
                  onClick={() =>
                    api.removeMcp(room.id, srv.name).then(onRefreshRoom)
                  }
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
            <small className="muted" style={{ wordBreak: "break-all" }}>
              {srv.transport === "stdio"
                ? `${srv.command ?? ""} ${(srv.args ?? []).join(" ")}`
                : srv.url}
            </small>
          </div>
        ))}
      </div>
    </>
  );
}
