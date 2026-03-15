import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  insertToolLog, getToolLog,
  upsertMemory, getMemory, deleteMemory,
  insertEvent, getEvents,
  insertDailySnapshot, getDailySnapshots,
} from './observability';
import { createAgent } from './agents';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  createAgent(db, 'obs-agent-1');
  createAgent(db, 'obs-agent-2');
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('tool log', () => {
  it('inserts and retrieves tool log entries', () => {
    const id = insertToolLog(db, {
      agent_id: 'obs-agent-1',
      tool_name: 'pm_buy',
      platform: 'polymarket',
      cycle_id: 'cycle-001',
      input_json: '{"amount": 100}',
      output_json: '{"filled": true}',
      duration_ms: 342,
    });
    expect(id).toBeGreaterThan(0);

    const logs = getToolLog(db, { agent_id: 'obs-agent-1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].tool_name).toBe('pm_buy');
    expect(logs[0].cycle_id).toBe('cycle-001');
    expect(logs[0].duration_ms).toBe(342);
  });

  it('inserts tool log with error field', () => {
    insertToolLog(db, {
      agent_id: 'obs-agent-1',
      tool_name: 'pm_sell',
      platform: 'polymarket',
      error: 'Insufficient shares',
    });
    const logs = getToolLog(db, { agent_id: 'obs-agent-1' });
    expect(logs[0].error).toBe('Insufficient shares');
  });

  it('filters by tool_name', () => {
    insertToolLog(db, { agent_id: 'obs-agent-1', tool_name: 'pm_buy', platform: 'polymarket' });
    insertToolLog(db, { agent_id: 'obs-agent-1', tool_name: 'pm_sell', platform: 'polymarket' });
    const buys = getToolLog(db, { agent_id: 'obs-agent-1', tool_name: 'pm_buy' });
    expect(buys).toHaveLength(1);
    expect(buys[0].tool_name).toBe('pm_buy');
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      insertToolLog(db, { agent_id: 'obs-agent-1', tool_name: 'pm_markets', platform: 'polymarket' });
    }
    const limited = getToolLog(db, { agent_id: 'obs-agent-1', limit: 3 });
    expect(limited).toHaveLength(3);
  });
});

describe('agent memory', () => {
  it('upserts and retrieves memory', () => {
    upsertMemory(db, 'obs-agent-1', 'strategy', 'Buy low sell high');
    const mem = getMemory(db, 'obs-agent-1');
    expect(mem).toHaveLength(1);
    expect(mem[0].topic).toBe('strategy');
    expect(mem[0].content).toBe('Buy low sell high');
  });

  it('upsert updates existing memory by topic', () => {
    upsertMemory(db, 'obs-agent-1', 'strategy', 'Old strategy');
    upsertMemory(db, 'obs-agent-1', 'strategy', 'New strategy');
    const mem = getMemory(db, 'obs-agent-1');
    expect(mem).toHaveLength(1);
    expect(mem[0].content).toBe('New strategy');
  });

  it('getMemory isolates by agent', () => {
    upsertMemory(db, 'obs-agent-1', 'topic-a', 'content a');
    upsertMemory(db, 'obs-agent-2', 'topic-b', 'content b');
    expect(getMemory(db, 'obs-agent-1')).toHaveLength(1);
    expect(getMemory(db, 'obs-agent-2')).toHaveLength(1);
  });

  it('deleteMemory by topic removes only that topic', () => {
    upsertMemory(db, 'obs-agent-1', 'topic-1', 'c1');
    upsertMemory(db, 'obs-agent-1', 'topic-2', 'c2');
    deleteMemory(db, 'obs-agent-1', 'topic-1');
    const mem = getMemory(db, 'obs-agent-1');
    expect(mem).toHaveLength(1);
    expect(mem[0].topic).toBe('topic-2');
  });

  it('deleteMemory without topic removes all for agent', () => {
    upsertMemory(db, 'obs-agent-1', 'topic-1', 'c1');
    upsertMemory(db, 'obs-agent-1', 'topic-2', 'c2');
    upsertMemory(db, 'obs-agent-2', 'topic-1', 'c3');
    deleteMemory(db, 'obs-agent-1');
    expect(getMemory(db, 'obs-agent-1')).toHaveLength(0);
    expect(getMemory(db, 'obs-agent-2')).toHaveLength(1);
  });
});

describe('agent events', () => {
  it('inserts and retrieves events', () => {
    const id = insertEvent(db, 'obs-agent-1', 'loop_start', 'cycle-001', '{"markets": 5}');
    expect(id).toBeGreaterThan(0);

    const events = getEvents(db, 'obs-agent-1');
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('loop_start');
    expect(events[0].cycle_id).toBe('cycle-001');
    expect(events[0].data_json).toBe('{"markets": 5}');
  });

  it('getEvents with afterId returns only newer events', () => {
    const id1 = insertEvent(db, 'obs-agent-1', 'loop_start');
    insertEvent(db, 'obs-agent-1', 'trade');
    insertEvent(db, 'obs-agent-1', 'loop_end');

    const newer = getEvents(db, 'obs-agent-1', id1);
    expect(newer).toHaveLength(2);
    expect(newer.every(e => e.id > id1)).toBe(true);
  });

  it('getEvents isolates by agent', () => {
    insertEvent(db, 'obs-agent-1', 'loop_start');
    insertEvent(db, 'obs-agent-2', 'loop_start');
    expect(getEvents(db, 'obs-agent-1')).toHaveLength(1);
    expect(getEvents(db, 'obs-agent-2')).toHaveLength(1);
  });

  it('getEvents respects limit', () => {
    for (let i = 0; i < 5; i++) {
      insertEvent(db, 'obs-agent-1', 'thinking');
    }
    const limited = getEvents(db, 'obs-agent-1', undefined, 3);
    expect(limited).toHaveLength(3);
  });
});

describe('daily snapshots', () => {
  const snapshotData = {
    cash: 9000,
    positions_value: 1500,
    realized_pnl_cumulative: 200,
    unrealized_pnl: 300,
    total_portfolio_value: 10500,
  };

  it('inserts and retrieves daily snapshots', () => {
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-15', snapshotData);
    const snaps = getDailySnapshots(db, 'obs-agent-1');
    expect(snaps).toHaveLength(1);
    expect(snaps[0].date).toBe('2024-01-15');
    expect(snaps[0].cash).toBe(9000);
    expect(snaps[0].total_portfolio_value).toBe(10500);
  });

  it('is upsertable (ON CONFLICT DO UPDATE)', () => {
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-15', snapshotData);
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-15', { ...snapshotData, cash: 8000, total_portfolio_value: 9500 });
    const snaps = getDailySnapshots(db, 'obs-agent-1');
    expect(snaps).toHaveLength(1);
    expect(snaps[0].cash).toBe(8000);
  });

  it('getDailySnapshots with days limit', () => {
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-13', snapshotData);
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-14', snapshotData);
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-15', snapshotData);
    const recent = getDailySnapshots(db, 'obs-agent-1', 2);
    expect(recent).toHaveLength(2);
  });

  it('isolates snapshots by agent', () => {
    insertDailySnapshot(db, 'obs-agent-1', '2024-01-15', snapshotData);
    insertDailySnapshot(db, 'obs-agent-2', '2024-01-15', snapshotData);
    expect(getDailySnapshots(db, 'obs-agent-1')).toHaveLength(1);
    expect(getDailySnapshots(db, 'obs-agent-2')).toHaveLength(1);
  });
});
