import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('Super-Agent end-to-end: async dispatch, Git worktrees, Inline/Spill recall, Pass-Through, Approvals, and Watchdog', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'agent-office-sa-'));
  const dataDir = join(tempRoot, 'data');
  const repoDir = join(tempRoot, 'workspace-repo');

  process.env.AGENT_OFFICE_DATA_DIR = dataDir;
  process.env.AGENT_OFFICE_WATCHDOG_TIMEOUT_MS = '5000';

  const { StateStoreService } = require('../apps/server/dist/store/state-store.service.js');
  const { ConfigSyncService } = require('../apps/server/dist/sync/config-sync.service.js');
  const { RoomsService } = require('../apps/server/dist/rooms/rooms.service.js');
  const { WorktreeService } = require('../apps/server/dist/runtime/worktree.service.js');
  const { WatchdogService } = require('../apps/server/dist/runtime/watchdog.service.js');
  const { RuntimeService } = require('../apps/server/dist/runtime/runtime.service.js');

  try {
    // Initialize a real local Git repository with an initial commit so git worktree works
    execFileSync('git', ['init', repoDir], { stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
    writeFileSync(join(repoDir, 'README.md'), '# Demo Workspace\n', 'utf-8');
    execFileSync('git', ['add', 'README.md'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoDir });

    const broadcastedEvents = [];
    const mockGateway = {
      broadcast(ev) {
        broadcastedEvents.push(ev);
      },
    };

    const stateStore = new StateStoreService(dataDir);
    await stateStore.onModuleInit();
    const configSync = new ConfigSyncService();
    const roomsService = new RoomsService(configSync, stateStore);
    await roomsService.onModuleInit();
    const worktreeService = new WorktreeService(configSync);
    const watchdog = new WatchdogService(stateStore, mockGateway);
    const runtime = new RuntimeService(
      mockGateway,
      stateStore,
      worktreeService,
      watchdog,
    );

    // 1. Create Room & verify built-in Orchestrator MCP auto-injection
    const room = await roomsService.createRoom({
      name: '增长研发部',
      folderPath: repoDir,
      leadProvider: 'antigravity',
    });
    const mcpJson = JSON.parse(
      readFileSync(join(repoDir, '.agents', 'mcp_config.json'), 'utf-8'),
    );
    assert.ok(
      mcpJson.mcpServers['agent-office-orchestrator'],
      'Built-in orchestrator MCP should be injected into .agents/mcp_config.json',
    );
    const codexToml = readFileSync(
      join(repoDir, '.codex', 'config.toml'),
      'utf-8',
    );
    assert.match(codexToml, /\[mcp_servers\.agent-office-orchestrator\]/);

    // Add two Codex workers
    const workerA = await roomsService.addAgent(room.id, {
      name: '前端专员A',
      title: 'Frontend Worker',
      provider: 'codex',
      instructions: '负责组件开发',
    });
    const workerB = await roomsService.addAgent(room.id, {
      name: '后端专员B',
      title: 'Backend Worker',
      provider: 'codex',
      instructions: '负责接口开发',
    });

    // Install deterministic mock adapter for codex
    const receivedRequests = [];
    const hungKills = [];
    runtime.setAdapter('codex', {
      provider: 'codex',
      async checkAvailable() {
        return { available: true, version: 'mock-1.0' };
      },
      async runTask(req, onEvent, onOutput) {
        receivedRequests.push(req);
        if (req.prompt.includes('HANG_FOREVER')) {
          return new Promise((resolve) => {
            hungKills.push(() =>
              resolve({ success: false, output: '', error: 'killed' }),
            );
          });
        }

        await new Promise((r) => setTimeout(r, 40));
        // Write an isolated file in the worker's assigned workingDir
        const markerFile = join(req.workingDir, `touch-${req.agent.id}.txt`);
        writeFileSync(markerFile, req.prompt, 'utf-8');

        const ndjson = [
          JSON.stringify({ type: 'thread', thread_id: `sess-${req.agent.id}` }),
          JSON.stringify({
            type: 'message',
            text: `已完成 ${req.agent.name}: ${req.prompt}`,
          }),
          'DETAILED_BUILD_LOG_LINE_42: bundle size 128kb',
        ].join('\n');
        onOutput?.(ndjson + '\n', 'stdout');
        onEvent({
          id: 'ev-1',
          timestamp: new Date().toISOString(),
          roomId: req.room.id,
          agentId: req.agent.id,
          provider: 'codex',
          status: 'idle',
          bubbleText: '任务完成',
        });
        return {
          success: true,
          output: ndjson,
          sessionId: `sess-${req.agent.id}`,
        };
      },
      async stopTask(_roomId, _agentId, _taskId) {
        while (hungKills.length) {
          const fn = hungKills.pop();
          fn?.();
        }
      },
    });

    // 2. Non-Blocking Parallel Delegation + Isolated Git Worktrees
    const [dispatchA, dispatchB] = await Promise.all([
      runtime.dispatchTask(room, workerA, {
        prompt: '实现登录表单',
        routeMode: 'delegated',
        mandate: '仅允许修改登录相关文件',
        async: true,
      }),
      runtime.dispatchTask(room, workerB, {
        prompt: '实现鉴权中间件',
        routeMode: 'delegated',
        async: true,
      }),
    ]);

    assert.equal(dispatchA.task.status, 'running');
    assert.equal(dispatchB.task.status, 'running');
    assert.ok(dispatchA.task.worktreePath, 'Worker A should get an isolated worktree');
    assert.ok(dispatchB.task.worktreePath, 'Worker B should get an isolated worktree');
    assert.notEqual(
      dispatchA.task.worktreePath,
      dispatchB.task.worktreePath,
      'Concurrent workers must have distinct physical Git worktrees',
    );
    assert.ok(
      !existsSync(join(repoDir, `touch-${workerA.id}.txt`)),
      'Root repo folder must remain untouched by isolated worker edits',
    );

    // Wait for background tasks to finish
    await new Promise((r) => setTimeout(r, 150));

    const completedA = runtime.getTaskOrThrow(room.id, dispatchA.task.id);
    const completedB = runtime.getTaskOrThrow(room.id, dispatchB.task.id);
    assert.equal(completedA.status, 'completed');
    assert.equal(completedB.status, 'completed');
    assert.match(completedA.summary ?? '', /已完成 前端专员A/);
    assert.match(completedA.summary ?? '', /变更文件/);

    // 3. Chain of Recall: grep inside spilled log file
    const recall = await runtime.recallTaskLog(room.id, completedA.id, {
      grep: 'bundle size',
    });
    assert.equal(recall.matchedLines, 1);
    assert.match(recall.lines[0], /128kb/);

    // 4. Subscription Pass-Through Fast-Path: reuses Worker A sessionId & worktreePath
    const passThroughRes = await runtime.dispatchTask(room, workerA, {
      prompt: '补充表单校验提示',
      routeMode: 'pass_through',
      async: false,
    });
    assert.equal(passThroughRes.task.status, 'completed');
    const lastReq = receivedRequests.at(-1);
    assert.equal(
      lastReq.sessionId,
      `sess-${workerA.id}`,
      'Pass-Through must automatically attach stored worker sessionId',
    );
    assert.equal(
      lastReq.workingDir,
      completedA.worktreePath,
      'Pass-Through must reuse worker active Git worktree',
    );

    // 5. Human Approval (ask_user / Mandate) pauses Watchdog & resolves on user decision
    const hungDispatch = await runtime.dispatchTask(room, workerB, {
      prompt: 'HANG_FOREVER',
      routeMode: 'delegated',
      async: true,
    });

    const approvalPromise = runtime.requestApproval(room, workerB, {
      question: '是否允许修改生产配置？',
      taskId: hungDispatch.task.id,
      wait: true,
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 30));
    const pendingList = runtime.listRoomApprovals(room.id, true);
    assert.equal(pendingList.length, 1);

    // While paused for approval, Watchdog must NOT mark the task as stalled
    const stalledDuringApproval = await watchdog.scanOnce(Date.now() + 60_000);
    assert.equal(stalledDuringApproval.length, 0);

    runtime.resolveApproval(room, pendingList[0].id, 'approved', '仅限测试环境');
    const resolvedApproval = await approvalPromise;
    assert.equal(resolvedApproval.status, 'approved');
    assert.equal(resolvedApproval.responseText, '仅限测试环境');

    // 6. Watchdog intercepts hung task once no longer paused for approval
    const stalledIds = await watchdog.scanOnce(Date.now() + 60_000);
    assert.deepEqual(stalledIds, [hungDispatch.task.id]);
    const stalledTask = runtime.getTaskOrThrow(room.id, hungDispatch.task.id);
    assert.equal(stalledTask.status, 'stalled');
    assert.ok(
      broadcastedEvents.some((e) => e.bubbleText?.includes('Watchdog')),
      'Watchdog must broadcast alert event to 2D office',
    );

    // Cleanup worktrees before removing temp directory
    await worktreeService.removeWorktree(repoDir, completedA.worktreePath);
    await worktreeService.removeWorktree(repoDir, completedB.worktreePath);
    if (hungDispatch.task.worktreePath) {
      await worktreeService.removeWorktree(repoDir, hungDispatch.task.worktreePath);
    }
    stateStore.onModuleDestroy();
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
