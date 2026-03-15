import type Database from 'better-sqlite3';
import type { TradeSnapshotRow } from '../types.js';

export function insertSnapshot(
  db: Database.Database,
  agentId: string,
  outcomeId: string,
  agentContext: string,
  marketSnapshot: string
): number {
  const result = db.prepare(`
    INSERT INTO trade_snapshots (agent_id, outcome_id, agent_context, market_snapshot)
    VALUES (?, ?, ?, ?)
  `).run(agentId, outcomeId, agentContext, marketSnapshot);
  return Number(result.lastInsertRowid);
}

export function getSnapshot(db: Database.Database, snapshotId: number): TradeSnapshotRow | undefined {
  return db.prepare(
    `SELECT * FROM trade_snapshots WHERE snapshot_id = ?`
  ).get(snapshotId) as TradeSnapshotRow | undefined;
}

export function getSnapshotsForAgent(db: Database.Database, agentId: string): TradeSnapshotRow[] {
  return db.prepare(
    `SELECT * FROM trade_snapshots WHERE agent_id = ? ORDER BY created_at DESC`
  ).all(agentId) as TradeSnapshotRow[];
}
