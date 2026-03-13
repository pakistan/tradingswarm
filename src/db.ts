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
