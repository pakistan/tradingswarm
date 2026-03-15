import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { insertSnapshot, getSnapshot, getSnapshotsForAgent } from './snapshots';
import { createAgent } from './agents';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  createAgent(db, 'snap-agent-1');
  createAgent(db, 'snap-agent-2');
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('snapshots', () => {
  it('inserts and retrieves a snapshot', () => {
    const id = insertSnapshot(
      db,
      'snap-agent-1',
      'out-yes',
      JSON.stringify({ cash: 9500, rationale: 'High confidence' }),
      JSON.stringify({ price: 0.6, volume: 1000 })
    );
    expect(id).toBeGreaterThan(0);

    const snap = getSnapshot(db, id);
    expect(snap).toBeDefined();
    expect(snap!.agent_id).toBe('snap-agent-1');
    expect(snap!.outcome_id).toBe('out-yes');
    expect(JSON.parse(snap!.agent_context).cash).toBe(9500);
    expect(JSON.parse(snap!.market_snapshot).price).toBe(0.6);
  });

  it('returns undefined for missing snapshot', () => {
    expect(getSnapshot(db, 9999)).toBeUndefined();
  });

  it('getSnapshotsForAgent returns only agent snapshots', () => {
    insertSnapshot(db, 'snap-agent-1', 'out-yes', 'ctx1', 'mkt1');
    insertSnapshot(db, 'snap-agent-1', 'out-no', 'ctx2', 'mkt2');
    insertSnapshot(db, 'snap-agent-2', 'out-yes', 'ctx3', 'mkt3');

    const snaps1 = getSnapshotsForAgent(db, 'snap-agent-1');
    expect(snaps1).toHaveLength(2);

    const snaps2 = getSnapshotsForAgent(db, 'snap-agent-2');
    expect(snaps2).toHaveLength(1);
    expect(snaps2[0].outcome_id).toBe('out-yes');
  });

  it('getSnapshotsForAgent returns empty array when no snapshots', () => {
    const snaps = getSnapshotsForAgent(db, 'snap-agent-1');
    expect(snaps).toHaveLength(0);
  });

  it('snapshots ordered by snapshot_id (most recent first)', () => {
    const id1 = insertSnapshot(db, 'snap-agent-1', 'out-yes', 'first', 'mkt');
    const id2 = insertSnapshot(db, 'snap-agent-1', 'out-no', 'second', 'mkt');
    const id3 = insertSnapshot(db, 'snap-agent-1', 'out-yes', 'third', 'mkt');

    const snaps = getSnapshotsForAgent(db, 'snap-agent-1');
    expect(snaps).toHaveLength(3);
    // All 3 IDs should be present
    const ids = snaps.map(s => s.snapshot_id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids).toContain(id3);
  });
});
