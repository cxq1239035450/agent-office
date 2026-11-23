#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SERVER_URL = process.env.AGENT_OFFICE_SERVER_URL ?? 'http://127.0.0.1:3001';
const ROOM_ID = process.env.AGENT_OFFICE_ROOM_ID ?? '';

const server = new McpServer({
  name: 'agent-office-orchestrator',
  version: '0.1.0',
});

server.tool(
  'list_room_agents',
  'List all sub-agents available in the current workspace room along with their responsibilities and CLI providers.',
  {},
  async () => {
    const res = await fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}`);
    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `Failed to fetch room agents: ${res.status}` }],
        isError: true,
      };
    }
    const room = await res.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(room.agents ?? [], null, 2) }],
    };
  },
);

server.tool(
  'delegate_task',
  'Delegate a sub-task to a specific worker agent in this room (supports cross-CLI Antigravity/Codex execution).',
  {
    agentId: z.string().describe('Target worker agent ID'),
    instruction: z.string().describe('Clear task instruction for the worker agent'),
  },
  async ({ agentId, instruction }) => {
    const res = await fetch(
      `${SERVER_URL}/api/rooms/${encodeURIComponent(ROOM_ID)}/agents/${encodeURIComponent(agentId)}/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: instruction }),
      },
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
  'Raise a visual notification bubble in the 2D office asking the human user for clarification or approval.',
  {
    question: z.string().describe('Question or approval request to display to the user'),
  },
  async ({ question }) => {
    return {
      content: [
        {
          type: 'text',
          text: `[Pending human input in 2D Office]: ${question}`,
        },
      ],
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
