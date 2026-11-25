#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SERVER_URL =
  process.env.AGENT_OFFICE_SERVER_URL ?? 'http://127.0.0.1:3001';
const ROOM_ID = process.env.AGENT_OFFICE_ROOM_ID ?? '';
const AGENT_ROLE = process.env.AGENT_OFFICE_ROLE ?? 'lead';
const CURRENT_TASK_ID = process.env.AGENT_OFFICE_TASK_ID ?? undefined;

const server = new McpServer({
  name: 'agent-office-orchestrator',
  version: '0.2.0',
});

server.tool(
  'list_room_agents',
  'List all agents in the current workspace room along with their responsibilities, CLI providers, and active task states.',
  {},
  async () => {
    const [roomRes, tasksRes] = await Promise.all([
      fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}`),
      fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/tasks?limit=15`),
    ]);
    if (!roomRes.ok) {
      return {
        content: [
          { type: 'text', text: `Failed to fetch room agents: ${roomRes.status}` },
        ],
        isError: true,
      };
    }
    const room = (await roomRes.json()) as { agents?: unknown[] };
    const recentTasks = tasksRes.ok ? await tasksRes.json() : [];
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              agents: room.agents ?? [],
              recentTasks,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'delegate_task',
  'Non-blocking Super-Agent task delegation: assign a task with an explicit Mandate to an isolated worker agent (returns taskId immediately by default so multiple workers can run in parallel).',
  {
    agentId: z.string().describe('Target worker agent ID'),
    instruction: z.string().describe('Actionable task instruction for the worker'),
    mandate: z
      .string()
      .optional()
      .describe(
        'Immutable scope boundary & constraints (e.g., allowed files, prohibited operations, acceptance criteria)',
      ),
    wait: z
      .boolean()
      .optional()
      .describe(
        'False (default) dispatches asynchronously and returns taskId immediately; true waits for completion and returns Inline Summary + Spill log handle.',
      ),
    isolateWorktree: z
      .boolean()
      .optional()
      .describe('Allocate an isolated Git worktree for concurrent editing (default: true)'),
    autoWakeLead: z
      .boolean()
      .optional()
      .describe(
        'Automatically wake the Lead Agent with an Inline Summary callback once this background worker completes (default: false)',
      ),
  },
  async ({
    agentId,
    instruction,
    mandate,
    wait = false,
    isolateWorktree = true,
    autoWakeLead = false,
  }) => {
    if (AGENT_ROLE === 'worker') {
      return {
        content: [
          {
            type: 'text',
            text: 'Workers cannot recursively delegate tasks. Complete your Mandate or report back to the Router.',
          },
        ],
        isError: true,
      };
    }

    const res = await fetch(
      `${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/agents/${encodeURIComponent(agentId)}/dispatch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: instruction,
          routeMode: 'delegated',
          parentTaskId: CURRENT_TASK_ID,
          mandate,
          async: !wait,
          isolateWorktree,
          autoWakeLead,
        }),
      },
    );

    const data = (await res.json()) as {
      task?: Record<string, unknown>;
      message?: string;
    };
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        isError: true,
      };
    }

    // Inline & Spill: return structured task metadata + concise Inline summary + Spill log handle
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.task ?? data, null, 2),
        },
      ],
    };
  },
);

server.tool(
  'check_task_status',
  'Check the status and Inline Summary of a specific delegated taskId, or list recent room tasks when taskId is omitted.',
  {
    taskId: z
      .string()
      .optional()
      .describe('Task ID returned by delegate_task (omit to list recent tasks)'),
  },
  async ({ taskId }) => {
    const url = taskId
      ? `${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/tasks/${encodeURIComponent(taskId)}`
      : `${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/tasks?limit=20`;
    const res = await fetch(url);
    const data = await res.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: !res.ok,
    };
  },
);

server.tool(
  'recall_task_log',
  'Chain of Recall: selectively read line slices or grep matches from a worker task spilled log file (.agent-office/runs/<taskId>.log) without flooding context.',
  {
    taskId: z.string().describe('Task ID whose spilled log should be inspected'),
    offsetLines: z.number().int().min(0).optional().describe('0-based starting line offset'),
    limitLines: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe('Max lines to return (default 80)'),
    grep: z
      .string()
      .optional()
      .describe('Optional case-insensitive keyword filter to locate specific errors or outputs'),
  },
  async ({ taskId, offsetLines, limitLines, grep }) => {
    const qs = new URLSearchParams();
    if (offsetLines !== undefined) qs.set('offset', String(offsetLines));
    if (limitLines !== undefined) qs.set('limit', String(limitLines));
    if (grep) qs.set('grep', grep);
    const query = qs.toString();
    const res = await fetch(
      `${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/tasks/${encodeURIComponent(taskId)}/log${query ? `?${query}` : ''}`,
    );
    const data = await res.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: !res.ok,
    };
  },
);

server.tool(
  'ask_user',
  'Raise an interactive human approval / clarification bubble in the 2D Office and wait for the user decision (approved / rejected + comment).',
  {
    question: z
      .string()
      .describe('Question, Mandate boundary check, or high-risk action requiring human approval'),
    agentId: z
      .string()
      .optional()
      .describe('Optional agent ID raising the request (defaults to room lead)'),
    wait: z
      .boolean()
      .optional()
      .describe('Wait for human resolution before returning (default: true)'),
  },
  async ({ question, agentId, wait = true }) => {
    const res = await fetch(
      `${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/approvals`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          taskId: CURRENT_TASK_ID,
          question,
          wait,
        }),
      },
    );
    const data = await res.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      isError: !res.ok,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start orchestrator MCP server:', err);
  process.exit(1);
});
