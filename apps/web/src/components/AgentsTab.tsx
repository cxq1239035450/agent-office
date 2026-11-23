import { useState } from 'react';
import {
  CHARACTER_PRESETS,
  type AgentProfile,
  type CliProvider,
  type RoomConfig,
} from '@agent-office/shared';
import { api } from '../api/client';
import { getCharacterPreviewUrl, resolveSpriteKey } from '../game/pixelSprites';

interface Props {
  room: RoomConfig;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onRefreshRoom: () => Promise<void>;
}

function CharacterPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (presetId: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
      }}
    >
      {CHARACTER_PRESETS.map((preset) => {
        const active = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 4px',
              borderRadius: 6,
              border: active ? '2px solid #38bdf8' : '1px solid #334155',
              background: active ? 'rgba(56,189,248,0.14)' : '#0e1526',
              color: active ? '#f8fafc' : '#94a3b8',
              cursor: 'pointer',
            }}
          >
            <img
              src={getCharacterPreviewUrl(preset.id)}
              alt={preset.label}
              style={{
                width: 32,
                height: 38,
                imageRendering: 'pixelated',
              }}
            />
            <span style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{preset.label}</span>
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
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState<CliProvider>('codex');
  const [sprite, setSprite] = useState<string>('developer');
  const [instructions, setInstructions] = useState('');

  const [showSkinPicker, setShowSkinPicker] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [lastOutput, setLastOutput] = useState<string>('');

  const activeAgent: AgentProfile | undefined =
    room.agents.find((a) => a.id === selectedAgentId) ?? room.agents[0];

  async function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    const preset = CHARACTER_PRESETS.find((p) => p.id === sprite);
    const finalName = name.trim() || preset?.label || '新专员';
    await api.addAgent(room.id, {
      name: finalName,
      title: title.trim() || preset?.defaultTitle || 'Worker',
      provider,
      sprite,
      instructions:
        instructions.trim() || `你是${finalName}，负责协助主 Agent 完成文件夹内的相关任务。`,
    });
    setName('');
    setTitle('');
    setInstructions('');
    setShowAdd(false);
    await onRefreshRoom();
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAgent || !prompt.trim()) return;
    setRunning(true);
    setLastOutput('');
    try {
      const res = await api.runAgent(room.id, activeAgent.id, prompt.trim());
      setLastOutput(res.success ? res.output || '(执行完成)' : `错误: ${res.error}`);
    } catch (err) {
      setLastOutput(`请求失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  async function toggleAgentSkill(agent: AgentProfile, skillId: string) {
    const next = agent.skills.includes(skillId)
      ? agent.skills.filter((s) => s !== skillId)
      : [...agent.skills, skillId];
    await api.updateAgent(room.id, agent.id, { skills: next });
    await onRefreshRoom();
  }

  async function toggleAgentMcp(agent: AgentProfile, serverName: string) {
    const next = agent.mcpServers.includes(serverName)
      ? agent.mcpServers.filter((m) => m !== serverName)
      : [...agent.mcpServers, serverName];
    await api.updateAgent(room.id, agent.id, { mcpServers: next });
    await onRefreshRoom();
  }

  async function handleSwitchProvider(agent: AgentProfile, nextProvider: CliProvider) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          房间成员（{room.agents.length}）
        </span>
        <button
          className="btn btn-primary"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? '取消' : '+ 招聘子 Agent'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddAgent} className="pixel-card">
          <strong style={{ fontSize: 12 }}>选择人物形象（13 款职业皮肤）</strong>
          <CharacterPicker
            value={sprite}
            onChange={(id) => {
              setSprite(id);
              const p = CHARACTER_PRESETS.find((x) => x.id === id);
              if (p && !name) setName(p.label);
              if (p && !title) setTitle(p.defaultTitle);
            }}
          />
          <input
            className="field-input"
            placeholder="名称（如：剪辑师 / 开发者）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field-input"
            placeholder="职位（如：Video Editor / Developer）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className="field-input"
            value={provider}
            onChange={(e) => setProvider(e.target.value as CliProvider)}
          >
            <option value="antigravity">Antigravity CLI (agy)</option>
            <option value="codex">Codex CLI (codex)</option>
          </select>
          <textarea
            className="field-input"
            rows={2}
            placeholder="职责说明（System Instructions）"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            确认加入房间
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {room.agents.map((agent) => {
          const isSelected = activeAgent?.id === agent.id;
          const spriteKey = resolveSpriteKey(
            agent.avatar?.sprite,
            agent.roleType,
            agent.provider,
          );
          return (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: isSelected ? '#0f172a' : '#162033',
                border: isSelected ? '1px solid #38bdf8' : '1px solid #283552',
              }}
            >
              <img
                src={getCharacterPreviewUrl(spriteKey)}
                alt={agent.name}
                style={{ width: 28, height: 34, imageRendering: 'pixelated' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {agent.roleType === 'lead' ? '★ ' : ''}
                    {agent.name}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{agent.provider}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {agent.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activeAgent && (
        <div className="pixel-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>{activeAgent.name} 配置与指令</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => setShowSkinPicker(!showSkinPicker)}
              >
                {showSkinPicker ? '收起形象' : '换人物形象'}
              </button>
              {activeAgent.roleType !== 'lead' && (
                <button
                  onClick={() => handleDeleteAgent(activeAgent.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>CLI 引擎:</span>
            <select
              className="field-input"
              value={activeAgent.provider}
              onChange={(e) =>
                handleSwitchProvider(activeAgent, e.target.value as CliProvider)
              }
            >
              <option value="antigravity">Antigravity CLI (agy)</option>
              <option value="codex">Codex CLI (codex)</option>
            </select>
          </div>

          <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.4 }}>
            职责：{activeAgent.instructions}
          </div>

          {room.skills.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>分配 Skills：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {room.skills.map((s) => (
                  <label
                    key={s.id}
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <input
                      type="checkbox"
                      checked={activeAgent.skills.includes(s.id)}
                      onChange={() => toggleAgentSkill(activeAgent, s.id)}
                    />
                    {s.id}
                  </label>
                ))}
              </div>
            </div>
          )}

          {room.mcpServers.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>分配 MCP：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {room.mcpServers.map((m) => (
                  <label
                    key={m.name}
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <input
                      type="checkbox"
                      checked={activeAgent.mcpServers.includes(m.name)}
                      onChange={() => toggleAgentMcp(activeAgent, m.name)}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleRun} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              className="field-input"
              rows={2}
              placeholder={`给 ${activeAgent.name} 下达任务...`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="submit"
                disabled={running}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {running ? '执行中...' : '▶ 派发任务'}
              </button>
              {running && (
                <button
                  type="button"
                  onClick={() => api.stopAgent(room.id, activeAgent.id)}
                  className="btn"
                  style={{ background: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                >
                  停止
                </button>
              )}
            </div>
          </form>

          {lastOutput && (
            <pre
              style={{
                margin: 0,
                padding: 8,
                borderRadius: 6,
                background: '#020617',
                color: '#e2e8f0',
                fontSize: 11,
                maxHeight: 160,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {lastOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
