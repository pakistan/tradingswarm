import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createAgent, getAgent, listAgents, updateAgentStatus, updateAgentCash, getAgentsByConfigVersion } from './agents';
import { createConfig, createVersion } from './configs';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('agents', () => {
  it('creates and retrieves an agent', () => {
    const agent = createAgent(db, 'agent-001', 'Trader Alpha');
    expect(agent.agent_id).toBe('agent-001');
    expect(agent.display_name).toBe('Trader Alpha');
    expect(agent.status).toBe('stopped');
    expect(agent.initial_balance).toBe(10000.0);
    expect(agent.current_cash).toBe(10000.0);
    expect(agent.pid).toBeNull();
    expect(agent.config_version_id).toBeNull();

    const fetched = getAgent(db, 'agent-001');
    expect(fetched).toBeDefined();
    expect(fetched!.agent_id).toBe('agent-001');
  });

  it('creates agent without display name', () => {
    const agent = createAgent(db, 'agent-002');
    expect(agent.display_name).toBeNull();
  });

  it('returns undefined for missing agent', () => {
    expect(getAgent(db, 'nonexistent')).toBeUndefined();
  });

  it('lists all agents', () => {
    createAgent(db, 'a1', 'Agent One');
    createAgent(db, 'a2', 'Agent Two');
    createAgent(db, 'a3');
    const agents = listAgents(db);
    expect(agents).toHaveLength(3);
  });

  it('updates agent status', () => {
    createAgent(db, 'agent-s1');
    updateAgentStatus(db, 'agent-s1', 'running', 12345);
    const agent = getAgent(db, 'agent-s1')!;
    expect(agent.status).toBe('running');
    expect(agent.pid).toBe(12345);
    expect(agent.last_run_at).not.toBeNull();
  });

  it('updates agent status to stopped clears context', () => {
    createAgent(db, 'agent-s2');
    updateAgentStatus(db, 'agent-s2', 'stopped');
    const agent = getAgent(db, 'agent-s2')!;
    expect(agent.status).toBe('stopped');
    expect(agent.pid).toBeNull();
  });

  it('updates agent cash with positive delta', () => {
    createAgent(db, 'agent-cash1');
    updateAgentCash(db, 'agent-cash1', -500);
    const agent = getAgent(db, 'agent-cash1')!;
    expect(agent.current_cash).toBe(9500);
  });

  it('throws on insufficient cash', () => {
    createAgent(db, 'agent-poor');
    expect(() => updateAgentCash(db, 'agent-poor', -20000)).toThrow('Insufficient cash');
  });

  it('allows depositing cash', () => {
    createAgent(db, 'agent-deposit');
    updateAgentCash(db, 'agent-deposit', 5000);
    const agent = getAgent(db, 'agent-deposit')!;
    expect(agent.current_cash).toBe(15000);
  });

  it('creates agent linked to config version', () => {
    const cfg = createConfig(db, 'config-a');
    const v = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    const agent = createAgent(db, 'versioned-agent', 'Agent V', v.version_id);
    expect(agent.config_version_id).toBe(v.version_id);
  });

  it('getAgentsByConfigVersion filters correctly', () => {
    const cfg = createConfig(db, 'config-b');
    const v1 = createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    const v2 = createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'q' });
    createAgent(db, 'av1-1', 'A', v1.version_id);
    createAgent(db, 'av1-2', 'B', v1.version_id);
    createAgent(db, 'av2-1', 'C', v2.version_id);

    const v1agents = getAgentsByConfigVersion(db, v1.version_id);
    expect(v1agents).toHaveLength(2);
    const v2agents = getAgentsByConfigVersion(db, v2.version_id);
    expect(v2agents).toHaveLength(1);
  });
});
