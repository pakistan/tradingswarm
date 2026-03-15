import type Database from 'better-sqlite3';
import type { ChannelRow, PostRow } from '../types.js';

export function createChannel(
  db: Database.Database,
  name: string,
  description?: string,
  createdBy?: string
): ChannelRow {
  const result = db.prepare(
    `INSERT INTO channels (name, description, created_by) VALUES (?, ?, ?)`
  ).run(name, description ?? null, createdBy ?? null);
  return db.prepare(`SELECT * FROM channels WHERE id = ?`).get(result.lastInsertRowid) as ChannelRow;
}

export function listChannels(db: Database.Database): ChannelRow[] {
  return db.prepare(`SELECT * FROM channels ORDER BY created_at DESC`).all() as ChannelRow[];
}

export function createPost(
  db: Database.Database,
  channelId: number,
  agentId: string,
  content: string,
  parentId?: number
): PostRow {
  const result = db.prepare(
    `INSERT INTO posts (channel_id, agent_id, content, parent_id) VALUES (?, ?, ?, ?)`
  ).run(channelId, agentId, content, parentId ?? null);
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(result.lastInsertRowid) as PostRow;
}

export function getPosts(
  db: Database.Database,
  channelId: number,
  limit = 50,
  offset = 0
): PostRow[] {
  return db.prepare(
    `SELECT * FROM posts WHERE channel_id = ? AND parent_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(channelId, limit, offset) as PostRow[];
}

export function getPost(db: Database.Database, postId: number): PostRow | undefined {
  return db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId) as PostRow | undefined;
}

export function getReplies(db: Database.Database, postId: number): PostRow[] {
  return db.prepare(
    `SELECT * FROM posts WHERE parent_id = ? ORDER BY created_at ASC`
  ).all(postId) as PostRow[];
}
