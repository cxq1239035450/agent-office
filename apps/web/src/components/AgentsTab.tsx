import { useState } from 'react';
import type { AgentProfile, CliProvider, RoomConfig } from '@agent-office/shared';
import { api } from '../api/client';

interface Props {
  room: RoomConfig;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onRefreshRoom: () => Promise<void>;
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#f8fafc',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
};

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
  const [instructions, setInstructions] = useState('');

  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [lastOutput, setLastOutput] = useState<string>('');

  const activeAgent: AgentProfile | undefined =
    room.agents.find((a) => a.id === selectedAgentId) ?? room.agents[0];

  async function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.addAgent(room.id, {
      name: name.trim(),
      title: title.trim() || 'Worker',
      provider,
      instructions: instructions.trim() || '协助主 Agent 完成文件夹内分配的任务。',
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
          onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            background: '#38bdf8',
            color: '#0f172a',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showAdd ? '取消' : '+ 招聘子 Agent'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAddAgent}
          style={{
            padding: 10,
            borderRadius: 8,
            background: '#0f172a',
            border: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <input
            placeholder="名称（如：前端专员）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="职位（如：Frontend Engineer）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as CliProvider)}
            style={inputStyle}
          >
            <option value="antigravity">Antigravity CLI (agy)</option>
            <option value="codex">Codex CLI (codex)</option>
          </select>
          <textarea
            rows={3}
            placeholder="职责说明（System Instructions）"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            style={inputStyle}
          />
          <button
            type="submit"
            style={{
              padding: 7,
              borderRadius: 6,
              border: 'none',
              background: '#34d399',
              color: '#0f172a',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            确认加入房间
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {room.agents.map((agent) => {
          const isSelected = activeAgent?.id === agent.id;
          return (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              style={{
                padding: 8,
                borderRadius: 8,
                cursor: 'pointer',
                background: isSelected ? '#0f172a' : '#162033',
                border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {agent.roleType === 'lead' ? '★ ' : '• '}
                  {agent.name}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{agent.provider}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{agent.title}</div>
            </div>
          );
        })}
      </div>

      {activeAgent && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: '#0f172a',
            border: '1px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>{activeAgent.name} 配置与指令</strong>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#94a3b8' }}>CLI 引擎:</span>
            <select
              value={activeAgent.provider}
              onChange={(e) =>
                handleSwitchProvider(activeAgent, e.target.value as CliProvider)
              }
              style={{ ...inputStyle, width: 'auto', flex: 1 }}
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
                {room.skills.map((s) => {
                  const checked = activeAgent.skills.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAgentSkill(activeAgent, s.id)}
                      />
                      {s.id}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {room.mcpServers.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>分配 MCP：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {room.mcpServers.map((m) => {
                  const checked = activeAgent.mcpServers.includes(m.name);
                  return (
                    <label
                      key={m.name}
                      style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAgentMcp(activeAgent, m.name)}
                      />
                      {m.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleRun} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              rows={2}
              placeholder={`给 ${activeAgent.name} 下达任务...`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="submit"
                disabled={running}
                style={{
                  flex: 1,
                  padding: 7,
                  borderRadius: 6,
                  border: 'none',
                  background: running ? '#475569' : '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 600,
                  cursor: running ? 'not-allowed' : 'pointer',
                }}
              >
                {running ? '执行中...' : '▶ 派发任务'}
              </button>
              {running && (
                <button
                  type="button"
                  onClick={() => api.stopAgent(room.id, activeAgent.id)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
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
