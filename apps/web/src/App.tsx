import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentWorkStatus, CliProvider, OfficeEvent } from '@agent-office/shared';
import { api, type HealthResponse } from './api/client';
import { AgentsTab } from './components/AgentsTab';
import { FilesLogsTab } from './components/FilesLogsTab';
import { SkillsMcpTab } from './components/SkillsMcpTab';
import { createOfficeGame } from './game/createGame';
import type { OfficeScene } from './game/OfficeScene';
import { useOfficeStore } from './store/officeStore';

type TabKey = 'agents' | 'skills' | 'mcp' | 'files';

const DEMO_SCRIPTS: { status: AgentWorkStatus; bubble: string }[] = [
  { status: 'thinking', bubble: '拆解目录任务中...' },
  { status: 'reading', bubble: '检索项目文档...' },
  { status: 'writing', bubble: '编写核心代码...' },
  { status: 'calling_mcp', bubble: '调用 GitHub MCP' },
  { status: 'running_cmd', bubble: '执行单元测试...' },
  { status: 'idle', bubble: '阶段任务完成' },
];

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<OfficeScene | null>(null);

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
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [leadProvider, setLeadProvider] = useState<CliProvider>('antigravity');
  const [activeTab, setActiveTab] = useState<TabKey>('agents');
  const [demoActive, setDemoActive] = useState(false);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  useEffect(() => {
    if (!containerRef.current) return;
    const { game, scene } = createOfficeGame(containerRef.current, {
      onSelectRoom: (roomId) => selectRoom(roomId),
      onSelectAgent: (roomId, agentId) => {
        selectAgent(roomId, agentId);
        setActiveTab('agents');
      },
    });
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, [selectRoom, selectAgent]);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
    api.listRooms().then(setRooms).catch(() => {});

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/office`);
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as OfficeEvent;
        pushEvent(event);
      } catch {
        // ignore
      }
    };
    return () => ws.close();
  }, [setRooms, pushEvent]);

  useEffect(() => {
    sceneRef.current?.renderRooms(
      rooms,
      agentStates,
      selectedRoomId,
      selectedAgentId,
    );
  }, [rooms, agentStates, selectedRoomId, selectedAgentId]);

  // Optional live demo loop to showcase 2D animations
  useEffect(() => {
    if (!demoActive || rooms.length === 0) return;
    let tick = 0;
    const timer = window.setInterval(() => {
      rooms.forEach((room, rIdx) => {
        room.agents.forEach((agent, aIdx) => {
          const step = DEMO_SCRIPTS[(tick + rIdx + aIdx) % DEMO_SCRIPTS.length];
          pushEvent({
            id: `demo-${Date.now()}-${room.id}-${agent.id}`,
            timestamp: new Date().toISOString(),
            roomId: room.id,
            agentId: agent.id,
            provider: agent.provider,
            status: step.status,
            bubbleText: step.bubble,
          });
        });
      });
      tick += 1;
    }, 2400);

    return () => window.clearInterval(timer);
  }, [demoActive, rooms, pushEvent]);

  const refreshSelectedRoom = useCallback(async () => {
    if (!selectedRoomId) return;
    const updated = await api.getRoom(selectedRoomId);
    upsertRoom(updated);
  }, [selectedRoomId, upsertRoom]);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!roomName.trim() || !folderPath.trim()) return;
    const created = await api.createRoom({
      name: roomName.trim(),
      folderPath: folderPath.trim(),
      leadProvider,
    });
    upsertRoom(created);
    selectRoom(created.id);
    setRoomName('');
    setFolderPath('');
    setShowCreateRoom(false);
  }

  async function handleRemoveRoom(roomId: string) {
    await api.removeRoom(roomId);
    removeRoomLocal(roomId);
  }

  const totalAgents = rooms.reduce((acc, r) => acc + r.agents.length, 0);

  return (
    <div className="office-shell">
      {/* Left 2D Pixel Office Stage */}
      <div className="canvas-stage">
        <header className="hud-topbar">
          <div className="hud-brand">
            <div className="hud-logo">🏢</div>
            <div>
              <div className="hud-title">AGENT OFFICE 2D</div>
              <div className="hud-sub">
                {rooms.length} 房间 · {totalAgents} Agents · 滚轮缩放 / 右键拖拽
              </div>
            </div>
          </div>

          <div className="hud-actions">
            <button
              className={`btn btn-demo ${demoActive ? 'active' : ''}`}
              onClick={() => setDemoActive(!demoActive)}
              title="模拟多 Agent 协同工作动画"
            >
              {demoActive ? '⏸ 停止演示' : '🎬 演示办公动画'}
            </button>
            <button className="btn" onClick={() => sceneRef.current?.zoomBy(-0.15)}>
              −
            </button>
            <button className="btn" onClick={() => sceneRef.current?.resetCamera()}>
              复位
            </button>
            <button className="btn" onClick={() => sceneRef.current?.zoomBy(0.15)}>
              +
            </button>

            <span
              className={`pill-badge ${health?.providers.antigravity.available ? 'online' : ''}`}
            >
              <span className="status-dot" />
              agy
            </span>
            <span
              className={`pill-badge ${health?.providers.codex.available ? 'online' : ''}`}
            >
              <span className="status-dot" />
              codex
            </span>
          </div>
        </header>

        <div ref={containerRef} style={{ flex: 1, width: '100%' }} />

        <div className="hud-legend">
          <span className="legend-item">
            <span className="status-dot" style={{ color: '#94a3b8' }} /> 待机
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ color: '#38bdf8' }} /> 思考
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ color: '#34d399' }} /> 编码
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ color: '#a78bfa' }} /> 命令
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ color: '#f472b6' }} /> MCP
          </span>
          <span className="legend-item">
            <span className="status-dot" style={{ color: '#ef4444' }} /> 异常
          </span>
        </div>
      </div>

      {/* Right Inspector Drawer */}
      <aside className="inspector-drawer">
        <div className="drawer-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>工作区房间 ({rooms.length})</strong>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateRoom(!showCreateRoom)}
            >
              {showCreateRoom ? '收起' : '+ 新建房间'}
            </button>
          </div>

          {rooms.length > 0 && (
            <div className="room-chip-bar">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className={`room-chip ${r.id === selectedRoomId ? 'active' : ''}`}
                  onClick={() => selectRoom(r.id)}
                >
                  📁 {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="drawer-body">
          {(showCreateRoom || rooms.length === 0) && (
            <form onSubmit={handleCreateRoom} className="pixel-card">
              <strong style={{ fontSize: 13 }}>创建本地文件夹房间</strong>
              <input
                className="field-input"
                placeholder="房间名称（如：内容工作室）"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
              <input
                className="field-input"
                placeholder="本地文件夹路径（如：D:\\workspaces\\demo）"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
              />
              <select
                className="field-input"
                value={leadProvider}
                onChange={(e) => setLeadProvider(e.target.value as CliProvider)}
              >
                <option value="antigravity">主 Agent：Antigravity CLI (agy)</option>
                <option value="codex">主 Agent：Codex CLI (codex)</option>
              </select>
              <button type="submit" className="btn btn-primary">
                创建并生成 2D 办公室
              </button>
            </form>
          )}

          {selectedRoom && (
            <>
              <div className="tab-bar">
                {(
                  [
                    ['agents', '团队'],
                    ['skills', 'Skills'],
                    ['mcp', 'MCP'],
                    ['files', '文件/设置'],
                  ] as [TabKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={`tab-btn ${activeTab === key ? 'active' : ''}`}
                    onClick={() => setActiveTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'agents' && (
                <AgentsTab
                  room={selectedRoom}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={(id) => selectAgent(selectedRoom.id, id)}
                  onRefreshRoom={refreshSelectedRoom}
                />
              )}
              {activeTab === 'skills' && (
                <SkillsMcpTab
                  room={selectedRoom}
                  mode="skills"
                  onRefreshRoom={refreshSelectedRoom}
                />
              )}
              {activeTab === 'mcp' && (
                <SkillsMcpTab
                  room={selectedRoom}
                  mode="mcp"
                  onRefreshRoom={refreshSelectedRoom}
                />
              )}
              {activeTab === 'files' && (
                <FilesLogsTab
                  room={selectedRoom}
                  events={recentEvents}
                  onRefreshRoom={refreshSelectedRoom}
                  onRemoveRoom={handleRemoveRoom}
                />
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
