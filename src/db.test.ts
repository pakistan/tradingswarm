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

  it('indexes a commit with parents', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'second', 'main', null, ['aaa']);
    const commit = db.getCommit('bbb');
    expect(commit!.parents).toEqual(['aaa']);
  });

  it('indexes a merge commit with multiple parents', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'branch-a', null, []);
    db.indexCommit('bbb', 'worker-1', 'second', 'branch-b', null, []);
    db.indexCommit('ccc', 'worker-1', 'merge', 'main', null, ['aaa', 'bbb']);
    const commit = db.getCommit('ccc');
    expect(commit!.parents).toEqual(['aaa', 'bbb']);
  });

  it('is idempotent — duplicate indexCommit is ignored', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    expect(() => db.indexCommit('aaa', 'worker-1', 'first', 'main', null, [])).not.toThrow();
  });

  it('returns undefined for non-existent commit', () => {
    expect(db.getCommit('nonexistent')).toBeUndefined();
  });

  it('getLeaves returns commits with no children', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'worker-1', 'another leaf', 'feat', null, ['aaa']);
    const leaves = db.getLeaves(20);
    const hashes = leaves.map(l => l.hash);
    expect(hashes).toContain('bbb');
    expect(hashes).toContain('ccc');
    expect(hashes).not.toContain('aaa');
  });

  it('getLeaves returns empty array when no commits', () => {
    expect(db.getLeaves(20)).toEqual([]);
  });

  it('getLeaves respects limit', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'one', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'two', 'feat', null, []);
    const leaves = db.getLeaves(1);
    expect(leaves).toHaveLength(1);
  });

  it('getLog returns recent commits', () => {
    db.registerAgent('worker-1');
    db.registerAgent('worker-2');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-2', 'second', 'feat', null, ['aaa']);
    const log = db.getLog(50);
    expect(log).toHaveLength(2);
  });

  it('getLog filters by agent_id', () => {
    db.registerAgent('worker-1');
    db.registerAgent('worker-2');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-2', 'second', 'feat', null, ['aaa']);
    const log = db.getLog(50, 'worker-1');
    expect(log).toHaveLength(1);
    expect(log[0].agent_id).toBe('worker-1');
  });

  it('getLineage walks first-parent chain', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'worker-1', 'grandchild', 'main', null, ['bbb']);
    const lineage = db.getLineage('ccc');
    expect(lineage.map(c => c.hash)).toEqual(['ccc', 'bbb', 'aaa']);
  });

  it('getLineage follows first parent on merge commits', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'main', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'branch', 'feat', null, []);
    db.indexCommit('ccc', 'worker-1', 'merge', 'main', null, ['aaa', 'bbb']);
    const lineage = db.getLineage('ccc');
    expect(lineage.map(c => c.hash)).toEqual(['ccc', 'aaa']);
  });

  it('getLineage respects depth limit', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'worker-1', 'grandchild', 'main', null, ['bbb']);
    const lineage = db.getLineage('ccc', 2);
    expect(lineage.map(c => c.hash)).toEqual(['ccc', 'bbb']);
  });

  it('getLineage returns empty for unknown hash', () => {
    expect(db.getLineage('nonexistent')).toEqual([]);
  });

  it('getAllIndexedHashes returns set of known hashes', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'second', 'main', null, ['aaa']);
    const hashes = db.getAllIndexedHashes();
    expect(hashes).toBeInstanceOf(Set);
    expect(hashes.has('aaa')).toBe(true);
    expect(hashes.has('bbb')).toBe(true);
    expect(hashes.has('ccc')).toBe(false);
  });
});
