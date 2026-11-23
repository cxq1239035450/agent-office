import { useEffect, useState } from 'react';
import type { OfficeEvent, RoomConfig } from '@agent-office/shared';
import { api, type FileEntry } from '../api/client';

interface Props {
  room: RoomConfig;
  events: OfficeEvent[];
  onRefreshRoom: () => Promise<void>;
  onRemoveRoom: (roomId: string) => Promise<void>;
}

export function FilesLogsTab({
  room,
  events,
  onRefreshRoom,
  onRemoveRoom,
}: Props) {
  const [subPath, setSubPath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setSubPath('');
  }, [room.id]);

  useEffect(() => {
    setError('');
    api
      .listFiles(room.id, subPath)
      .then(setFiles)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [room.id, subPath]);

  const roomEvents = events.filter((e) => e.roomId === room.id);

  function goUp() {
    const parts = subPath.split('/').filter(Boolean);
    parts.pop();
    setSubPath(parts.join('/'));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 12 }}>房间设置</strong>
          <button
            onClick={() => onRemoveRoom(room.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            从办公室移除
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#94a3b8' }}>2D 房间主题:</span>
          <select
            value={room.theme}
            onChange={(e) =>
              api
                .updateRoom(room.id, {
                  theme: e.target.value as RoomConfig['theme'],
                })
                .then(onRefreshRoom)
            }
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: 12,
            }}
          >
            <option value="modern">Modern（现代深蓝）</option>
            <option value="retro">Retro（复古暖灰）</option>
            <option value="studio">Studio（创意紫）</option>
          </select>
        </div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <strong style={{ fontSize: 12 }}>
            目录文件 {subPath ? `/${subPath}` : '/'}
          </strong>
          {subPath && (
            <button
              onClick={goUp}
              style={{
                background: 'transparent',
                border: '1px solid #475569',
                borderRadius: 4,
                color: '#cbd5e1',
                fontSize: 11,
                padding: '2px 6px',
                cursor: 'pointer',
              }}
            >
              返回上级
            </button>
          )}
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 11 }}>{error}</div>}
        <div
          style={{
            maxHeight: 170,
            overflowY: 'auto',
            background: '#0f172a',
            borderRadius: 8,
            border: '1px solid #334155',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {files.length === 0 && (
            <span style={{ fontSize: 11, color: '#64748b' }}>空目录</span>
          )}
          {files.map((f) => (
            <div
              key={f.path}
              onClick={() => f.type === 'dir' && setSubPath(f.path)}
              style={{
                fontSize: 12,
                padding: '4px 6px',
                borderRadius: 4,
                cursor: f.type === 'dir' ? 'pointer' : 'default',
                color: f.type === 'dir' ? '#38bdf8' : '#e2e8f0',
              }}
            >
              {f.type === 'dir' ? '📁 ' : '📄 '}
              {f.name}
            </div>
          ))}
        </div>
      </div>

      <div>
        <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          本房间实时事件（{roomEvents.length}）
        </strong>
        <div
          style={{
            maxHeight: 160,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {roomEvents.length === 0 && (
            <span style={{ fontSize: 11, color: '#64748b' }}>暂无运行事件</span>
          )}
          {roomEvents.map((ev) => (
            <div
              key={ev.id}
              style={{
                padding: 6,
                borderRadius: 6,
                background: '#0f172a',
                fontSize: 11,
                color: '#cbd5e1',
              }}
            >
              <strong>[{ev.provider}]</strong> {ev.status} — {ev.bubbleText ?? ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
