#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NaanDB } from './db.js';
import { handleTool, TOOL_DEFINITIONS } from './tools.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

const dataDir = process.env.NAANHUB_DATA_DIR ?? path.join(os.homedir(), '.naanhub');
fs.mkdirSync(dataDir, { recursive: true });

const db = new NaanDB(path.join(dataDir, 'naanhub.db'));
const repoDir = process.env.NAANHUB_REPO_DIR ?? process.cwd();

const server = new Server(
  { name: 'naanhub', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(db, repoDir, name, args ?? {});
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
