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
