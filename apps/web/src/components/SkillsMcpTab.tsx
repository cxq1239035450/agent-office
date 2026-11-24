import { useState } from "react";
import type { RoomConfig } from "@agent-office/shared";
import { api } from "../api/client";

interface Props {
  room: RoomConfig;
  mode: "skills" | "mcp";
  onRefreshRoom: () => Promise<void>;
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-card)",
  color: "var(--text-main)",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};

export function SkillsMcpTab({ room, mode, onRefreshRoom }: Props) {
  // Skill form
  const [skillId, setSkillId] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillContent, setSkillContent] = useState("");

  // MCP form
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
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <form
          onSubmit={handleAddSkill}
          style={{
            padding: 10,
            borderRadius: 8,
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <strong style={{ fontSize: 12 }}>
            新建 Skill（自动生成 SKILL.md）
          </strong>
          <input
            placeholder="Skill ID（如：code-review）"
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="简短描述"
            value={skillDesc}
            onChange={(e) => setSkillDesc(e.target.value)}
            style={inputStyle}
          />
          <textarea
            rows={4}
            placeholder="Skill 指令内容（Markdown）"
            value={skillContent}
            onChange={(e) => setSkillContent(e.target.value)}
            style={inputStyle}
          />
          <button
            type="submit"
            style={{
              padding: 7,
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "var(--bg-card)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + 保存 Skill
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {room.skills.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              暂无 Skill
            </span>
          )}
          {room.skills.map((skill) => (
            <div
              key={skill.id}
              style={{
                padding: 8,
                borderRadius: 8,
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{skill.id}</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                  {skill.path}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  onChange={(e) =>
                    api
                      .toggleSkill(room.id, skill.id, e.target.checked)
                      .then(onRefreshRoom)
                  }
                />
                <button
                  onClick={() =>
                    api.removeSkill(room.id, skill.id).then(onRefreshRoom)
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--danger)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form
        onSubmit={handleAddMcp}
        style={{
          padding: 10,
          borderRadius: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 12 }}>
          接入 MCP Server（自动同步双 CLI）
        </strong>
        <input
          placeholder="服务名（如：filesystem / github）"
          value={mcpName}
          onChange={(e) => setMcpName(e.target.value)}
          style={inputStyle}
        />
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as "stdio" | "http")}
          style={inputStyle}
        >
          <option value="stdio">stdio（本地命令）</option>
          <option value="http">http（远程端点）</option>
        </select>
        {transport === "stdio" ? (
          <>
            <input
              placeholder="启动命令（如：npx）"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="参数（空格分隔，如：-y @modelcontextprotocol/server-github）"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              style={inputStyle}
            />
          </>
        ) : (
          <input
            placeholder="MCP Endpoint URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
          />
        )}
        <button
          type="submit"
          style={{
            padding: 7,
            borderRadius: 6,
            border: "none",
            background: "#a78bfa",
            color: "var(--bg-card)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + 添加 MCP Server
        </button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {room.mcpServers.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            暂无 MCP Server
          </span>
        )}
        {room.mcpServers.map((srv) => (
          <div
            key={srv.name}
            style={{
              padding: 8,
              borderRadius: 8,
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{srv.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {srv.transport === "stdio"
                  ? `${srv.command ?? ""} ${(srv.args ?? []).join(" ")}`
                  : srv.url}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={srv.enabled}
                onChange={(e) =>
                  api
                    .toggleMcp(room.id, srv.name, e.target.checked)
                    .then(onRefreshRoom)
                }
              />
              <button
                onClick={() =>
                  api.removeMcp(room.id, srv.name).then(onRefreshRoom)
                }
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
