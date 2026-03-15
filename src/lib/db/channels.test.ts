import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createChannel, listChannels, createPost, getPosts, getPost, getReplies } from './channels';
import { createAgent } from './agents';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  createAgent(db, 'bot-1');
  createAgent(db, 'bot-2');
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('channels', () => {
  it('creates and lists channels', () => {
    const ch = createChannel(db, 'general', 'General discussion', 'bot-1');
    expect(ch.id).toBeGreaterThan(0);
    expect(ch.name).toBe('general');
    expect(ch.description).toBe('General discussion');
    expect(ch.created_by).toBe('bot-1');

    const list = listChannels(db);
    expect(list).toHaveLength(1);
  });

  it('creates channel without optional fields', () => {
    const ch = createChannel(db, 'minimal');
    expect(ch.description).toBeNull();
    expect(ch.created_by).toBeNull();
  });

  it('rejects duplicate channel names', () => {
    createChannel(db, 'unique-channel');
    expect(() => createChannel(db, 'unique-channel')).toThrow();
  });

  it('lists multiple channels', () => {
    createChannel(db, 'alpha');
    createChannel(db, 'beta');
    createChannel(db, 'gamma');
    expect(listChannels(db)).toHaveLength(3);
  });
});

describe('posts', () => {
  let channelId: number;

  beforeEach(() => {
    channelId = createChannel(db, 'trading').id;
  });

  it('creates and retrieves a post', () => {
    const post = createPost(db, channelId, 'bot-1', 'Hello world');
    expect(post.id).toBeGreaterThan(0);
    expect(post.channel_id).toBe(channelId);
    expect(post.agent_id).toBe('bot-1');
    expect(post.content).toBe('Hello world');
    expect(post.parent_id).toBeNull();

    const fetched = getPost(db, post.id);
    expect(fetched).toBeDefined();
    expect(fetched!.content).toBe('Hello world');
  });

  it('getPosts returns top-level posts only', () => {
    const p1 = createPost(db, channelId, 'bot-1', 'Top post 1');
    const p2 = createPost(db, channelId, 'bot-2', 'Top post 2');
    createPost(db, channelId, 'bot-1', 'Reply to p1', p1.id);

    const posts = getPosts(db, channelId);
    expect(posts).toHaveLength(2);
    expect(posts.map(p => p.id)).toContain(p1.id);
    expect(posts.map(p => p.id)).toContain(p2.id);
  });

  it('getPosts respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      createPost(db, channelId, 'bot-1', `Post ${i}`);
    }
    const page1 = getPosts(db, channelId, 2, 0);
    const page2 = getPosts(db, channelId, 2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it('getReplies returns threaded replies', () => {
    const parent = createPost(db, channelId, 'bot-1', 'Parent post');
    const r1 = createPost(db, channelId, 'bot-2', 'Reply 1', parent.id);
    const r2 = createPost(db, channelId, 'bot-1', 'Reply 2', parent.id);

    const replies = getReplies(db, parent.id);
    expect(replies).toHaveLength(2);
    expect(replies.map(r => r.id)).toContain(r1.id);
    expect(replies.map(r => r.id)).toContain(r2.id);
  });

  it('getReplies returns empty for post with no replies', () => {
    const p = createPost(db, channelId, 'bot-1', 'Lonely post');
    expect(getReplies(db, p.id)).toHaveLength(0);
  });

  it('getPost returns undefined for missing post', () => {
    expect(getPost(db, 9999)).toBeUndefined();
  });
});
