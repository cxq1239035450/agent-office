import Phaser from 'phaser';
import type { AgentRuntimeState, RoomConfig } from '@agent-office/shared';
import { registerPixelTextures, resolveSpriteKey } from './pixelSprites';

const STATUS_STYLE: Record<string, { color: number; label: string }> = {
  idle: { color: 0x94a3b8, label: '待机' },
  thinking: { color: 0x38bdf8, label: '思考中' },
  reading: { color: 0xfbbf24, label: '阅读资料' },
  writing: { color: 0x34d399, label: '编写代码' },
  running_cmd: { color: 0xa78bfa, label: '运行命令' },
  calling_mcp: { color: 0xf472b6, label: '调用 MCP' },
  delegating: { color: 0x22d3ee, label: '派发任务' },
  waiting_approval: { color: 0xf97316, label: '等待确认' },
  error: { color: 0xef4444, label: '异常' },
};

const ROOM_THEMES = {
  modern: {
    wallTop: 0x2c3e50,
    wallTrim: 0x1a252f,
    floorA: 0xc89b6e,
    floorB: 0xbe8f61,
    rug: 0x334155,
    rugBorder: 0x64748b,
    windowSky: 0x7dd3fc,
    deskTop: 0xe2e8f0,
    deskSide: 0x94a3b8,
  },
  retro: {
    wallTop: 0x5c4033,
    wallTrim: 0x3b271e,
    floorA: 0xb07d4f,
    floorB: 0xa26f43,
    rug: 0x7f1d1d,
    rugBorder: 0xfbbf24,
    windowSky: 0xfdba74,
    deskTop: 0xd97706,
    deskSide: 0x92400e,
  },
  studio: {
    wallTop: 0x2e1f47,
    wallTrim: 0x1b122b,
    floorA: 0x475569,
    floorB: 0x3f4c5e,
    rug: 0x312e81,
    rugBorder: 0x818cf8,
    windowSky: 0x1e1b4b,
    deskTop: 0x334155,
    deskSide: 0x1e293b,
  },
} as const;

export interface SceneCallbacks {
  onSelectRoom: (roomId: string) => void;
  onSelectAgent: (roomId: string, agentId: string) => void;
}

export class OfficeScene extends Phaser.Scene {
  private roomLayer?: Phaser.GameObjects.Container;
  private callbacks?: SceneCallbacks;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(callbacks?: SceneCallbacks) {
    super({ key: 'OfficeScene' });
    this.callbacks = callbacks;
  }

  create() {
    registerPixelTextures(this);
    this.cameras.main.setBackgroundColor('#111827');
    this.roomLayer = this.add.container(0, 0);

    // Subtle background dot grid
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x1f2937, 0.7);
    for (let gx = 0; gx < 2400; gx += 24) {
      for (let gy = 0; gy < 1600; gy += 24) {
        bgGfx.fillRect(gx, gy, 2, 2);
      }
    }
    bgGfx.setDepth(-10);

    // Mouse wheel zoom
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _objs: Phaser.GameObjects.GameObject[],
        _dx: number,
        dy: number,
      ) => {
        const cam = this.cameras.main;
        const next = Phaser.Math.Clamp(cam.zoom - dy * 0.0008, 0.65, 1.65);
        cam.setZoom(next);
      },
    );

    // Drag to pan (right click or middle click)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        const cam = this.cameras.main;
        cam.scrollX -= (pointer.x - this.dragStartX) / cam.zoom;
        cam.scrollY -= (pointer.y - this.dragStartY) / cam.zoom;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
      }
    });

    this.input.on('pointerup', () => {
      this.isDragging = false;
    });

    this.renderRooms([], {}, null, null);
  }

  resetCamera() {
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.setScroll(0, 0);
  }

  zoomBy(delta: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom + delta, 0.65, 1.65));
  }

  renderRooms(
    rooms: RoomConfig[],
    agentStates: Record<string, AgentRuntimeState>,
    selectedRoomId: string | null,
    selectedAgentId: string | null,
  ) {
    if (!this.roomLayer) return;
    this.tweens.killAll();
    this.roomLayer.removeAll(true);

    if (rooms.length === 0) {
      this.renderWelcomeFloor();
      return;
    }

    const roomW = 500;
    const roomH = 330;
    const gap = 40;

    rooms.forEach((room, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 36 + col * (roomW + gap);
      const y = 36 + row * (roomH + gap);
      this.drawSingleRoom(
        room,
        x,
        y,
        roomW,
        roomH,
        agentStates,
        room.id === selectedRoomId,
        selectedAgentId,
      );
    });
  }

  private renderWelcomeFloor() {
    const card = this.add
      .rectangle(420, 250, 440, 180, 0x1e293b)
      .setStrokeStyle(3, 0x38bdf8);
    const title = this.add
      .text(420, 210, '🏢 欢迎来到 AGENT OFFICE', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f8fafc',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const desc = this.add
      .text(
        420,
        265,
        '在右侧面板点击「+ 新建房间」绑定一个本地文件夹\n系统将自动生成 2D 像素办公室与主 Agent 团队',
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#94a3b8',
          align: 'center',
          lineSpacing: 8,
        },
      )
      .setOrigin(0.5);
    const plantL = this.add.image(245, 250, 'prop_plant');
    const plantR = this.add.image(595, 250, 'prop_plant');
    this.roomLayer!.add([card, title, desc, plantL, plantR]);
  }

  private drawSingleRoom(
    room: RoomConfig,
    x: number,
    y: number,
    w: number,
    h: number,
    agentStates: Record<string, AgentRuntimeState>,
    isRoomSelected: boolean,
    selectedAgentId: string | null,
  ) {
    const t = ROOM_THEMES[room.theme] ?? ROOM_THEMES.modern;
    const wallH = 74;

    // Outer drop shadow
    const shadow = this.add
      .rectangle(x + 8, y + 10, w, h, 0x000000, 0.45)
      .setOrigin(0, 0);
    this.roomLayer!.add(shadow);

    // Clickable room container hit area
    const frame = this.add
      .rectangle(x, y, w, h, t.floorA)
      .setOrigin(0, 0)
      .setStrokeStyle(isRoomSelected ? 4 : 3, isRoomSelected ? 0x38bdf8 : 0x0f172a)
      .setInteractive({ useHandCursor: true });

    frame.on('pointerdown', () => {
      this.callbacks?.onSelectRoom(room.id);
    });
    this.roomLayer!.add(frame);

    // Pixel wood plank floor
    const floorGfx = this.add.graphics();
    const plankH = 16;
    for (let py = y + wallH; py < y + h - 4; py += plankH) {
      const rowIdx = Math.floor((py - (y + wallH)) / plankH);
      floorGfx.fillStyle(rowIdx % 2 === 0 ? t.floorA : t.floorB, 1);
      floorGfx.fillRect(x + 4, py, w - 8, Math.min(plankH, y + h - 4 - py));
      floorGfx.fillStyle(0x000000, 0.08);
      floorGfx.fillRect(x + 4, py + plankH - 1, w - 8, 1);
      for (let px = x + 4 + (rowIdx % 2) * 32; px < x + w - 8; px += 64) {
        floorGfx.fillRect(px, py, 1, plankH);
      }
    }

    // Center cozy rug
    floorGfx.fillStyle(t.rug, 0.9);
    floorGfx.fillRect(x + 64, y + 122, w - 128, h - 154);
    floorGfx.lineStyle(2, t.rugBorder, 0.8);
    floorGfx.strokeRect(x + 68, y + 126, w - 136, h - 162);

    // Back Wall + baseboard trim
    floorGfx.fillStyle(t.wallTop, 1);
    floorGfx.fillRect(x + 3, y + 3, w - 6, wallH - 10);
    floorGfx.fillStyle(t.wallTrim, 1);
    floorGfx.fillRect(x + 3, y + wallH - 10, w - 6, 10);

    // Pixel Windows (left & right)
    const drawWindow = (wx: number) => {
      floorGfx.fillStyle(0x0f172a, 1);
      floorGfx.fillRect(wx - 2, y + 14, 58, 38);
      floorGfx.fillStyle(t.windowSky, 1);
      floorGfx.fillRect(wx, y + 16, 54, 34);
      // Window clouds / stars
      floorGfx.fillStyle(0xffffff, 0.75);
      floorGfx.fillRect(wx + 8, y + 24, 14, 5);
      floorGfx.fillRect(wx + 32, y + 32, 12, 4);
      // Window cross muntins
      floorGfx.fillStyle(0xf8fafc, 0.9);
      floorGfx.fillRect(wx + 26, y + 16, 2, 34);
      floorGfx.fillRect(wx, y + 32, 54, 2);
    };
    drawWindow(x + 24);
    drawWindow(x + w - 82);

    // Center wall whiteboard / room nameplate
    floorGfx.fillStyle(0xf8fafc, 1);
    floorGfx.fillRect(x + 116, y + 12, w - 232, 44);
    floorGfx.lineStyle(3, 0x475569, 1);
    floorGfx.strokeRect(x + 116, y + 12, w - 232, 44);

    this.roomLayer!.add(floorGfx);

    // Room nameplate text
    const title = this.add
      .text(x + w / 2, y + 23, `📁 ${room.name}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#0f172a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5);

    const subtitle = this.add
      .text(
        x + w / 2,
        y + 42,
        `${room.agents.length} Agents · ${room.skills.filter((s) => s.enabled).length} Skills · ${room.mcpServers.filter((m) => m.enabled).length} MCP`,
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#334155',
        },
      )
      .setOrigin(0.5, 0.5);

    // Room Props (Bookshelf, Plant, Coffee machine)
    const bookshelf = this.add.image(x + 36, y + wallH + 6, 'prop_bookshelf');
    const plant = this.add.image(x + w - 34, y + h - 30, 'prop_plant');
    const coffee = this.add.image(x + w - 36, y + wallH + 12, 'prop_coffee');

    // Bottom folder path tag
    const pathBadge = this.add
      .text(x + 12, y + h - 18, room.folderPath, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f8fafc',
        backgroundColor: '#0f172acc',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0, 0.5);

    this.roomLayer!.add([title, subtitle, bookshelf, plant, coffee, pathBadge]);

    // Draw Agent workstations
    room.agents.forEach((agent, aIdx) => {
      const col = aIdx % 3;
      const row = Math.floor(aIdx / 3);
      const ax = x + 106 + col * 144;
      const ay = y + 146 + row * 102;

      const stateKey = `${room.id}:${agent.id}`;
      const runtimeState = agentStates[stateKey];
      const status = runtimeState?.status ?? 'idle';
      const statusMeta = STATUS_STYLE[status] ?? STATUS_STYLE.idle;
      const isActive = status !== 'idle';
      const isSelected = isRoomSelected && agent.id === selectedAgentId;
      const isLead = agent.roleType === 'lead';

      // Workstation Desk Graphics
      const deskGfx = this.add.graphics();
      // Desk shadow
      deskGfx.fillStyle(0x000000, 0.25);
      deskGfx.fillRect(ax - 44, ay + 24, 88, 12);
      // Desk legs
      deskGfx.fillStyle(0x1e293b, 1);
      deskGfx.fillRect(ax - 40, ay + 16, 6, 18);
      deskGfx.fillRect(ax + 34, ay + 16, 6, 18);
      // Desk top
      deskGfx.fillStyle(t.deskTop, 1);
      deskGfx.fillRect(ax - 44, ay + 4, 88, 16);
      deskGfx.fillStyle(t.deskSide, 1);
      deskGfx.fillRect(ax - 44, ay + 18, 88, 4);
      deskGfx.lineStyle(2, isLead ? 0xfbbf24 : 0x0f172a, 1);
      deskGfx.strokeRect(ax - 44, ay + 4, 88, 18);

      // Monitor on desk
      deskGfx.fillStyle(0x0f172a, 1);
      deskGfx.fillRect(ax - 18, ay - 14, 36, 22);
      deskGfx.fillStyle(isActive ? statusMeta.color : 0x1e293b, 1);
      deskGfx.fillRect(ax - 15, ay - 11, 30, 16);
      if (isActive) {
        // Code lines on monitor
        deskGfx.fillStyle(0xffffff, 0.85);
        deskGfx.fillRect(ax - 12, ay - 8, 14, 2);
        deskGfx.fillRect(ax - 12, ay - 4, 22, 2);
        deskGfx.fillRect(ax - 12, ay, 10, 2);
      }
      // Keyboard & little coffee mug
      deskGfx.fillStyle(0x334155, 1);
      deskGfx.fillRect(ax - 12, ay + 10, 24, 5);
      deskGfx.fillStyle(0xf8fafc, 1);
      deskGfx.fillRect(ax + 24, ay + 8, 6, 6);

      // Character Sprite (uses 13 chibi pixel presets)
      const presetId = resolveSpriteKey(
        agent.avatar?.sprite,
        agent.roleType,
        agent.provider,
      );
      const baseKey = `char_${presetId}`;
      const sprite = this.add
        .image(ax, ay - 26, `${baseKey}_idle`)
        .setInteractive({ useHandCursor: true });

      sprite.on(
        'pointerdown',
        (
          _pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          this.callbacks?.onSelectAgent(room.id, agent.id);
        },
      );

      // Character animations (work frame when active, subtle walk/breathe when idle)
      if (isActive) {
        let toggle = false;
        this.tweens.add({
          targets: sprite,
          y: ay - 28,
          duration: 240,
          yoyo: true,
          repeat: -1,
          onRepeat: () => {
            toggle = !toggle;
            sprite.setTexture(toggle ? `${baseKey}_work` : `${baseKey}_idle`);
          },
        });
      } else {
        let step = 0;
        this.tweens.add({
          targets: sprite,
          x: ax + ((aIdx % 2 === 0 ? 1 : -1) * 10),
          duration: 1600 + (aIdx % 3) * 260,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            step += 1;
            if (step % 18 === 0) {
              const phase = (step / 18) % 3;
              sprite.setTexture(
                phase === 0
                  ? `${baseKey}_walkA`
                  : phase === 1
                    ? `${baseKey}_walkB`
                    : `${baseKey}_idle`,
              );
            }
          },
        });
      }

      // Selection ring around selected agent
      if (isSelected) {
        const ring = this.add
          .rectangle(ax, ay - 4, 96, 86)
          .setStrokeStyle(2, 0x38bdf8, 1);
        this.roomLayer!.add(ring);
      }

      // Nameplate under desk
      const nameTag = this.add
        .text(ax, ay + 35, `${isLead ? '★ ' : ''}${agent.name}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: isSelected ? '#38bdf8' : '#f8fafc',
          backgroundColor: '#0f172add',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 0.5);

      // Status dot + provider pill
      const statusDot = this.add.circle(ax - 36, ay + 50, 4, statusMeta.color);
      const statusText = this.add
        .text(ax - 28, ay + 50, `${agent.provider} · ${statusMeta.label}`, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#e2e8f0',
        })
        .setOrigin(0, 0.5);

      this.roomLayer!.add([deskGfx, sprite, nameTag, statusDot, statusText]);

      // Speech Bubble (pixel-style white dialog box)
      if (runtimeState?.bubbleText) {
        const bText =
          runtimeState.bubbleText.length > 22
            ? `${runtimeState.bubbleText.slice(0, 22)}…`
            : runtimeState.bubbleText;
        const bubble = this.add
          .text(ax, ay - 62, bText, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#0f172a',
            backgroundColor: '#ffffff',
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5, 0.5);
        const border = this.add
          .rectangle(ax, ay - 62, bubble.width + 4, bubble.height + 4)
          .setStrokeStyle(2, 0x0f172a);
        this.roomLayer!.add([border, bubble]);
      }
    });
  }
}
