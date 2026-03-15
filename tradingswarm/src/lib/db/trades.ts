import type Database from 'better-sqlite3';
import type { MarketRow, OutcomeRow, OrderRow, PositionRow, TradeHistoryRow, ResolutionRow } from '../types.js';

// ---- Markets ----

export function upsertMarket(db: Database.Database, market: Omit<MarketRow, 'last_synced'>): void {
  db.prepare(`
    INSERT INTO markets (market_id, platform, question, category, description, resolution_source, volume, end_date, active, raw_json, last_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(market_id) DO UPDATE SET
      platform = excluded.platform,
      question = excluded.question,
      category = excluded.category,
      description = excluded.description,
      resolution_source = excluded.resolution_source,
      volume = excluded.volume,
      end_date = excluded.end_date,
      active = excluded.active,
      raw_json = excluded.raw_json,
      last_synced = datetime('now')
  `).run(
    market.market_id,
    market.platform,
    market.question,
    market.category ?? null,
    market.description ?? null,
    market.resolution_source ?? null,
    market.volume ?? null,
    market.end_date ?? null,
    market.active ?? 1,
    market.raw_json ?? null
  );
}

export function upsertOutcome(db: Database.Database, outcome: Omit<OutcomeRow, 'last_synced'>): void {
  db.prepare(`
    INSERT INTO outcomes (outcome_id, market_id, name, current_price, last_synced)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(outcome_id) DO UPDATE SET
      current_price = excluded.current_price,
      last_synced = datetime('now')
  `).run(outcome.outcome_id, outcome.market_id, outcome.name, outcome.current_price ?? null);
}

export function getMarket(db: Database.Database, marketId: string): MarketRow | undefined {
  return db.prepare(`SELECT * FROM markets WHERE market_id = ?`).get(marketId) as MarketRow | undefined;
}

export function getOutcomeById(db: Database.Database, outcomeId: string): OutcomeRow | undefined {
  return db.prepare(`SELECT * FROM outcomes WHERE outcome_id = ?`).get(outcomeId) as OutcomeRow | undefined;
}

export function getMarketByOutcomeId(db: Database.Database, outcomeId: string): MarketRow | undefined {
  return db.prepare(`
    SELECT m.* FROM markets m
    JOIN outcomes o ON o.market_id = m.market_id
    WHERE o.outcome_id = ?
  `).get(outcomeId) as MarketRow | undefined;
}

// ---- Orders ----

export function insertOrder(
  db: Database.Database,
  order: {
    agent_id: string;
    outcome_id: string;
    side: 'buy' | 'sell';
    order_type: 'market' | 'limit';
    requested_amount?: number;
    requested_shares?: number;
    limit_price?: number;
    filled_amount?: number;
    filled_shares?: number;
    avg_fill_price?: number;
    slippage?: number;
    escrowed_entry_price?: number;
    snapshot_id?: number;
    status: 'filled' | 'partial' | 'pending' | 'cancelled';
  }
): number {
  const result = db.prepare(`
    INSERT INTO orders (agent_id, outcome_id, side, order_type, requested_amount, requested_shares,
      limit_price, filled_amount, filled_shares, avg_fill_price, slippage, escrowed_entry_price,
      snapshot_id, status, filled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      CASE WHEN ? = 'filled' THEN datetime('now') ELSE NULL END)
  `).run(
    order.agent_id,
    order.outcome_id,
    order.side,
    order.order_type,
    order.requested_amount ?? null,
    order.requested_shares ?? null,
    order.limit_price ?? null,
    order.filled_amount ?? 0,
    order.filled_shares ?? 0,
    order.avg_fill_price ?? null,
    order.slippage ?? null,
    order.escrowed_entry_price ?? null,
    order.snapshot_id ?? null,
    order.status,
    order.status
  );
  return Number(result.lastInsertRowid);
}

export function getPendingOrders(
  db: Database.Database,
  agentId?: string,
  outcomeId?: string
): OrderRow[] {
  let sql = `SELECT * FROM orders WHERE status IN ('pending', 'partial')`;
  const params: unknown[] = [];
  if (agentId) { sql += ` AND agent_id = ?`; params.push(agentId); }
  if (outcomeId) { sql += ` AND outcome_id = ?`; params.push(outcomeId); }
  return db.prepare(sql).all(...params) as OrderRow[];
}

export function updateOrderFill(
  db: Database.Database,
  orderId: number,
  filledAmount: number,
  filledShares: number,
  avgPrice: number,
  slippage: number,
  status: 'filled' | 'partial'
): void {
  db.prepare(`
    UPDATE orders SET
      filled_amount = ?,
      filled_shares = ?,
      avg_fill_price = ?,
      slippage = ?,
      status = ?,
      filled_at = CASE WHEN ? = 'filled' THEN datetime('now') ELSE filled_at END
    WHERE order_id = ?
  `).run(filledAmount, filledShares, avgPrice, slippage, status, status, orderId);
}

export function cancelOrder(
  db: Database.Database,
  orderId: number,
  agentId: string
): OrderRow | undefined {
  const order = db.prepare(
    `SELECT * FROM orders WHERE order_id = ? AND agent_id = ? AND status IN ('pending', 'partial')`
  ).get(orderId, agentId) as OrderRow | undefined;
  if (!order) return undefined;
  db.prepare(`UPDATE orders SET status = 'cancelled' WHERE order_id = ?`).run(orderId);
  return order;
}

export function cancelAllOrders(
  db: Database.Database,
  agentId: string,
  outcomeId?: string
): number {
  let sql = `UPDATE orders SET status = 'cancelled' WHERE agent_id = ? AND status IN ('pending', 'partial')`;
  const params: unknown[] = [agentId];
  if (outcomeId) { sql += ` AND outcome_id = ?`; params.push(outcomeId); }
  return db.prepare(sql).run(...params).changes;
}

// ---- Positions ----

export function upsertPosition(
  db: Database.Database,
  agentId: string,
  outcomeId: string,
  shares: number,
  avgEntryPrice: number
): void {
  if (shares <= 0) {
    db.prepare(`DELETE FROM positions WHERE agent_id = ? AND outcome_id = ?`).run(agentId, outcomeId);
    return;
  }
  db.prepare(`
    INSERT INTO positions (agent_id, outcome_id, shares, avg_entry_price, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(agent_id, outcome_id) DO UPDATE SET
      shares = excluded.shares,
      avg_entry_price = excluded.avg_entry_price,
      updated_at = datetime('now')
  `).run(agentId, outcomeId, shares, avgEntryPrice);
}

export function getPosition(
  db: Database.Database,
  agentId: string,
  outcomeId: string
): PositionRow | undefined {
  return db.prepare(
    `SELECT * FROM positions WHERE agent_id = ? AND outcome_id = ?`
  ).get(agentId, outcomeId) as PositionRow | undefined;
}

export function getPositions(db: Database.Database, agentId: string): PositionRow[] {
  return db.prepare(
    `SELECT * FROM positions WHERE agent_id = ?`
  ).all(agentId) as PositionRow[];
}

export function getPositionsForOutcome(db: Database.Database, outcomeId: string): PositionRow[] {
  return db.prepare(
    `SELECT * FROM positions WHERE outcome_id = ?`
  ).all(outcomeId) as PositionRow[];
}

export function getAllPositionedOutcomes(db: Database.Database): string[] {
  return (db.prepare(
    `SELECT DISTINCT outcome_id FROM positions`
  ).all() as { outcome_id: string }[]).map(r => r.outcome_id);
}

export function updatePositionPrice(
  db: Database.Database,
  agentId: string,
  outcomeId: string,
  currentPrice: number
): void {
  const pos = getPosition(db, agentId, outcomeId);
  if (!pos) return;
  const unrealizedPnl = (currentPrice - pos.avg_entry_price) * pos.shares;
  db.prepare(`
    UPDATE positions SET current_price = ?, unrealized_pnl = ?, updated_at = datetime('now')
    WHERE agent_id = ? AND outcome_id = ?
  `).run(currentPrice, unrealizedPnl, agentId, outcomeId);
}

// ---- Trade History ----

export function recordTrade(
  db: Database.Database,
  trade: Omit<TradeHistoryRow, 'id' | 'closed_at'>
): void {
  db.prepare(`
    INSERT INTO trade_history
      (agent_id, outcome_id, market_question, outcome_name, entry_price, exit_price,
       shares, realized_pnl, reason, snapshot_id, opened_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trade.agent_id,
    trade.outcome_id,
    trade.market_question,
    trade.outcome_name,
    trade.entry_price,
    trade.exit_price,
    trade.shares,
    trade.realized_pnl,
    trade.reason,
    trade.snapshot_id ?? null,
    trade.opened_at
  );
}

export function getTradeHistory(
  db: Database.Database,
  agentId: string,
  limit = 50
): TradeHistoryRow[] {
  return db.prepare(
    `SELECT * FROM trade_history WHERE agent_id = ? ORDER BY closed_at DESC LIMIT ?`
  ).all(agentId, limit) as TradeHistoryRow[];
}

export function getTotalRealizedPnl(db: Database.Database, agentId: string): number {
  const row = db.prepare(
    `SELECT COALESCE(SUM(realized_pnl), 0) AS total FROM trade_history WHERE agent_id = ?`
  ).get(agentId) as { total: number };
  return row.total;
}

export function getTradeCount(db: Database.Database, agentId: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count FROM trade_history WHERE agent_id = ?`
  ).get(agentId) as { count: number };
  return row.count;
}

// ---- Resolutions ----

export function insertResolution(
  db: Database.Database,
  outcomeId: string,
  resolvedValue: number
): void {
  db.prepare(
    `INSERT OR IGNORE INTO resolutions (outcome_id, resolved_value) VALUES (?, ?)`
  ).run(outcomeId, resolvedValue);
}

export function getResolution(db: Database.Database, outcomeId: string): ResolutionRow | undefined {
  return db.prepare(
    `SELECT * FROM resolutions WHERE outcome_id = ?`
  ).get(outcomeId) as ResolutionRow | undefined;
}

// ---- Leaderboard ----

export interface LeaderboardRow {
  agent_id: string;
  current_cash: number;
  initial_balance: number;
  realized_pnl: number;
  unrealized_pnl: number;
  num_trades: number;
  wins: number;
}

export function getLeaderboard(db: Database.Database): LeaderboardRow[] {
  return db.prepare(`
    SELECT
      a.agent_id,
      a.current_cash,
      a.initial_balance,
      COALESCE(th.realized_pnl, 0) AS realized_pnl,
      COALESCE(p.unrealized_pnl, 0) AS unrealized_pnl,
      COALESCE(th.num_trades, 0) AS num_trades,
      COALESCE(th.wins, 0) AS wins
    FROM agents a
    LEFT JOIN (
      SELECT agent_id,
        SUM(realized_pnl) AS realized_pnl,
        COUNT(*) AS num_trades,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) AS wins
      FROM trade_history GROUP BY agent_id
    ) th ON a.agent_id = th.agent_id
    LEFT JOIN (
      SELECT agent_id, SUM(unrealized_pnl) AS unrealized_pnl
      FROM positions GROUP BY agent_id
    ) p ON a.agent_id = p.agent_id
    ORDER BY (a.current_cash + COALESCE(p.unrealized_pnl, 0)) DESC
  `).all() as LeaderboardRow[];
}
