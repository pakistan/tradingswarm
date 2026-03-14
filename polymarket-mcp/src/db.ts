import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { AgentRow, MarketRow, OutcomeRow, OrderRow, PositionRow, TradeHistoryRow, ResolutionRow, TradeSnapshotRow } from './types.js';

export class PolymarketDB {
  private db: Database.Database;

  constructor(dataDir: string) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'polymarket.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS markets (
        market_id   TEXT PRIMARY KEY,
        question    TEXT NOT NULL,
        category    TEXT,
        description TEXT,
        resolution_source TEXT,
        volume      REAL,
        end_date    TEXT,
        active      INTEGER DEFAULT 1,
        raw_json    TEXT,
        last_synced TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outcomes (
        outcome_id  TEXT PRIMARY KEY,
        market_id   TEXT NOT NULL REFERENCES markets(market_id),
        name        TEXT NOT NULL,
        current_price REAL,
        last_synced TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        agent_id      TEXT PRIMARY KEY,
        initial_balance REAL NOT NULL DEFAULT 10000.0,
        current_cash  REAL NOT NULL DEFAULT 10000.0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS orders (
        order_id      INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
        outcome_id    TEXT NOT NULL,
        side          TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        order_type    TEXT NOT NULL CHECK (order_type IN ('market', 'limit')),
        requested_amount REAL,
        requested_shares REAL,
        limit_price   REAL,
        filled_amount REAL DEFAULT 0,
        filled_shares REAL DEFAULT 0,
        avg_fill_price REAL,
        slippage      REAL,
        escrowed_entry_price REAL,
        snapshot_id   INTEGER REFERENCES trade_snapshots(snapshot_id),
        status        TEXT NOT NULL CHECK (status IN ('filled', 'partial', 'pending', 'cancelled')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        filled_at     TEXT
      );

      CREATE TABLE IF NOT EXISTS positions (
        agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
        outcome_id    TEXT NOT NULL,
        shares        REAL NOT NULL DEFAULT 0,
        avg_entry_price REAL NOT NULL,
        current_price REAL,
        unrealized_pnl REAL,
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (agent_id, outcome_id)
      );

      CREATE TABLE IF NOT EXISTS trade_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
        outcome_id    TEXT NOT NULL,
        market_question TEXT NOT NULL,
        outcome_name  TEXT NOT NULL,
        entry_price   REAL NOT NULL,
        exit_price    REAL NOT NULL,
        shares        REAL NOT NULL,
        realized_pnl  REAL NOT NULL,
        reason        TEXT NOT NULL CHECK (reason IN ('sold', 'resolved_win', 'resolved_loss')),
        opened_at     TEXT NOT NULL,
        closed_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS resolutions (
        outcome_id    TEXT PRIMARY KEY,
        resolved_value REAL NOT NULL,
        resolved_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS trade_snapshots (
        snapshot_id   INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
        outcome_id    TEXT NOT NULL,
        agent_context TEXT NOT NULL,
        market_snapshot TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(agent_id);
      CREATE INDEX IF NOT EXISTS idx_orders_outcome ON orders(outcome_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_positions_agent ON positions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_trade_history_agent ON trade_history(agent_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_market ON outcomes(market_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  // ---- Agents ----

  getOrCreateAgent(agentId: string): AgentRow {
    this.db.prepare(
      `INSERT OR IGNORE INTO agents (agent_id) VALUES (?)`
    ).run(agentId);
    return this.db.prepare(
      `SELECT * FROM agents WHERE agent_id = ?`
    ).get(agentId) as AgentRow;
  }

  updateCash(agentId: string, delta: number): void {
    const result = this.db.prepare(
      `UPDATE agents SET current_cash = current_cash + ? WHERE agent_id = ? AND current_cash + ? >= 0`
    ).run(delta, agentId, delta);
    if (result.changes === 0) {
      throw new Error(`Insufficient cash for agent ${agentId}`);
    }
  }

  // ---- Market Cache ----

  upsertMarket(market: Omit<MarketRow, 'last_synced'>): void {
    this.db.prepare(`
      INSERT INTO markets (market_id, question, category, description, resolution_source, volume, end_date, active, raw_json, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(market_id) DO UPDATE SET
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
      market.market_id, market.question, market.category,
      market.description, market.resolution_source, market.volume,
      market.end_date, market.active, market.raw_json
    );
  }

  upsertOutcome(outcome: Omit<OutcomeRow, 'last_synced'>): void {
    this.db.prepare(`
      INSERT INTO outcomes (outcome_id, market_id, name, current_price, last_synced)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(outcome_id) DO UPDATE SET
        current_price = excluded.current_price,
        last_synced = datetime('now')
    `).run(outcome.outcome_id, outcome.market_id, outcome.name, outcome.current_price);
  }

  getMarket(marketId: string): MarketRow | undefined {
    return this.db.prepare(`SELECT * FROM markets WHERE market_id = ?`).get(marketId) as MarketRow | undefined;
  }

  getOutcomesForMarket(marketId: string): OutcomeRow[] {
    return this.db.prepare(`SELECT * FROM outcomes WHERE market_id = ?`).all(marketId) as OutcomeRow[];
  }

  getOutcomeById(outcomeId: string): OutcomeRow | undefined {
    return this.db.prepare(`SELECT * FROM outcomes WHERE outcome_id = ?`).get(outcomeId) as OutcomeRow | undefined;
  }

  getMarketByOutcomeId(outcomeId: string): MarketRow | undefined {
    return this.db.prepare(`
      SELECT m.* FROM markets m
      JOIN outcomes o ON o.market_id = m.market_id
      WHERE o.outcome_id = ?
    `).get(outcomeId) as MarketRow | undefined;
  }

  isMarketCacheStale(marketId: string, maxAgeMinutes: number): boolean {
    const row = this.db.prepare(
      `SELECT last_synced FROM markets WHERE market_id = ? AND last_synced > datetime('now', ? || ' minutes')`
    ).get(marketId, `-${maxAgeMinutes}`) as { last_synced: string } | undefined;
    return !row;
  }

  // ---- Orders ----

  insertOrder(order: {
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
  }): number {
    const result = this.db.prepare(`
      INSERT INTO orders (agent_id, outcome_id, side, order_type, requested_amount, requested_shares,
        limit_price, filled_amount, filled_shares, avg_fill_price, slippage, escrowed_entry_price, snapshot_id, status, filled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'filled' THEN datetime('now') ELSE NULL END)
    `).run(
      order.agent_id, order.outcome_id, order.side, order.order_type,
      order.requested_amount ?? null, order.requested_shares ?? null,
      order.limit_price ?? null, order.filled_amount ?? 0, order.filled_shares ?? 0,
      order.avg_fill_price ?? null, order.slippage ?? null,
      order.escrowed_entry_price ?? null, order.snapshot_id ?? null, order.status, order.status
    );
    return Number(result.lastInsertRowid);
  }

  getPendingOrders(agentId?: string, outcomeId?: string): OrderRow[] {
    let sql = `SELECT * FROM orders WHERE status IN ('pending', 'partial')`;
    const params: unknown[] = [];
    if (agentId) { sql += ` AND agent_id = ?`; params.push(agentId); }
    if (outcomeId) { sql += ` AND outcome_id = ?`; params.push(outcomeId); }
    return this.db.prepare(sql).all(...params) as OrderRow[];
  }

  updateOrderFill(orderId: number, filledAmount: number, filledShares: number, avgPrice: number, slippage: number, status: 'filled' | 'partial'): void {
    this.db.prepare(`
      UPDATE orders SET filled_amount = ?, filled_shares = ?, avg_fill_price = ?, slippage = ?,
        status = ?, filled_at = CASE WHEN ? = 'filled' THEN datetime('now') ELSE filled_at END
      WHERE order_id = ?
    `).run(filledAmount, filledShares, avgPrice, slippage, status, status, orderId);
  }

  cancelOrder(orderId: number, agentId: string): OrderRow | undefined {
    const order = this.db.prepare(
      `SELECT * FROM orders WHERE order_id = ? AND agent_id = ? AND status IN ('pending', 'partial')`
    ).get(orderId, agentId) as OrderRow | undefined;
    if (!order) return undefined;
    this.db.prepare(`UPDATE orders SET status = 'cancelled' WHERE order_id = ?`).run(orderId);
    return order;
  }

  cancelAllOrders(agentId: string, outcomeId?: string): number {
    let sql = `UPDATE orders SET status = 'cancelled' WHERE agent_id = ? AND status IN ('pending', 'partial')`;
    const params: unknown[] = [agentId];
    if (outcomeId) { sql += ` AND outcome_id = ?`; params.push(outcomeId); }
    return this.db.prepare(sql).run(...params).changes;
  }

  // ---- Positions ----

  upsertPosition(agentId: string, outcomeId: string, shares: number, avgEntryPrice: number): void {
    if (shares <= 0) {
      this.db.prepare(`DELETE FROM positions WHERE agent_id = ? AND outcome_id = ?`).run(agentId, outcomeId);
      return;
    }
    this.db.prepare(`
      INSERT INTO positions (agent_id, outcome_id, shares, avg_entry_price, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(agent_id, outcome_id) DO UPDATE SET
        shares = excluded.shares,
        avg_entry_price = excluded.avg_entry_price,
        updated_at = datetime('now')
    `).run(agentId, outcomeId, shares, avgEntryPrice);
  }

  getPosition(agentId: string, outcomeId: string): PositionRow | undefined {
    return this.db.prepare(
      `SELECT * FROM positions WHERE agent_id = ? AND outcome_id = ?`
    ).get(agentId, outcomeId) as PositionRow | undefined;
  }

  getPositions(agentId: string): PositionRow[] {
    return this.db.prepare(
      `SELECT * FROM positions WHERE agent_id = ?`
    ).all(agentId) as PositionRow[];
  }

  getPositionsForOutcome(outcomeId: string): PositionRow[] {
    return this.db.prepare(
      `SELECT * FROM positions WHERE outcome_id = ?`
    ).all(outcomeId) as PositionRow[];
  }

  getAllPositionedOutcomes(): string[] {
    return (this.db.prepare(
      `SELECT DISTINCT outcome_id FROM positions`
    ).all() as { outcome_id: string }[]).map(r => r.outcome_id);
  }

  updatePositionPrice(agentId: string, outcomeId: string, currentPrice: number): void {
    const pos = this.getPosition(agentId, outcomeId);
    if (!pos) return;
    const unrealizedPnl = (currentPrice - pos.avg_entry_price) * pos.shares;
    this.db.prepare(`
      UPDATE positions SET current_price = ?, unrealized_pnl = ?, updated_at = datetime('now')
      WHERE agent_id = ? AND outcome_id = ?
    `).run(currentPrice, unrealizedPnl, agentId, outcomeId);
  }

  // ---- Trade History ----

  recordTrade(trade: Omit<TradeHistoryRow, 'id' | 'closed_at'>): void {
    this.db.prepare(`
      INSERT INTO trade_history (agent_id, outcome_id, market_question, outcome_name,
        entry_price, exit_price, shares, realized_pnl, reason, opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trade.agent_id, trade.outcome_id, trade.market_question, trade.outcome_name,
      trade.entry_price, trade.exit_price, trade.shares, trade.realized_pnl,
      trade.reason, trade.opened_at
    );
  }

  getTotalRealizedPnl(agentId: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(realized_pnl), 0) AS total FROM trade_history WHERE agent_id = ?`
    ).get(agentId) as { total: number };
    return row.total;
  }

  getTradeCount(agentId: string): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) AS count FROM trade_history WHERE agent_id = ?`
    ).get(agentId) as { count: number };
    return row.count;
  }

  getTradeHistory(agentId: string, limit = 50): TradeHistoryRow[] {
    return this.db.prepare(
      `SELECT * FROM trade_history WHERE agent_id = ? ORDER BY closed_at DESC LIMIT ?`
    ).all(agentId, limit) as TradeHistoryRow[];
  }

  // ---- Resolutions ----

  insertResolution(outcomeId: string, resolvedValue: number): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO resolutions (outcome_id, resolved_value) VALUES (?, ?)`
    ).run(outcomeId, resolvedValue);
  }

  getResolution(outcomeId: string): ResolutionRow | undefined {
    return this.db.prepare(
      `SELECT * FROM resolutions WHERE outcome_id = ?`
    ).get(outcomeId) as ResolutionRow | undefined;
  }

  // ---- Leaderboard ----

  getLeaderboard(): Array<{
    agent_id: string;
    current_cash: number;
    initial_balance: number;
    realized_pnl: number;
    unrealized_pnl: number;
    num_trades: number;
    wins: number;
  }> {
    return this.db.prepare(`
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
    `).all() as Array<{
      agent_id: string; current_cash: number; initial_balance: number;
      realized_pnl: number; unrealized_pnl: number; num_trades: number; wins: number;
    }>;
  }

  // ---- Trade Snapshots ----

  insertSnapshot(snapshot: { agent_id: string; outcome_id: string; agent_context: string; market_snapshot: string }): number {
    const result = this.db.prepare(`
      INSERT INTO trade_snapshots (agent_id, outcome_id, agent_context, market_snapshot)
      VALUES (?, ?, ?, ?)
    `).run(snapshot.agent_id, snapshot.outcome_id, snapshot.agent_context, snapshot.market_snapshot);
    return Number(result.lastInsertRowid);
  }

  getSnapshot(snapshotId: number): TradeSnapshotRow | undefined {
    return this.db.prepare(
      `SELECT * FROM trade_snapshots WHERE snapshot_id = ?`
    ).get(snapshotId) as TradeSnapshotRow | undefined;
  }

  getSnapshotsForAgent(agentId: string): TradeSnapshotRow[] {
    return this.db.prepare(
      `SELECT * FROM trade_snapshots WHERE agent_id = ? ORDER BY created_at DESC`
    ).all(agentId) as TradeSnapshotRow[];
  }

  // ---- Transactions ----

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
