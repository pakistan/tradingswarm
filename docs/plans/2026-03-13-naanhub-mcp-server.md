# naanhub MCP Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that gives Claude Code the ability to coordinate a swarm of WorkerAgent subprocesses via a shared message board, agent registry, and goal — following the AgentHub collaboration model.

**Architecture:** TypeScript MCP server using `@modelcontextprotocol/sdk` with SQLite (via `better-sqlite3`) for persistence. No HTTP server, no git repo management — GitHub operations are handled by workers via the existing `gh` MCP server. Claude Code acts as supervisor: sets a goal, spawns N workers via the Agent tool, and respawns them when they return.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `better-sqlite3`, Node.js

---

## Chunk 1: Project Setup & Database

### Task 1: Initialize TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "naanhub",
  "version": "0.1.0",
  "description": "MCP server for coordinating a swarm of Claude Code WorkerAgents",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "naanhub": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
*.db
data/
```

- [ ] **Step 4: Install dependencies**

Run: `cd /Users/adnanzaib/brainstorm/naanhub && npm install`

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: initialize naanhub project"
```

---

### Task 2: Database layer

**Files:**
- Create: `src/db.ts`
- Create: `src/db.test.ts`

- [ ] **Step 1: Write failing tests for database operations**

```typescript
// src/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NaanDB } from './db.js';
import fs from 'fs';

let db: NaanDB;
const TEST_DB = '/tmp/naanhub-test.db';

beforeEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  db = new NaanDB(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('goal', () => {
  it('returns null when no goal set', () => {
    expect(db.getGoal()).toBeNull();
  });

  it('sets and gets a goal', () => {
    db.setGoal('research quantum computing');
    expect(db.getGoal()).toBe('research quantum computing');
  });

  it('overwrites previous goal', () => {
    db.setGoal('goal 1');
    db.setGoal('goal 2');
    expect(db.getGoal()).toBe('goal 2');
  });
});

describe('agents', () => {
  it('registers an agent', () => {
    db.registerAgent('worker-1');
    const agents = db.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('worker-1');
    expect(agents[0].status).toBe('idle');
  });

  it('updates agent status', () => {
    db.registerAgent('worker-1');
    db.updateAgentStatus('worker-1', 'active');
    const agents = db.listAgents();
    expect(agents[0].status).toBe('active');
  });

  it('prevents duplicate registration', () => {
    db.registerAgent('worker-1');
    expect(() => db.registerAgent('worker-1')).not.toThrow();
    expect(db.listAgents()).toHaveLength(1);
  });

  it('throws on invalid status', () => {
    db.registerAgent('worker-1');
    expect(() => db.updateAgentStatus('worker-1', 'bogus')).toThrow('invalid status');
  });

  it('throws when updating non-existent agent', () => {
    expect(() => db.updateAgentStatus('ghost', 'active')).toThrow('not found');
  });
});

describe('channels', () => {
  it('creates and lists channels', () => {
    db.createChannel('general', 'main discussion');
    const channels = db.listChannels();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe('general');
  });

  it('prevents duplicate channel names', () => {
    db.createChannel('general', '');
    expect(() => db.createChannel('general', '')).toThrow();
  });

  it('rejects invalid channel names', () => {
    expect(() => db.createChannel('Hello World', '')).toThrow();
    expect(() => db.createChannel('', '')).toThrow();
    expect(() => db.createChannel('-bad', '')).toThrow();
  });
});

describe('posts', () => {
  it('creates a post in a channel', () => {
    db.registerAgent('worker-1');
    db.createChannel('general', '');
    const post = db.createPost('general', 'worker-1', 'hello world');
    expect(post.content).toBe('hello world');
    expect(post.agent_id).toBe('worker-1');
  });

  it('lists posts in chronological order', () => {
    db.registerAgent('worker-1');
    db.createChannel('general', '');
    db.createPost('general', 'worker-1', 'first');
    db.createPost('general', 'worker-1', 'second');
    const posts = db.listPosts('general');
    expect(posts).toHaveLength(2);
    expect(posts[0].content).toBe('first');
    expect(posts[1].content).toBe('second');
  });

  it('supports threaded replies', () => {
    db.registerAgent('worker-1');
    db.createChannel('general', '');
    const parent = db.createPost('general', 'worker-1', 'parent');
    db.createPost('general', 'worker-1', 'reply', parent.id);
    const replies = db.getReplies(parent.id);
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toBe('reply');
  });

  it('throws when channel does not exist', () => {
    db.registerAgent('worker-1');
    expect(() => db.createPost('nope', 'worker-1', 'hi')).toThrow();
  });

  it('gets a single post by id', () => {
    db.registerAgent('worker-1');
    db.createChannel('general', '');
    const post = db.createPost('general', 'worker-1', 'find me');
    const found = db.getPost(post.id);
    expect(found?.content).toBe('find me');
  });

  it('returns undefined for non-existent post', () => {
    expect(db.getPost(999)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/adnanzaib/brainstorm/naanhub && npx vitest run`
Expected: FAIL — `./db.js` does not exist

- [ ] **Step 3: Implement database layer**

```typescript
// src/db.ts
import Database from 'better-sqlite3';

export interface Agent {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Post {
  id: number;
  channel_id: number;
  channel_name: string;
  agent_id: string;
  parent_id: number | null;
  content: string;
  created_at: string;
}

export class NaanDB {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goal (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL REFERENCES channels(id),
        agent_id TEXT NOT NULL REFERENCES agents(id),
        parent_id INTEGER REFERENCES posts(id),
        content TEXT NOT NULL CHECK(length(content) <= 32768),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel_id);
      CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  // --- Goal ---

  setGoal(content: string): void {
    this.db.prepare(
      `INSERT INTO goal (id, content, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`
    ).run(content);
  }

  getGoal(): string | null {
    const row = this.db.prepare('SELECT content FROM goal WHERE id = 1').get() as { content: string } | undefined;
    return row?.content ?? null;
  }

  // --- Agents ---

  registerAgent(id: string): void {
    this.db.prepare(
      `INSERT INTO agents (id) VALUES (?) ON CONFLICT(id) DO NOTHING`
    ).run(id);
  }

  updateAgentStatus(id: string, status: string): void {
    const validStatuses = ['idle', 'active', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`invalid status "${status}", must be one of: ${validStatuses.join(', ')}`);
    }
    const result = this.db.prepare(
      'UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id);
    if (result.changes === 0) {
      throw new Error(`agent "${id}" not found`);
    }
  }

  listAgents(): Agent[] {
    return this.db.prepare('SELECT id, status, created_at, updated_at FROM agents ORDER BY created_at').all() as Agent[];
  }

  // --- Channels ---

  createChannel(name: string, description: string): Channel {
    if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(name)) {
      throw new Error('channel name must be 1-31 lowercase alphanumeric/dash/underscore chars');
    }
    this.db.prepare('INSERT INTO channels (name, description) VALUES (?, ?)').run(name, description);
    return this.db.prepare('SELECT id, name, description, created_at FROM channels WHERE name = ?').get(name) as Channel;
  }

  listChannels(): Channel[] {
    return this.db.prepare('SELECT id, name, description, created_at FROM channels ORDER BY name').all() as Channel[];
  }

  private getChannelByName(name: string): Channel | undefined {
    return this.db.prepare('SELECT id, name, description, created_at FROM channels WHERE name = ?').get(name) as Channel | undefined;
  }

  // --- Posts ---

  createPost(channelName: string, agentId: string, content: string, parentId?: number): Post {
    const channel = this.getChannelByName(channelName);
    if (!channel) throw new Error(`channel "${channelName}" not found`);

    const result = this.db.prepare(
      'INSERT INTO posts (channel_id, agent_id, parent_id, content) VALUES (?, ?, ?, ?)'
    ).run(channel.id, agentId, parentId ?? null, content);

    return this.db.prepare(
      `SELECT p.id, p.channel_id, c.name as channel_name, p.agent_id, p.parent_id, p.content, p.created_at
       FROM posts p JOIN channels c ON p.channel_id = c.id WHERE p.id = ?`
    ).get(result.lastInsertRowid) as Post;
  }

  listPosts(channelName: string, limit: number = 50, offset: number = 0): Post[] {
    const channel = this.getChannelByName(channelName);
    if (!channel) throw new Error(`channel "${channelName}" not found`);

    return this.db.prepare(
      `SELECT p.id, p.channel_id, c.name as channel_name, p.agent_id, p.parent_id, p.content, p.created_at
       FROM posts p JOIN channels c ON p.channel_id = c.id
       WHERE p.channel_id = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
    ).all(channel.id, limit, offset) as Post[];
  }

  getPost(postId: number): Post | undefined {
    return this.db.prepare(
      `SELECT p.id, p.channel_id, c.name as channel_name, p.agent_id, p.parent_id, p.content, p.created_at
       FROM posts p JOIN channels c ON p.channel_id = c.id WHERE p.id = ?`
    ).get(postId) as Post | undefined;
  }

  getReplies(postId: number): Post[] {
    return this.db.prepare(
      `SELECT p.id, p.channel_id, c.name as channel_name, p.agent_id, p.parent_id, p.content, p.created_at
       FROM posts p JOIN channels c ON p.channel_id = c.id
       WHERE p.parent_id = ? ORDER BY p.created_at ASC`
    ).all(postId) as Post[];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/adnanzaib/brainstorm/naanhub && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add database layer with goal, agents, channels, posts"
```

---

## Chunk 2: MCP Server

### Task 3: MCP server with all tools

**Files:**
- Create: `src/index.ts`
- Create: `src/tools.ts`
- Create: `src/tools.test.ts`

- [ ] **Step 1: Write failing tests for tool handlers**

```typescript
// src/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NaanDB } from './db.js';
import { handleTool } from './tools.js';
import fs from 'fs';

let db: NaanDB;
const TEST_DB = '/tmp/naanhub-tools-test.db';

beforeEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  db = new NaanDB(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('handleTool', () => {
  it('hub_set_goal sets and returns goal', () => {
    const result = handleTool(db, 'hub_set_goal', { goal: 'build a thing' });
    expect(result).toContain('build a thing');
  });

  it('hub_get_goal returns the goal', () => {
    handleTool(db, 'hub_set_goal', { goal: 'build a thing' });
    const result = handleTool(db, 'hub_get_goal', {});
    expect(result).toContain('build a thing');
  });

  it('hub_register_agent registers an agent', () => {
    const result = handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    expect(result).toContain('w-1');
  });

  it('hub_list_agents shows registered agents', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    handleTool(db, 'hub_register_agent', { agent_id: 'w-2' });
    const result = handleTool(db, 'hub_list_agents', {});
    expect(result).toContain('w-1');
    expect(result).toContain('w-2');
  });

  it('hub_post creates a post', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    handleTool(db, 'hub_create_channel', { name: 'general' });
    const result = handleTool(db, 'hub_post', {
      channel: 'general', agent_id: 'w-1', content: 'hello'
    });
    expect(result).toContain('hello');
  });

  it('hub_read returns posts', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    handleTool(db, 'hub_create_channel', { name: 'general' });
    handleTool(db, 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'msg1' });
    const result = handleTool(db, 'hub_read', { channel: 'general' });
    expect(result).toContain('msg1');
  });

  it('hub_update_agent_status updates status', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    const result = handleTool(db, 'hub_update_agent_status', { agent_id: 'w-1', status: 'active' });
    expect(result).toContain('active');
  });

  it('hub_update_agent_status rejects invalid status', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    expect(() => handleTool(db, 'hub_update_agent_status', { agent_id: 'w-1', status: 'bogus' })).toThrow();
  });

  it('hub_list_channels returns channels', () => {
    handleTool(db, 'hub_create_channel', { name: 'general' });
    const result = handleTool(db, 'hub_list_channels', {});
    expect(result).toContain('general');
  });

  it('hub_get_post returns a single post', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    handleTool(db, 'hub_create_channel', { name: 'general' });
    const postResult = handleTool(db, 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'find me' });
    const postId = JSON.parse(postResult).id;
    const result = handleTool(db, 'hub_get_post', { post_id: postId });
    expect(result).toContain('find me');
  });

  it('hub_get_replies returns replies to a post', () => {
    handleTool(db, 'hub_register_agent', { agent_id: 'w-1' });
    handleTool(db, 'hub_create_channel', { name: 'general' });
    const postResult = handleTool(db, 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'parent' });
    const postId = JSON.parse(postResult).id;
    handleTool(db, 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'child', parent_id: postId });
    const result = handleTool(db, 'hub_get_replies', { post_id: postId });
    expect(result).toContain('child');
  });

  it('throws on unknown tool', () => {
    expect(() => handleTool(db, 'unknown_tool', {})).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/adnanzaib/brainstorm/naanhub && npx vitest run`
Expected: FAIL — `./tools.js` does not exist

- [ ] **Step 3: Implement tool handlers**

```typescript
// src/tools.ts
import { NaanDB } from './db.js';

export function handleTool(db: NaanDB, name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'hub_set_goal': {
      const goal = args.goal as string;
      db.setGoal(goal);
      return `Goal set: ${goal}`;
    }
    case 'hub_get_goal': {
      const goal = db.getGoal();
      return goal ? `Current goal: ${goal}` : 'No goal set.';
    }
    case 'hub_register_agent': {
      const id = args.agent_id as string;
      db.registerAgent(id);
      return `Agent "${id}" registered.`;
    }
    case 'hub_update_agent_status': {
      const id = args.agent_id as string;
      const status = args.status as string;
      db.updateAgentStatus(id, status);
      return `Agent "${id}" status updated to "${status}".`;
    }
    case 'hub_list_agents': {
      const agents = db.listAgents();
      if (agents.length === 0) return 'No agents registered.';
      return JSON.stringify(agents, null, 2);
    }
    case 'hub_create_channel': {
      const name = args.name as string;
      const description = (args.description as string) ?? '';
      const channel = db.createChannel(name, description);
      return `Channel "#${channel.name}" created.`;
    }
    case 'hub_list_channels': {
      const channels = db.listChannels();
      if (channels.length === 0) return 'No channels.';
      return JSON.stringify(channels, null, 2);
    }
    case 'hub_post': {
      const channel = args.channel as string;
      const agentId = args.agent_id as string;
      const content = args.content as string;
      const parentId = args.parent_id as number | undefined;
      const post = db.createPost(channel, agentId, content, parentId);
      return JSON.stringify(post, null, 2);
    }
    case 'hub_read': {
      const channel = args.channel as string;
      const limit = (args.limit as number) ?? 50;
      const offset = (args.offset as number) ?? 0;
      const posts = db.listPosts(channel, limit, offset);
      if (posts.length === 0) return `#${channel} is empty.`;
      return posts.map(p => {
        const prefix = p.parent_id ? `  ↳ reply to #${p.parent_id} | ` : '';
        return `[#${p.id}] ${prefix}${p.agent_id}: ${p.content}`;
      }).join('\n');
    }
    case 'hub_get_post': {
      const postId = args.post_id as number;
      const post = db.getPost(postId);
      if (!post) return `Post #${postId} not found.`;
      return JSON.stringify(post, null, 2);
    }
    case 'hub_get_replies': {
      const postId = args.post_id as number;
      const replies = db.getReplies(postId);
      if (replies.length === 0) return 'No replies.';
      return JSON.stringify(replies, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const TOOL_DEFINITIONS = [
  {
    name: 'hub_set_goal',
    description: 'Set the shared goal for all WorkerAgents. All agents work toward this goal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        goal: { type: 'string', description: 'The shared goal/objective' }
      },
      required: ['goal']
    }
  },
  {
    name: 'hub_get_goal',
    description: 'Get the current shared goal.',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'hub_register_agent',
    description: 'Register a WorkerAgent with the hub. Call this when spawning a new agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Unique agent identifier (e.g., "worker-1")' }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'hub_update_agent_status',
    description: 'Update an agent\'s status (idle, active, completed, failed).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Agent identifier' },
        status: { type: 'string', description: 'New status: idle, active, completed, failed' }
      },
      required: ['agent_id', 'status']
    }
  },
  {
    name: 'hub_list_agents',
    description: 'List all registered agents and their current status.',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'hub_create_channel',
    description: 'Create a message board channel for agent coordination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Channel name (lowercase, alphanumeric, dashes, underscores)' },
        description: { type: 'string', description: 'Channel description' }
      },
      required: ['name']
    }
  },
  {
    name: 'hub_list_channels',
    description: 'List all message board channels.',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'hub_post',
    description: 'Post a message to a channel. Agents use this to share findings, coordinate, and discuss.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name' },
        agent_id: { type: 'string', description: 'ID of the posting agent' },
        content: { type: 'string', description: 'Message content' },
        parent_id: { type: 'number', description: 'Optional parent post ID for threaded replies' }
      },
      required: ['channel', 'agent_id', 'content']
    }
  },
  {
    name: 'hub_read',
    description: 'Read messages from a channel. Returns posts in reverse chronological order (newest first).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name' },
        limit: { type: 'number', description: 'Max posts to return (default 50)' },
        offset: { type: 'number', description: 'Number of posts to skip for pagination (default 0)' }
      },
      required: ['channel']
    }
  },
  {
    name: 'hub_get_post',
    description: 'Get a single post by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'Post ID' }
      },
      required: ['post_id']
    }
  },
  {
    name: 'hub_get_replies',
    description: 'Get replies to a specific post.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'Post ID to get replies for' }
      },
      required: ['post_id']
    }
  }
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/adnanzaib/brainstorm/naanhub && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add tool handlers for MCP server"
```

---

### Task 4: MCP server entry point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement MCP server**

```typescript
// src/index.ts
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
    const result = handleTool(db, name, args ?? {});
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and verify it starts**

Run: `cd /Users/adnanzaib/brainstorm/naanhub && npm run build`
Expected: Clean compile, `dist/index.js` created

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point"
```

---

## Chunk 3: Worker Agent Prompt & Integration

### Task 5: Worker agent prompt template

**Files:**
- Create: `src/worker-prompt.ts`

- [ ] **Step 1: Create the worker prompt builder**

This function generates the system prompt that each WorkerAgent receives. It encodes the full lifecycle loop.

```typescript
// src/worker-prompt.ts

export function buildWorkerPrompt(params: {
  agentId: string;
  goal: string;
  repoOwner: string;
  repoName: string;
}): string {
  return `You are ${params.agentId}, a WorkerAgent in a swarm collaborating on a shared goal.

## Your Goal
${params.goal}

## Your Repository
Owner: ${params.repoOwner}
Repo: ${params.repoName}

## Your Lifecycle

Follow these steps in order:

### 1. Register
Call hub_register_agent with your agent_id "${params.agentId}".
Call hub_update_agent_status with status "active".

### 2. Gather Context
- Call hub_read on the "general" channel to see what other agents have posted.
- Use gh to check existing PRs: \`gh pr list --repo ${params.repoOwner}/${params.repoName}\`
- Read any relevant PR descriptions or comments to understand what's been tried.

### 3. Plan Your Approach
Based on the goal and what others have done:
- Identify a specific angle or approach that hasn't been tried yet.
- If another agent's PR looks promising, consider building on it.
- Post your plan to the "general" channel: call hub_post with your intended approach.

### 4. Do the Work
- Create a new branch with a descriptive name.
- Make your changes, focusing on your specific angle.
- Commit your work with clear commit messages.
- Push the branch to the remote.

### 5. Open a PR
- Use gh to create a PR: \`gh pr create --repo ${params.repoOwner}/${params.repoName}\`
- Write a clear title and description explaining your approach and findings.

### 6. Share Findings
- Post your results to the "general" channel via hub_post.
- Include: what you tried, what you found, PR link, and any suggestions for other agents.

### 7. Mark Complete
Call hub_update_agent_status with status "completed".

## Coordination Rules
- Always check the message board before starting work to avoid duplicating effort.
- Post your plan BEFORE doing work so others can see what you're attempting.
- Be specific in your posts — include PR numbers, approach descriptions, results.
- If you see a merged PR, that direction is validated — consider extending it.
- If you see a closed PR, that direction was rejected — try something different.
`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker-prompt.ts
git commit -m "feat: add worker agent prompt template"
```

---

### Task 6: Claude Code MCP configuration

**Files:**
- Docs only — no code to write

- [ ] **Step 1: Document MCP server configuration**

The user adds this to their Claude Code MCP settings (e.g., `~/.claude/claude_desktop_config.json` or project-level `.mcp.json`):

```json
{
  "mcpServers": {
    "naanhub": {
      "command": "node",
      "args": ["/Users/adnanzaib/brainstorm/naanhub/dist/index.js"]
    }
  }
}
```

- [ ] **Step 2: Verify MCP server connects**

Start a new Claude Code session and confirm the naanhub tools appear:
- `hub_set_goal`
- `hub_get_goal`
- `hub_register_agent`
- `hub_update_agent_status`
- `hub_list_agents`
- `hub_create_channel`
- `hub_list_channels`
- `hub_post`
- `hub_read`
- `hub_get_post`
- `hub_get_replies`

- [ ] **Step 3: Commit configuration**

```bash
git add .mcp.json  # if using project-level config
git commit -m "chore: add MCP server configuration"
```

---

### Task 7: End-to-end test — supervisor launches workers

This is a manual integration test. In a Claude Code session with naanhub MCP configured:

- [ ] **Step 1: Set up the hub**

```
Call hub_set_goal with "research and prototype X"
Call hub_create_channel with name "general", description "main coordination channel"
```

- [ ] **Step 2: Launch a single worker (smoke test)**

Use the Agent tool to spawn one worker with the prompt from `buildWorkerPrompt()`. Verify it:
1. Registers itself
2. Reads the message board
3. Checks GitHub PRs
4. Does work
5. Opens a PR
6. Posts findings
7. Returns

- [ ] **Step 3: Launch multiple workers**

Spawn 3 workers in parallel via the Agent tool. Verify they:
1. Coordinate via the message board (no duplicated effort)
2. Each open separate PRs
3. Each post distinct findings

---

## File Structure Summary

```
naanhub/
├── package.json
├── tsconfig.json
├── .gitignore
├── .mcp.json
├── docs/plans/
│   └── 2026-03-13-naanhub-mcp-server.md
└── src/
    ├── index.ts          # MCP server entry point
    ├── db.ts             # SQLite database layer
    ├── db.test.ts         # Database tests
    ├── tools.ts          # Tool handler dispatch
    ├── tools.test.ts      # Tool handler tests
    └── worker-prompt.ts  # Worker agent prompt builder
```
