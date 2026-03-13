#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PolymarketDB } from './db.js';
import { PolymarketAPI } from './polymarket-api.js';
import { TOOL_DEFINITIONS, handleTool } from './tools.js';
import { startBackgroundLoops } from './background.js';
import path from 'path';
import os from 'os';

const dataDir = process.env.POLYMARKET_DATA_DIR ?? path.join(os.homedir(), '.polymarket-mcp');
const db = new PolymarketDB(dataDir);
const api = new PolymarketAPI();

const server = new Server(
  { name: 'polymarket-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>, db, api);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const stopBackground = startBackgroundLoops(db, api);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', () => {
  stopBackground();
  db.close();
  process.exit(0);
});
