# Agent Office

一个基于 **2D 办公场景** 的多文件夹、多 Agent 协同工作台，原生接入 **Antigravity CLI (`agy`)** 与 **Codex CLI (`codex`)**。

核心隐喻：**1 个本地文件夹 = 1 个独立办公室房间 = 1 层楼**，每个房间拥有 1 名主 Agent（主管）和多名子 Agent（专员），各自可独立配置职责、分配 Skill、接入 MCP，并通过 2D 办公场景实时呈现工作状态。

---

## 核心特性设计

- **多文件夹即多房间（Folder-as-Config）**：每个工作区文件夹下自动维护 `.agent-office/room.json`，配置随目录走、可迁移、可 Git 管理。
- **双 CLI 引擎统一适配**：
  - **Antigravity CLI (`agy`)**：通过 `agy --add-dir <dir> --output-format stream-json -p` 执行并实时消费 NDJSON 事件流，自动同步 `.agents/mcp_config.json`。
  - **Codex CLI (`codex`)**：通过 `codex exec --json`（后续平滑升级至 `codex app-server` JSON-RPC 2.0 持久会话）执行，自动同步 `AGENTS.md` / `.codex/`。
- **跨 CLI 主从协作（Orchestrator MCP）**：内置 `@agent-office/orchestrator-mcp`，暴露 `list_room_agents`、`delegate_task`、`ask_user` 工具，支持主 Agent（如 `agy`）直接派发任务给房间内的子 Agent（如 `codex`）。
- **实时 2D 办公表现层**：后端通过 WebSocket (`/ws/office`) 广播标准化 `OfficeEvent`，前端主界面基于 **React + Zustand + CSS** 渲染纵向办公楼、职业人物与状态气泡；旧 Phaser 场景保留在源码中。

---

## 技术栈

| 层级 | 技术选型 |
| :--- | :--- |
| Monorepo | `pnpm workspace` + TypeScript 5 |
| 共享协议 | `@agent-office/shared`（房间配置、CLI Adapter 接口、2D 事件协议） |
| 编排 MCP | `@agent-office/orchestrator-mcp`（`@modelcontextprotocol/sdk` + `zod`） |
| 后端服务 | `@agent-office/server`（NestJS 11 + `@nestjs/platform-ws` + Node.js 22） |
| 前端 & 2D | `@agent-office/web`（React 19 + Vite 6 + Zustand + Phaser 3） |

---

## 目录结构

```text
agent-office/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── shared/                   # 共享 TypeScript 类型（Workspace / Agent / OfficeEvent）
│   └── orchestrator-mcp/         # 内置 MCP Server（主从 Agent 跨 CLI 调度）
└── apps/
    ├── server/                   # NestJS 后端（房间管理、ConfigSyncer、CLI Adapters、WS 网关）
    │   └── src/
    │       ├── rooms/            # 多文件夹房间与 Agent 管理 API
    │       ├── sync/             # 配置编译器（同步 .agents/ 与 AGENTS.md）
    │       ├── runtime/          # AntigravityAdapter & CodexAdapter
    │       └── gateway/          # WebSocket 实时事件广播
    └── web/                      # React + Phaser 3 2D 办公场景前端
        └── src/
            ├── game/             # Phaser 3 2D 办公室场景（OfficeScene）
            └── store/            # Zustand 状态管理
```

---

## 快速开始

### 1. 环境要求

- Node.js `>= 22`
- pnpm `>= 10`
- 已在本机安装并完成登录认证的 CLI（至少安装其一）：
  - Antigravity CLI：`agy --version`
  - Codex CLI：`codex --version`

### 2. 安装依赖与构建

```bash
pnpm install
pnpm build
```

### 3. 启动开发环境

```bash
# 同时启动后端 (http://127.0.0.1:3001) 与前端 (http://localhost:5173)
pnpm dev
```

打开浏览器访问 `http://localhost:5173`，即可在右侧面板输入本地文件夹路径创建第一个工作区房间，并在左侧 2D 场景中查看房间与 Agent 状态。

### 4. 基础 API 速览

- `GET /api/health` — 检查本机 `agy` / `codex` CLI 可用状态
- `GET /api/rooms` — 获取所有已加载的文件夹房间
- `POST /api/rooms` — 创建/初始化一个文件夹房间
- `POST /api/rooms/:roomId/agents` — 在房间内新增子 Agent（可指定 `antigravity` 或 `codex`）
- `POST /api/rooms/:roomId/agents/:agentId/run` — 触发指定 Agent 执行任务并向 2D 场景推送实时事件
- `WS /ws/office` — 订阅全局 2D 办公室实时事件流

---

## 迭代路线图

- [x] **Phase 0**：Monorepo 工程骨架、共享协议、NestJS + Phaser 3 基础联通
- [ ] **Phase 1**：完善房间持久化注册表（SQLite）、Skill 可视化管理、MCP 表单配置、子 Agent 增删改 UI
- [ ] **Phase 2**：升级 Codex Adapter 至 `codex app-server` JSON-RPC 持久会话 + Antigravity Hooks 人工审批流
- [ ] **Phase 3**：接入 Tiled Tilemap 与像素办公精灵动画（走路寻路、打字、翻书、连线派发任务）
- [ ] **Phase 4**：Electron 桌面端打包（系统托盘、原生目录选择器、桌面审批通知）

## 暖色办公楼界面

点击「新建工作区」输入本地文件夹路径即可增加一层楼，点击楼层或人物打开右侧管理面板。点击「设计预览」查看四层楼与全部 13 位人物，预览不会写入文件或执行任务。

楼层按创建时间排序，修改房间不会改变顺序；移除后连续编号。当前为状态驱动的 CSS 动作，完整行走与寻路尚未接入。CLI 可用仅代表检测到程序，实际任务需要本机认证与配置。

设计与素材说明见 [设计说明](docs/design/README.md)。

验证命令：`pnpm typecheck`、`pnpm build`；Node 22.6+ 运行 `node --experimental-strip-types --test tests/building.test.mjs`。
