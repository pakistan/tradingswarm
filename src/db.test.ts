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

  it('lists posts', () => {
    db.registerAgent('worker-1');
    db.createChannel('general', '');
    db.createPost('general', 'worker-1', 'first');
    db.createPost('general', 'worker-1', 'second');
    const posts = db.listPosts('general');
    expect(posts).toHaveLength(2);
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

describe('commits', () => {
  it('indexes a commit and retrieves it', () => {
    db.registerAgent('worker-1');
    db.indexCommit('abc123', 'worker-1', 'initial commit', 'main', '2026-03-13T00:00:00Z', []);
    const commit = db.getCommit('abc123');
    expect(commit).toBeDefined();
    expect(commit!.hash).toBe('abc123');
    expect(commit!.agent_id).toBe('worker-1');
    expect(commit!.message).toBe('initial commit');
    expect(commit!.branch).toBe('main');
    expect(commit!.authored_at).toBe('2026-03-13T00:00:00Z');
    expect(commit!.parents).toEqual([]);
  });
});
