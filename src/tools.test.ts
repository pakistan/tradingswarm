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
  it('hub_set_goal sets and returns goal', async () => {
    const result = await handleTool(db, '', 'hub_set_goal', { goal: 'build a thing' });
    expect(result).toContain('build a thing');
  });

  it('hub_get_goal returns the goal', async () => {
    await handleTool(db, '', 'hub_set_goal', { goal: 'build a thing' });
    const result = await handleTool(db, '', 'hub_get_goal', {});
    expect(result).toContain('build a thing');
  });

  it('hub_register_agent registers an agent', async () => {
    const result = await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    expect(result).toContain('w-1');
  });

  it('hub_list_agents shows registered agents', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-2' });
    const result = await handleTool(db, '', 'hub_list_agents', {});
    expect(result).toContain('w-1');
    expect(result).toContain('w-2');
  });

  it('hub_post creates a post', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_create_channel', { name: 'general' });
    const result = await handleTool(db, '', 'hub_post', {
      channel: 'general', agent_id: 'w-1', content: 'hello'
    });
    expect(result).toContain('hello');
  });

  it('hub_read returns posts', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_create_channel', { name: 'general' });
    await handleTool(db, '', 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'msg1' });
    const result = await handleTool(db, '', 'hub_read', { channel: 'general' });
    expect(result).toContain('msg1');
  });

  it('hub_update_agent_status updates status', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    const result = await handleTool(db, '', 'hub_update_agent_status', { agent_id: 'w-1', status: 'active' });
    expect(result).toContain('active');
  });

  it('hub_update_agent_status rejects invalid status', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await expect(handleTool(db, '', 'hub_update_agent_status', { agent_id: 'w-1', status: 'bogus' })).rejects.toThrow();
  });

  it('hub_list_channels returns channels', async () => {
    await handleTool(db, '', 'hub_create_channel', { name: 'general' });
    const result = await handleTool(db, '', 'hub_list_channels', {});
    expect(result).toContain('general');
  });

  it('hub_get_post returns a single post', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_create_channel', { name: 'general' });
    const postResult = await handleTool(db, '', 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'find me' });
    const postId = JSON.parse(postResult).id;
    const result = await handleTool(db, '', 'hub_get_post', { post_id: postId });
    expect(result).toContain('find me');
  });

  it('hub_get_replies returns replies to a post', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_create_channel', { name: 'general' });
    const postResult = await handleTool(db, '', 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'parent' });
    const postId = JSON.parse(postResult).id;
    await handleTool(db, '', 'hub_post', { channel: 'general', agent_id: 'w-1', content: 'child', parent_id: postId });
    const result = await handleTool(db, '', 'hub_get_replies', { post_id: postId });
    expect(result).toContain('child');
  });

  it('throws on unknown tool', async () => {
    await expect(handleTool(db, '', 'unknown_tool', {})).rejects.toThrow();
  });

  // hub_leaves tests
  it('hub_leaves returns frontier commits', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('aaa', 'w-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'w-1', 'child', 'feat', null, ['aaa']);
    const result = await handleTool(db, '', 'hub_leaves', {});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].hash).toBe('bbb');
  });

  it('hub_leaves returns empty message when no commits', async () => {
    const result = await handleTool(db, '', 'hub_leaves', {});
    expect(result).toContain('No commits');
  });

  // hub_log tests
  it('hub_log returns recent commits', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('aaa', 'w-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'w-1', 'second', 'feat', null, ['aaa']);
    const result = await handleTool(db, '', 'hub_log', {});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
  });

  it('hub_log filters by agent_id', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-2' });
    db.indexCommit('aaa', 'w-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'w-2', 'second', 'feat', null, []);
    const result = await handleTool(db, '', 'hub_log', { agent_id: 'w-1' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].agent_id).toBe('w-1');
  });

  // hub_lineage tests
  it('hub_lineage returns first-parent chain', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('aaaaaaa', 'w-1', 'root', 'main', null, []);
    db.indexCommit('bbbbbbb', 'w-1', 'child', 'main', null, ['aaaaaaa']);
    db.indexCommit('ccccccc', 'w-1', 'grandchild', 'main', null, ['bbbbbbb']);
    const result = await handleTool(db, '', 'hub_lineage', { hash: 'ccccccc' });
    const parsed = JSON.parse(result);
    expect(parsed.map((c: any) => c.hash)).toEqual(['ccccccc', 'bbbbbbb', 'aaaaaaa']);
  });

  it('hub_lineage rejects invalid hash', async () => {
    const result = await handleTool(db, '', 'hub_lineage', { hash: 'INVALID!' });
    expect(result).toContain('Invalid commit hash');
  });

  // hub_fetch tests
  it('hub_fetch returns commit metadata from index', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('abc1234', 'w-1', 'test commit', 'main', '2026-01-01T00:00:00Z', []);
    const result = await handleTool(db, '/tmp/nonexistent-repo', 'hub_fetch', { hash: 'abc1234' });
    expect(result).toContain('abc1234');
    expect(result).toContain('test commit');
  });

  it('hub_fetch rejects invalid hash', async () => {
    const result = await handleTool(db, '', 'hub_fetch', { hash: 'BAD!' });
    expect(result).toContain('Invalid commit hash');
  });

  it('hub_fetch returns not found for unknown hash', async () => {
    const result = await handleTool(db, '', 'hub_fetch', { hash: 'abc1234' });
    expect(result).toContain('not found');
  });

  // hub_diff tests
  it('hub_diff rejects invalid hashes', async () => {
    const result = await handleTool(db, '', 'hub_diff', { a: 'BAD!', b: 'abc1234' });
    expect(result).toContain('Invalid commit hash');
  });

  it('hub_diff handles missing repo gracefully', async () => {
    const result = await handleTool(db, '/tmp/nonexistent-repo', 'hub_diff', { a: 'abc1234', b: 'def5678' });
    expect(result).toContain('failed');
  });

  // hub_push tests
  it('hub_push rejects invalid branch name', async () => {
    const result = await handleTool(db, '', 'hub_push', { agent_id: 'w-1', branch: 'bad branch!' });
    expect(result).toContain('Invalid branch name');
  });

  it('hub_push handles missing repo gracefully', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    const result = await handleTool(db, '/tmp/nonexistent-repo', 'hub_push', { agent_id: 'w-1', branch: 'main' });
    expect(result).toContain('failed');
  });
});
