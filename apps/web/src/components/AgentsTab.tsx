import { useState } from "react";
import {
  CHARACTER_PRESETS,
  type AgentProfile,
  type CliProvider,
  type RoomConfig,
} from "@agent-office/shared";
import { api } from "../api/client";
import { Character } from "./Character";
import { Icon } from "./Icon";
import { resolveSpriteKey } from "../game/pixelSprites";

interface Props {
  room: RoomConfig;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onRefreshRoom: () => Promise<void>;
  onConfigure: () => void;
}

function CharacterPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (presetId: string) => void;
}) {
  return (
    <div className="character-picker">
      {CHARACTER_PRESETS.map((preset) => {
        const active = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            className={`character-choice ${active ? "active" : ""}`}
            onClick={() => onChange(preset.id)}
            aria-pressed={active}
            aria-label={preset.label}
          >
            <Character id={preset.id} label={preset.label} size={46} />
            <span>{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AgentsTab({
  room,
  selectedAgentId,
  onSelectAgent,
  onRefreshRoom,
  onConfigure,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<CliProvider>("codex");
  const [sprite, setSprite] = useState<string>("developer");
  const [instructions, setInstructions] = useState("");

  const [showSkinPicker, setShowSkinPicker] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mandate, setMandate] = useState("");
  const [isolateWorktree, setIsolateWorktree] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastOutput, setLastOutput] = useState<string>("");

  const activeAgent: AgentProfile | undefined =
    room.agents.find((a) => a.id === selectedAgentId) ?? room.agents[0];

  async function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    const preset = CHARACTER_PRESETS.find((p) => p.id === sprite);
    const finalName = name.trim() || preset?.label || "新专员";
    await api.addAgent(room.id, {
      name: finalName,
      title: title.trim() || preset?.defaultTitle || "Worker",
      provider,
      sprite,
      instructions:
        instructions.trim() ||
        `你是${finalName}，负责协助主 Agent 完成文件夹内的相关任务。`,
    });
    setName("");
    setTitle("");
    setInstructions("");
    setShowAdd(false);
    await onRefreshRoom();
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAgent || !prompt.trim()) return;
    setRunning(true);
    setLastOutput("");
    try {
      const isWorker = activeAgent.roleType === "worker";
      const res = await api.dispatchTask(room.id, activeAgent.id, {
        prompt: prompt.trim(),
        routeMode: isWorker ? "pass_through" : "router",
        mandate: mandate.trim() || undefined,
        isolateWorktree: isWorker ? isolateWorktree : false,
        async: true,
      });
      setPrompt("");
      const wtInfo = res.task.worktreeBranch
        ? `\n隔离分支: ${res.task.worktreeBranch}`
        : "";
      setLastOutput(`已提交\n任务: ${res.task.id}${wtInfo}`);
    } catch (err) {
      setLastOutput(
        `请求失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setRunning(false);
    }
  }

  async function handleSwitchProvider(
    agent: AgentProfile,
    nextProvider: CliProvider,
  ) {
    await api.updateAgent(room.id, agent.id, { provider: nextProvider });
    await onRefreshRoom();
  }

  async function handleSwitchSprite(agent: AgentProfile, nextSprite: string) {
    await api.updateAgent(room.id, agent.id, { sprite: nextSprite });
    setShowSkinPicker(false);
    await onRefreshRoom();
  }

  async function handleDeleteAgent(agentId: string) {
    await api.removeAgent(room.id, agentId);
    onSelectAgent(null);
    await onRefreshRoom();
  }

  return (
    <>
      <div className="section-header">
        <h3>
          <Icon name="team" size={16} />
          成员 ({room.agents.length})
        </h3>
        <button
          type="button"
          className={`btn btn-sm ${showAdd ? "" : "btn-primary"}`}
          onClick={() => setShowAdd(!showAdd)}
          aria-expanded={showAdd}
        >
          <Icon name={showAdd ? "close" : "plus"} size={14} />
          {showAdd ? "取消" : "添加专员"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddAgent} className="panel-card">
          <span className="field-label">形象</span>
          <CharacterPicker
            value={sprite}
            onChange={(id) => {
              setSprite(id);
              const p = CHARACTER_PRESETS.find((x) => x.id === id);
              const previous = CHARACTER_PRESETS.find((x) => x.id === sprite);
              if (p && (!name || name === previous?.label)) setName(p.label);
              if (p && (!title || title === previous?.defaultTitle))
                setTitle(p.defaultTitle);
            }}
          />
          <div className="form-columns">
            <label className="field-label">
              姓名
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field-label">
              职位
              <input
                className="field-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <label className="field-label">
            执行引擎
            <select
              className="field-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as CliProvider)}
            >
              <option value="codex">Codex CLI</option>
              <option value="antigravity">Antigravity CLI</option>
            </select>
          </label>
          <label className="field-label">
            职责
            <textarea
              className="field-input"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-emerald full-width">
            <Icon name="check" size={15} />
            添加专员
          </button>
        </form>
      )}

      <div className="member-list">
        {room.agents.map((agent) => {
          const isSelected = activeAgent?.id === agent.id;
          const spriteKey = resolveSpriteKey(
            agent.avatar?.sprite,
            agent.roleType,
            agent.provider,
          );
          return (
            <button
              key={agent.id}
              type="button"
              className={`member-row ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectAgent(agent.id)}
              aria-pressed={isSelected}
              aria-label={`${agent.name} · ${agent.roleType === "lead" ? "主管" : "专员"}`}
            >
              <Character id={spriteKey} label={agent.name} size={42} />
              <span className="member-row-info">
                <strong>
                  {agent.name}
                  {agent.roleType === "lead" && (
                    <span className="badge badge-neutral">主管</span>
                  )}
                </strong>
                <small>{agent.title}</small>
              </span>
            </button>
          );
        })}
      </div>

      {activeAgent && (
        <div className="panel-card panel-card-white">
          <div className="section-header">
            <h3>{activeAgent.name}</h3>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowSkinPicker(!showSkinPicker)}
                aria-expanded={showSkinPicker}
              >
                {showSkinPicker ? "收起" : "形象"}
              </button>
              {activeAgent.roleType !== "lead" && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger-ghost"
                  onClick={() => handleDeleteAgent(activeAgent.id)}
                >
                  <Icon name="trash" size={13} />
                  移除
                </button>
              )}
            </div>
          </div>

          {showSkinPicker && (
            <CharacterPicker
              value={resolveSpriteKey(
                activeAgent.avatar?.sprite,
                activeAgent.roleType,
                activeAgent.provider,
              )}
              onChange={(next) => handleSwitchSprite(activeAgent, next)}
            />
          )}

          <label className="field-label">
            执行引擎
            <select
              className="field-input"
              value={activeAgent.provider}
              onChange={(e) =>
                handleSwitchProvider(activeAgent, e.target.value as CliProvider)
              }
            >
              <option value="codex">Codex CLI</option>
              <option value="antigravity">Antigravity CLI</option>
            </select>
          </label>

          <p className="muted">{activeAgent.instructions}</p>
          <button className="btn btn-emerald full-width" onClick={onConfigure}>
            <Icon name="settings" size={16} />
            配置职责、Skills 与 MCP
          </button>

          <form
            onSubmit={handleRun}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingTop: 6,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <textarea
              className="field-input"
              rows={2}
              aria-label={`给 ${activeAgent.name} 的任务`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <details className="member-task-options">
              <summary>任务选项</summary>
              <label className="field-label">
                权限范围（可选）
                <input
                  className="field-input"
                  value={mandate}
                  onChange={(e) => setMandate(e.target.value)}
                />
              </label>
              {activeAgent.roleType === "worker" && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={isolateWorktree}
                    onChange={(e) => setIsolateWorktree(e.target.checked)}
                  />
                  <span>独立 Git 工作区</span>
                </label>
              )}
            </details>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="submit"
                disabled={running || !prompt.trim()}
                className={`btn ${activeAgent.roleType === "worker" ? "btn-emerald" : "btn-primary"}`}
                style={{ flex: 1 }}
              >
                <Icon
                  name={activeAgent.roleType === "worker" ? "bolt" : "send"}
                  size={14}
                />
                {running
                  ? "提交中..."
                  : activeAgent.roleType === "worker"
                    ? "发送"
                    : "交给主管"}
              </button>
              <button
                type="button"
                onClick={() => api.stopAgent(room.id, activeAgent.id)}
                className="btn btn-danger-ghost"
              >
                停止
              </button>
            </div>
          </form>

          {lastOutput && <pre className="code-log-box">{lastOutput}</pre>}
        </div>
      )}
    </>
  );
}
