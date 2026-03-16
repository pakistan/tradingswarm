import type Database from 'better-sqlite3';

export interface Signal {
  id: number;
  signal_type: string;
  market_a_id: number;
  market_b_id: number;
  spread_points: number;
  data: Record<string, unknown>;
  status: string;
  claimed_by: string | null;
}

export interface SignalDetail extends Signal {
  market_a: string;
  market_b: string;
  platform_a: string;
  platform_b: string;
  price_a: number | null;
  price_b: number | null;
  asset_id_a: string;
  asset_id_b: string;
}

export class SignalQueue {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Indexer: add a signal to the queue
  enqueue(signalType: string, marketAId: number, marketBId: number, spreadPoints: number, data: Record<string, unknown>): number {
    // Don't enqueue duplicates — same pair that's still open or claimed
    const existing = this.db.prepare(
      `SELECT id FROM signal_queue WHERE market_a_id = ? AND market_b_id = ? AND status IN ('open', 'claimed')`
    ).get(marketAId, marketBId);
    if (existing) return (existing as { id: number }).id;

    const result = this.db.prepare(
      `INSERT INTO signal_queue (signal_type, market_a_id, market_b_id, spread_points, data_json, status) VALUES (?, ?, ?, ?, ?, 'open')`
    ).run(signalType, marketAId, marketBId, spreadPoints, JSON.stringify(data));
    return Number(result.lastInsertRowid);
  }

  // Agent: atomically claim the top open signal
  claim(agentId: string): SignalDetail | null {
    // better-sqlite3 is synchronous — this is atomic
    const signal = this.db.prepare(`
      UPDATE signal_queue SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now')
      WHERE id = (
        SELECT sq.id FROM signal_queue sq
        WHERE sq.status = 'open'
        ORDER BY sq.spread_points DESC
        LIMIT 1
      )
      RETURNING *
    `).get(agentId) as { id: number; signal_type: string; market_a_id: number; market_b_id: number; spread_points: number; data_json: string } | undefined;

    if (!signal) return null;

    // Enrich with market details
    const a = this.db.prepare('SELECT platform, asset_id, title, price FROM market_index WHERE id = ?').get(signal.market_a_id) as any;
    const b = this.db.prepare('SELECT platform, asset_id, title, price FROM market_index WHERE id = ?').get(signal.market_b_id) as any;

    return {
      id: signal.id,
      signal_type: signal.signal_type,
      market_a_id: signal.market_a_id,
      market_b_id: signal.market_b_id,
      spread_points: signal.spread_points,
      data: JSON.parse(signal.data_json || '{}'),
      status: 'claimed',
      claimed_by: agentId,
      market_a: a?.title ?? 'Unknown',
      market_b: b?.title ?? 'Unknown',
      platform_a: a?.platform ?? 'unknown',
      platform_b: b?.platform ?? 'unknown',
      price_a: a?.price ?? null,
      price_b: b?.price ?? null,
      asset_id_a: a?.asset_id ?? '',
      asset_id_b: b?.asset_id ?? '',
    };
  }

  // Agent: complete a claimed signal with result
  complete(signalId: number, result: Record<string, unknown>): void {
    this.db.prepare(
      `UPDATE signal_queue SET status = 'completed', completed_at = datetime('now'), result_json = ? WHERE id = ?`
    ).run(JSON.stringify(result), signalId);
  }

  // Agent: release a claim (pass on this signal)
  release(signalId: number, reason: string): void {
    this.db.prepare(
      `UPDATE signal_queue SET status = 'completed', completed_at = datetime('now'), result_json = ? WHERE id = ?`
    ).run(JSON.stringify({ passed: true, reason }), signalId);
  }

  // Indexer: expire stale claims (agents that crashed)
  expireStale(minutes = 30): number {
    return this.db.prepare(
      `UPDATE signal_queue SET status = 'open', claimed_by = NULL, claimed_at = NULL WHERE status = 'claimed' AND claimed_at < datetime('now', '-' || ? || ' minutes')`
    ).run(minutes).changes;
  }

  // Stats
  stats(): { open: number; claimed: number; completed: number } {
    const rows = this.db.prepare(
      `SELECT status, COUNT(*) as c FROM signal_queue GROUP BY status`
    ).all() as Array<{ status: string; c: number }>;
    const map: Record<string, number> = {};
    for (const r of rows) map[r.status] = r.c;
    return { open: map.open ?? 0, claimed: map.claimed ?? 0, completed: map.completed ?? 0 };
  }
}
