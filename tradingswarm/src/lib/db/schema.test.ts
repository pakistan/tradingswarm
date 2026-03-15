import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import fs from 'fs';
import path from 'path';
import os from 'os';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('schema migration', () => {
  it('creates all 22 tables', () => {
    migrate(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('configs');
    expect(tableNames).toContain('config_versions');
    expect(tableNames).toContain('rules');
    expect(tableNames).toContain('config_version_rules');
    expect(tableNames).toContain('tools');
    expect(tableNames).toContain('tool_capabilities');
    expect(tableNames).toContain('config_version_capabilities');
    expect(tableNames).toContain('model_providers');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('markets');
    expect(tableNames).toContain('outcomes');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('positions');
    expect(tableNames).toContain('trade_history');
    expect(tableNames).toContain('resolutions');
    expect(tableNames).toContain('trade_snapshots');
    expect(tableNames).toContain('channels');
    expect(tableNames).toContain('posts');
    expect(tableNames).toContain('tool_log');
    expect(tableNames).toContain('agent_memory');
    expect(tableNames).toContain('agent_events');
    expect(tableNames).toContain('daily_snapshots');
    expect(tableNames).toHaveLength(22);
  });

  it('is idempotent', () => {
    migrate(db);
    migrate(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    expect(tables).toHaveLength(22);
  });

  it('enforces foreign keys', () => {
    migrate(db);
    expect(() => {
      db.prepare("INSERT INTO config_versions (config_id, version_num, model_provider, model_name, prompt_template) VALUES (999, 1, 'test', 'test', 'test')").run();
    }).toThrow();
  });

  it('enforces check constraints on agents', () => {
    migrate(db);
    expect(() => {
      db.prepare("INSERT INTO agents (agent_id, status) VALUES ('test', 'invalid')").run();
    }).toThrow();
  });

  it('has cycle_id columns on tool_log and agent_events', () => {
    migrate(db);
    db.prepare("INSERT INTO agents (agent_id) VALUES ('test-agent')").run();
    db.prepare("INSERT INTO tool_log (agent_id, tool_name, platform, cycle_id) VALUES ('test-agent', 'pm_markets', 'polymarket', 'cycle-123')").run();
    db.prepare("INSERT INTO agent_events (agent_id, event_type, cycle_id) VALUES ('test-agent', 'loop_start', 'cycle-123')").run();
    const log = db.prepare("SELECT cycle_id FROM tool_log WHERE cycle_id = 'cycle-123'").get() as { cycle_id: string };
    expect(log.cycle_id).toBe('cycle-123');
    const event = db.prepare("SELECT cycle_id FROM agent_events WHERE cycle_id = 'cycle-123'").get() as { cycle_id: string };
    expect(event.cycle_id).toBe('cycle-123');
  });
});
