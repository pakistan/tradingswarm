# Polymarket MCP Server Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that gives agents paper trading capabilities on Polymarket with order book simulation against real market data.

**Architecture:** Standalone MCP server (separate repo from NaanHub) using the same patterns: TypeScript + better-sqlite3 + MCP SDK over stdio. Three layers: API client (Gamma + CLOB), paper trading engine (order book simulation + SQLite state), MCP tool interface (15 tools).

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `better-sqlite3`, `vitest`

**Spec:** `docs/superpowers/specs/2026-03-13-polymarket-agent-ecosystem-design.md`

---

## File Structure

```
polymarket-mcp/
  src/
    index.ts                  # MCP server entry point (stdio transport)
    types.ts                  # Shared TypeScript interfaces
    db.ts                     # SQLite schema + all DB methods
    db.test.ts                # DB layer tests
    polymarket-api.ts         # Gamma + CLOB API clients with rate limiting
    polymarket-api.test.ts    # API client tests (mocked fetch)
    order-engine.ts           # Order book fill simulation
    order-engine.test.ts      # Order engine tests
    tools.ts                  # Tool definitions + handler dispatch
    tools.test.ts             # Tool handler tests
    background.ts             # Limit order checker + resolution tracker
    background.test.ts        # Background loop tests
  package.json
  tsconfig.json
```

---

## Chunk 1: Project Scaffolding & Database Layer

### Task 1: Project Scaffolding

**Files:**
- Create: `polymarket-mcp/package.json`
- Create: `polymarket-mcp/tsconfig.json`
- Create: `polymarket-mcp/src/types.ts`

- [ ] **Step 1: Create project directory**

```bash
mkdir -p polymarket-mcp/src
```

- [ ] **Step 2: Write package.json**

Create `polymarket-mcp/package.json`:
```json
{
  "name": "polymarket-mcp",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "polymarket-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

Create `polymarket-mcp/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write types.ts**

Create `polymarket-mcp/src/types.ts`:
```typescript
// ---- Database row types ----

export interface AgentRow {
  agent_id: string;
  initial_balance: number;
  current_cash: number;
  created_at: string;
}

export interface MarketRow {
  market_id: string;
  question: string;
  category: string | null;
  description: string | null;
  resolution_source: string | null;
  volume: number | null;
  end_date: string | null;
  active: number;
  raw_json: string | null;
  last_synced: string;
}

export interface OutcomeRow {
  outcome_id: string;
  market_id: string;
  name: string;
  current_price: number | null;
  last_synced: string;
}

export interface OrderRow {
  order_id: number;
  agent_id: string;
  outcome_id: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  requested_amount: number | null;
  requested_shares: number | null;
  limit_price: number | null;
  filled_amount: number;
  filled_shares: number;
  avg_fill_price: number | null;
  slippage: number | null;
  escrowed_entry_price: number | null;
  status: 'filled' | 'partial' | 'pending' | 'cancelled';
  created_at: string;
  filled_at: string | null;
}

export interface PositionRow {
  agent_id: string;
  outcome_id: string;
  shares: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  updated_at: string;
}

export interface TradeHistoryRow {
  id: number;
  agent_id: string;
  outcome_id: string;
  market_question: string;
  outcome_name: string;
  entry_price: number;
  exit_price: number;
  shares: number;
  realized_pnl: number;
  reason: 'sold' | 'resolved_win' | 'resolved_loss';
  opened_at: string;
  closed_at: string;
}

export interface ResolutionRow {
  outcome_id: string;
  resolved_value: number;
  resolved_at: string;
}

// ---- API response types ----

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  asset_id: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  mid_price: number;
  timestamp: string;
}

export interface FillResult {
  filled_amount: number;
  filled_shares: number;
  avg_fill_price: number;
  slippage: number;
  levels_consumed: number;
}

export interface GammaMarket {
  id: string;
  question: string;
  category: string | null;
  description: string | null;
  resolutionSource: string | null;
  volume: string | null;
  volumeNum: number | null;
  endDate: string | null;
  active: boolean | null;
  closed: boolean | null;
  outcomes: string | null;
  outcomePrices: string | null;
  clobTokenIds: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  spread: number | null;
  oneDayPriceChange: number | null;
  acceptingOrders: boolean | null;
}

export interface PricePoint {
  t: number;
  p: number;
}
```

- [ ] **Step 5: Install dependencies and verify build**

```bash
cd polymarket-mcp && npm install && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add polymarket-mcp/
git commit -m "feat(polymarket-mcp): scaffold project with types"
```

---

### Task 2: Database Schema & Agent Methods

**Files:**
- Create: `polymarket-mcp/src/db.ts`
- Create: `polymarket-mcp/src/db.test.ts`

- [ ] **Step 1: Write failing test for DB initialization and agent auto-creation**

Create `polymarket-mcp/src/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolymarketDB } from './db.js';
import fs from 'fs';
import path from 'path';

const TEST_DIR = path.join(import.meta.dirname, '..', '.test-data');
const TEST_DB = path.join(TEST_DIR, 'polymarket.db');

let db: PolymarketDB;

beforeEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  db = new PolymarketDB(TEST_DIR);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('agent management', () => {
  it('auto-creates agent with default balance', () => {
    const agent = db.getOrCreateAgent('agent-1');
    expect(agent.agent_id).toBe('agent-1');
    expect(agent.initial_balance).toBe(10000);
    expect(agent.current_cash).toBe(10000);
  });

  it('returns existing agent on second call', () => {
    db.getOrCreateAgent('agent-1');
    db.updateCash('agent-1', -500);
    const agent = db.getOrCreateAgent('agent-1');
    expect(agent.current_cash).toBe(9500);
  });

  it('updates cash balance', () => {
    db.getOrCreateAgent('agent-1');
    db.updateCash('agent-1', -1000);
    const agent = db.getOrCreateAgent('agent-1');
    expect(agent.current_cash).toBe(9000);
  });

  it('throws if cash would go negative', () => {
    db.getOrCreateAgent('agent-1');
    expect(() => db.updateCash('agent-1', -20000)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd polymarket-mcp && npx vitest run src/db.test.ts
```
Expected: FAIL — `db.ts` doesn't exist.

- [ ] **Step 3: Implement db.ts with schema and agent methods**

Create `polymarket-mcp/src/db.ts`:
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { AgentRow, MarketRow, OutcomeRow, OrderRow, PositionRow, TradeHistoryRow, ResolutionRow } from './types.js';

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
    status: 'filled' | 'partial' | 'pending' | 'cancelled';
  }): number {
    const result = this.db.prepare(`
      INSERT INTO orders (agent_id, outcome_id, side, order_type, requested_amount, requested_shares,
        limit_price, filled_amount, filled_shares, avg_fill_price, slippage, escrowed_entry_price, status, filled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'filled' THEN datetime('now') ELSE NULL END)
    `).run(
      order.agent_id, order.outcome_id, order.side, order.order_type,
      order.requested_amount ?? null, order.requested_shares ?? null,
      order.limit_price ?? null, order.filled_amount ?? 0, order.filled_shares ?? 0,
      order.avg_fill_price ?? null, order.slippage ?? null,
      order.escrowed_entry_price ?? null, order.status, order.status
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

  // ---- Transactions ----

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd polymarket-mcp && npx vitest run src/db.test.ts
```
Expected: All 4 agent tests pass.

- [ ] **Step 5: Add market cache, order, and position tests**

Append to `polymarket-mcp/src/db.test.ts`:
```typescript
describe('market cache', () => {
  it('upserts and retrieves a market', () => {
    db.upsertMarket({
      market_id: 'mkt-1', question: 'Will X happen?', category: 'politics',
      description: 'Test', resolution_source: 'AP', volume: 50000,
      end_date: '2026-04-01', active: 1, raw_json: null,
    });
    const m = db.getMarket('mkt-1');
    expect(m?.question).toBe('Will X happen?');
  });

  it('upserts outcomes and retrieves by market', () => {
    db.upsertMarket({
      market_id: 'mkt-1', question: 'Q', category: null,
      description: null, resolution_source: null, volume: null,
      end_date: null, active: 1, raw_json: null,
    });
    db.upsertOutcome({ outcome_id: 'out-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.6 });
    db.upsertOutcome({ outcome_id: 'out-no', market_id: 'mkt-1', name: 'No', current_price: 0.4 });
    const outcomes = db.getOutcomesForMarket('mkt-1');
    expect(outcomes).toHaveLength(2);
  });
});

describe('orders', () => {
  it('inserts and retrieves pending orders', () => {
    db.getOrCreateAgent('agent-1');
    const id = db.insertOrder({
      agent_id: 'agent-1', outcome_id: 'out-1', side: 'buy',
      order_type: 'limit', requested_shares: 100, limit_price: 0.5,
      status: 'pending',
    });
    const pending = db.getPendingOrders('agent-1');
    expect(pending).toHaveLength(1);
    expect(pending[0].order_id).toBe(id);
  });

  it('cancels an order', () => {
    db.getOrCreateAgent('agent-1');
    const id = db.insertOrder({
      agent_id: 'agent-1', outcome_id: 'out-1', side: 'buy',
      order_type: 'limit', status: 'pending',
    });
    const cancelled = db.cancelOrder(id, 'agent-1');
    expect(cancelled).toBeDefined();
    expect(db.getPendingOrders('agent-1')).toHaveLength(0);
  });

  it('cancel returns undefined for wrong agent', () => {
    db.getOrCreateAgent('agent-1');
    db.getOrCreateAgent('agent-2');
    const id = db.insertOrder({
      agent_id: 'agent-1', outcome_id: 'out-1', side: 'buy',
      order_type: 'limit', status: 'pending',
    });
    expect(db.cancelOrder(id, 'agent-2')).toBeUndefined();
  });
});

describe('positions', () => {
  it('upserts and retrieves a position', () => {
    db.getOrCreateAgent('agent-1');
    db.upsertPosition('agent-1', 'out-1', 100, 0.55);
    const pos = db.getPosition('agent-1', 'out-1');
    expect(pos?.shares).toBe(100);
    expect(pos?.avg_entry_price).toBe(0.55);
  });

  it('deletes position when shares reach 0', () => {
    db.getOrCreateAgent('agent-1');
    db.upsertPosition('agent-1', 'out-1', 100, 0.55);
    db.upsertPosition('agent-1', 'out-1', 0, 0);
    expect(db.getPosition('agent-1', 'out-1')).toBeUndefined();
  });

  it('updates position price and unrealized pnl', () => {
    db.getOrCreateAgent('agent-1');
    db.upsertPosition('agent-1', 'out-1', 100, 0.50);
    db.updatePositionPrice('agent-1', 'out-1', 0.70);
    const pos = db.getPosition('agent-1', 'out-1');
    expect(pos?.current_price).toBe(0.70);
    expect(pos?.unrealized_pnl).toBeCloseTo(20);
  });
});

describe('trade history', () => {
  it('records and retrieves a trade', () => {
    db.getOrCreateAgent('agent-1');
    db.recordTrade({
      agent_id: 'agent-1', outcome_id: 'out-1', market_question: 'Will X?',
      outcome_name: 'Yes', entry_price: 0.5, exit_price: 0.7,
      shares: 100, realized_pnl: 20, reason: 'sold', opened_at: '2026-03-01',
    });
    const history = db.getTradeHistory('agent-1');
    expect(history).toHaveLength(1);
    expect(history[0].realized_pnl).toBe(20);
  });
});

describe('leaderboard', () => {
  it('returns all agents with stats', () => {
    db.getOrCreateAgent('agent-1');
    db.getOrCreateAgent('agent-2');
    db.recordTrade({
      agent_id: 'agent-1', outcome_id: 'out-1', market_question: 'Q',
      outcome_name: 'Yes', entry_price: 0.5, exit_price: 0.8,
      shares: 100, realized_pnl: 30, reason: 'sold', opened_at: '2026-03-01',
    });
    const lb = db.getLeaderboard();
    expect(lb).toHaveLength(2);
    const a1 = lb.find(a => a.agent_id === 'agent-1');
    expect(a1?.realized_pnl).toBe(30);
    expect(a1?.wins).toBe(1);
  });
});
```

- [ ] **Step 6: Run all DB tests**

```bash
cd polymarket-mcp && npx vitest run src/db.test.ts
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "feat(polymarket-mcp): add database layer with schema and full CRUD"
```

---

## Chunk 2: API Client & Order Engine

### Task 3: Polymarket API Client

**Files:**
- Create: `polymarket-mcp/src/polymarket-api.ts`
- Create: `polymarket-mcp/src/polymarket-api.test.ts`

- [ ] **Step 1: Write failing test for Gamma API market listing**

Create `polymarket-mcp/src/polymarket-api.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketAPI } from './polymarket-api.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let api: PolymarketAPI;

beforeEach(() => {
  mockFetch.mockReset();
  api = new PolymarketAPI();
});

describe('listMarkets', () => {
  it('fetches markets from Gamma API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: '123', question: 'Will X?', category: 'politics',
        description: 'Test', resolutionSource: 'AP', volumeNum: 50000,
        endDate: '2026-04-01T00:00:00Z', active: true, closed: false,
        outcomes: '["Yes","No"]', outcomePrices: '[0.6,0.4]',
        clobTokenIds: '["token-yes","token-no"]',
        bestBid: 0.59, bestAsk: 0.61, lastTradePrice: 0.6,
        spread: 0.02, oneDayPriceChange: 0.05, acceptingOrders: true,
      }],
    });

    const markets = await api.listMarkets({ limit: 10 });
    expect(markets).toHaveLength(1);
    expect(markets[0].question).toBe('Will X?');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('gamma-api.polymarket.com/markets'),
      expect.any(Object)
    );
  });

  it('passes query params correctly', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await api.listMarkets({ limit: 5, category: 'crypto', min_volume: 1000 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=5');
    expect(url).toContain('volume_num_min=1000');
  });
});

describe('searchMarkets', () => {
  it('fetches from public-search endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: [{ markets: [{ id: '1', question: 'Test?' }] }] }),
    });
    const results = await api.searchMarkets('election');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('gamma-api.polymarket.com/public-search'),
      expect.any(Object)
    );
  });
});

describe('getOrderBook', () => {
  it('fetches order book from CLOB API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        asset_id: 'token-yes',
        bids: [{ price: '0.55', size: '200' }, { price: '0.50', size: '500' }],
        asks: [{ price: '0.60', size: '300' }, { price: '0.65', size: '400' }],
        timestamp: '1234567890',
        last_trade_price: '0.58',
      }),
    });

    const book = await api.getOrderBook('token-yes');
    expect(book.bids).toHaveLength(2);
    expect(book.bids[0].price).toBe(0.55);
    expect(book.asks[0].price).toBe(0.60);
    expect(book.spread).toBeCloseTo(0.05);
    expect(book.mid_price).toBeCloseTo(0.575);
  });
});

describe('getPriceHistory', () => {
  it('fetches price history from CLOB API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        history: [
          { t: 1000, p: 0.5 },
          { t: 2000, p: 0.55 },
        ],
      }),
    });

    const history = await api.getPriceHistory('token-yes', { interval: '1d' });
    expect(history).toHaveLength(2);
    expect(history[0].p).toBe(0.5);
  });
});

describe('rate limiting', () => {
  it('retries on 429 with backoff', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Map([['retry-after', '1']]) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const markets = await api.listMarkets({});
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd polymarket-mcp && npx vitest run src/polymarket-api.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement polymarket-api.ts**

Create `polymarket-mcp/src/polymarket-api.ts`:
```typescript
import type { GammaMarket, OrderBook, OrderBookLevel, PricePoint } from './types.js';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

export class PolymarketAPI {
  private lastRequestTime = 0;
  private minIntervalMs = 200; // 5 req/s default

  private async rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this.lastRequestTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastRequestTime = Date.now();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw new Error(`API error ${res.status}: ${url}`);
    }
    throw new Error(`API failed after ${MAX_RETRIES} retries: ${url}`);
  }

  // ---- Gamma API (public, no auth) ----

  async listMarkets(params: {
    query?: string; category?: string; min_volume?: number;
    max_end_date?: string; limit?: number; offset?: number;
    closed?: boolean;
  }): Promise<GammaMarket[]> {
    const url = new URL(`${GAMMA_BASE}/markets`);
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.offset) url.searchParams.set('offset', String(params.offset));
    if (params.min_volume) url.searchParams.set('volume_num_min', String(params.min_volume));
    if (params.max_end_date) url.searchParams.set('end_date_max', params.max_end_date);
    if (params.closed !== undefined) url.searchParams.set('closed', String(params.closed));
    if (params.category) url.searchParams.set('tag_id', params.category); // categories are tags in Gamma
    const res = await this.rateLimitedFetch(url.toString());
    return await res.json() as GammaMarket[];
  }

  async searchMarkets(query: string, limit = 20): Promise<unknown> {
    const url = new URL(`${GAMMA_BASE}/public-search`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit_per_type', String(limit));
    const res = await this.rateLimitedFetch(url.toString());
    return await res.json();
  }

  async getMarketDetail(marketId: string): Promise<GammaMarket> {
    const res = await this.rateLimitedFetch(`${GAMMA_BASE}/markets/${marketId}`);
    return await res.json() as GammaMarket;
  }

  // ---- CLOB API (order book is public, trading needs auth) ----

  async getOrderBook(tokenId: string): Promise<OrderBook> {
    const url = new URL(`${CLOB_BASE}/book`);
    url.searchParams.set('token_id', tokenId);
    const res = await this.rateLimitedFetch(url.toString());
    const raw = await res.json() as {
      asset_id: string;
      bids: Array<{ price: string; size: string }>;
      asks: Array<{ price: string; size: string }>;
      timestamp: string;
      last_trade_price: string;
    };

    const bids: OrderBookLevel[] = raw.bids.map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }));
    const asks: OrderBookLevel[] = raw.asks.map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }));

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 1;

    return {
      asset_id: raw.asset_id,
      bids,
      asks,
      spread: bestAsk - bestBid,
      mid_price: (bestBid + bestAsk) / 2,
      timestamp: raw.timestamp,
    };
  }

  async getPriceHistory(tokenId: string, params?: {
    interval?: string; startTs?: number; endTs?: number; fidelity?: number;
  }): Promise<PricePoint[]> {
    const url = new URL(`${CLOB_BASE}/prices-history`);
    url.searchParams.set('market', tokenId);
    if (params?.interval) url.searchParams.set('interval', params.interval);
    if (params?.startTs) url.searchParams.set('startTs', String(params.startTs));
    if (params?.endTs) url.searchParams.set('endTs', String(params.endTs));
    if (params?.fidelity) url.searchParams.set('fidelity', String(params.fidelity));
    const res = await this.rateLimitedFetch(url.toString());
    const data = await res.json() as { history: PricePoint[] };
    return data.history;
  }

  async getMidpointPrice(tokenId: string): Promise<number> {
    const url = new URL(`${CLOB_BASE}/midpoint`);
    url.searchParams.set('token_id', tokenId);
    const res = await this.rateLimitedFetch(url.toString());
    const data = await res.json() as { mid: string };
    return parseFloat(data.mid);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd polymarket-mcp && npx vitest run src/polymarket-api.test.ts
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "feat(polymarket-mcp): add Polymarket API client with rate limiting"
```

---

### Task 4: Order Book Simulation Engine

**Files:**
- Create: `polymarket-mcp/src/order-engine.ts`
- Create: `polymarket-mcp/src/order-engine.test.ts`

- [ ] **Step 1: Write failing tests for buy-side fill simulation**

Create `polymarket-mcp/src/order-engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { simulateBuy, simulateSell, simulateSellByAmount } from './order-engine.js';
import type { OrderBookLevel } from './types.js';

const asks: OrderBookLevel[] = [
  { price: 0.60, size: 100 },
  { price: 0.65, size: 200 },
  { price: 0.70, size: 300 },
];

const bids: OrderBookLevel[] = [
  { price: 0.55, size: 150 },
  { price: 0.50, size: 250 },
  { price: 0.45, size: 400 },
];

describe('simulateBuy', () => {
  it('fills entirely at best ask when amount fits', () => {
    const result = simulateBuy(asks, { amount: 30 }); // 30 / 0.60 = 50 shares, well within 100
    expect(result.avg_fill_price).toBe(0.60);
    expect(result.filled_shares).toBeCloseTo(50);
    expect(result.filled_amount).toBeCloseTo(30);
    expect(result.slippage).toBe(0);
  });

  it('walks multiple levels when amount exceeds top level', () => {
    // 100 shares * 0.60 = $60 at level 1, need more
    const result = simulateBuy(asks, { amount: 100 });
    expect(result.avg_fill_price).toBeGreaterThan(0.60);
    expect(result.levels_consumed).toBeGreaterThan(1);
  });

  it('buys by share count', () => {
    const result = simulateBuy(asks, { shares: 50 });
    expect(result.filled_shares).toBe(50);
    expect(result.avg_fill_price).toBe(0.60);
  });

  it('partially fills when book is exhausted', () => {
    const thinAsks: OrderBookLevel[] = [{ price: 0.60, size: 10 }];
    const result = simulateBuy(thinAsks, { amount: 1000 });
    expect(result.filled_shares).toBe(10);
    expect(result.filled_amount).toBeCloseTo(6);
  });

  it('returns zero fill on empty book', () => {
    const result = simulateBuy([], { amount: 100 });
    expect(result.filled_shares).toBe(0);
    expect(result.filled_amount).toBe(0);
  });
});

describe('simulateSell', () => {
  it('fills at best bid when shares fit', () => {
    const result = simulateSell(bids, 50);
    expect(result.avg_fill_price).toBe(0.55);
    expect(result.filled_shares).toBe(50);
    expect(result.filled_amount).toBeCloseTo(27.5);
  });

  it('walks multiple bid levels', () => {
    const result = simulateSell(bids, 200);
    expect(result.avg_fill_price).toBeLessThan(0.55);
    expect(result.levels_consumed).toBeGreaterThan(1);
  });

  it('partially fills on thin book', () => {
    const thinBids: OrderBookLevel[] = [{ price: 0.55, size: 10 }];
    const result = simulateSell(thinBids, 100);
    expect(result.filled_shares).toBe(10);
  });
});

describe('simulateSellByAmount', () => {
  it('sells enough shares to generate target dollar amount', () => {
    const result = simulateSellByAmount(bids, 27.5); // 50 shares * 0.55 = $27.50
    expect(result.filled_shares).toBe(50);
    expect(result.filled_amount).toBeCloseTo(27.5);
    expect(result.avg_fill_price).toBe(0.55);
  });

  it('walks multiple levels when top level insufficient', () => {
    const result = simulateSellByAmount(bids, 200); // needs more than 150 * 0.55
    expect(result.levels_consumed).toBeGreaterThan(1);
    expect(result.filled_amount).toBeCloseTo(200, 0);
  });

  it('returns zero on empty book', () => {
    const result = simulateSellByAmount([], 100);
    expect(result.filled_shares).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd polymarket-mcp && npx vitest run src/order-engine.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement order-engine.ts**

Create `polymarket-mcp/src/order-engine.ts`:
```typescript
import type { OrderBookLevel, FillResult } from './types.js';

/**
 * Simulate a market buy against ask levels.
 * Specify either { amount } (dollars to spend) or { shares } (shares to acquire).
 */
export function simulateBuy(
  asks: OrderBookLevel[],
  target: { amount?: number; shares?: number },
): FillResult {
  if (asks.length === 0 || (!target.amount && !target.shares)) {
    return { filled_amount: 0, filled_shares: 0, avg_fill_price: 0, slippage: 0, levels_consumed: 0 };
  }

  const bestAsk = asks[0].price;
  let remainingAmount = target.amount ?? Infinity;
  let remainingShares = target.shares ?? Infinity;
  let totalCost = 0;
  let totalShares = 0;
  let levelsConsumed = 0;

  for (const level of asks) {
    if (remainingAmount <= 0 || remainingShares <= 0) break;
    levelsConsumed++;

    const maxSharesByAmount = remainingAmount / level.price;
    const maxSharesByTarget = remainingShares;
    const maxSharesByBook = level.size;
    const sharesToFill = Math.min(maxSharesByAmount, maxSharesByTarget, maxSharesByBook);

    const cost = sharesToFill * level.price;
    totalCost += cost;
    totalShares += sharesToFill;

    if (target.amount !== undefined) remainingAmount -= cost;
    if (target.shares !== undefined) remainingShares -= sharesToFill;
  }

  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
  const slippage = totalShares > 0 ? avgPrice - bestAsk : 0;

  return {
    filled_amount: totalCost,
    filled_shares: totalShares,
    avg_fill_price: avgPrice,
    slippage: Math.max(0, slippage),
    levels_consumed: levelsConsumed,
  };
}

/**
 * Simulate a market sell against bid levels.
 */
export function simulateSell(
  bids: OrderBookLevel[],
  sharesToSell: number,
): FillResult {
  if (bids.length === 0 || sharesToSell <= 0) {
    return { filled_amount: 0, filled_shares: 0, avg_fill_price: 0, slippage: 0, levels_consumed: 0 };
  }

  const bestBid = bids[0].price;
  let remaining = sharesToSell;
  let totalProceeds = 0;
  let totalShares = 0;
  let levelsConsumed = 0;

  for (const level of bids) {
    if (remaining <= 0) break;
    levelsConsumed++;

    const sharesToFill = Math.min(remaining, level.size);
    const proceeds = sharesToFill * level.price;
    totalProceeds += proceeds;
    totalShares += sharesToFill;
    remaining -= sharesToFill;
  }

  const avgPrice = totalShares > 0 ? totalProceeds / totalShares : 0;
  const slippage = totalShares > 0 ? bestBid - avgPrice : 0;

  return {
    filled_amount: totalProceeds,
    filled_shares: totalShares,
    avg_fill_price: avgPrice,
    slippage: Math.max(0, slippage),
    levels_consumed: levelsConsumed,
  };
}

/**
 * Simulate selling enough shares to generate a target dollar amount.
 */
export function simulateSellByAmount(
  bids: OrderBookLevel[],
  targetAmount: number,
): FillResult {
  if (bids.length === 0 || targetAmount <= 0) {
    return { filled_amount: 0, filled_shares: 0, avg_fill_price: 0, slippage: 0, levels_consumed: 0 };
  }

  const bestBid = bids[0].price;
  let remainingAmount = targetAmount;
  let totalProceeds = 0;
  let totalShares = 0;
  let levelsConsumed = 0;

  for (const level of bids) {
    if (remainingAmount <= 0) break;
    levelsConsumed++;

    const maxSharesForAmount = remainingAmount / level.price;
    const sharesToFill = Math.min(maxSharesForAmount, level.size);
    const proceeds = sharesToFill * level.price;
    totalProceeds += proceeds;
    totalShares += sharesToFill;
    remainingAmount -= proceeds;
  }

  const avgPrice = totalShares > 0 ? totalProceeds / totalShares : 0;
  const slippage = totalShares > 0 ? bestBid - avgPrice : 0;

  return {
    filled_amount: totalProceeds,
    filled_shares: totalShares,
    avg_fill_price: avgPrice,
    slippage: Math.max(0, slippage),
    levels_consumed: levelsConsumed,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd polymarket-mcp && npx vitest run src/order-engine.test.ts
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "feat(polymarket-mcp): add order book simulation engine"
```

---

## Chunk 3: MCP Tool Handlers

### Task 5: Tool Definitions

**Files:**
- Create: `polymarket-mcp/src/tools.ts`

- [ ] **Step 1: Write tool definitions array and handler skeleton**

Create `polymarket-mcp/src/tools.ts`:
```typescript
import type { PolymarketDB } from './db.js';
import type { PolymarketAPI } from './polymarket-api.js';
import { simulateBuy, simulateSell, simulateSellByAmount } from './order-engine.js';

export const TOOL_DEFINITIONS = [
  // ---- Market Data ----
  {
    name: 'pm_markets',
    description: 'Search and browse active Polymarket prediction markets. Returns market ID, question, outcomes with prices, volume, and end date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        category: { type: 'string', description: 'Filter by category' },
        min_volume: { type: 'number', description: 'Minimum trading volume' },
        max_end_date: { type: 'string', description: 'Latest resolution date (ISO 8601)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'pm_market_detail',
    description: 'Full detail on a single market: description, resolution source, rules, outcomes with prices, volume, end date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market_id: { type: 'string', description: 'Market ID' },
      },
      required: ['market_id'],
    },
  },
  {
    name: 'pm_orderbook',
    description: 'Live order book depth for a specific outcome token. Shows bids, asks, sizes at each price level, spread, and mid price.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outcome_id: { type: 'string', description: 'Outcome token ID (clobTokenId)' },
      },
      required: ['outcome_id'],
    },
  },
  {
    name: 'pm_price_history',
    description: 'Historical price movement for an outcome token over time.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outcome_id: { type: 'string', description: 'Outcome token ID' },
        interval: { type: 'string', enum: ['1h', '6h', '1d', '1w', '1m', 'all'], description: 'Time interval' },
        limit: { type: 'number', description: 'Max data points' },
      },
      required: ['outcome_id'],
    },
  },
  // ---- Paper Trading ----
  {
    name: 'pm_buy',
    description: 'Place a simulated buy order. Fills against real order book depth, modeling slippage. Specify amount (dollars) OR shares (count).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID to buy' },
        amount: { type: 'number', description: 'Dollar amount to spend' },
        shares: { type: 'number', description: 'Number of shares to buy' },
      },
      required: ['agent_id', 'outcome_id'],
    },
  },
  {
    name: 'pm_sell',
    description: 'Sell/exit a position. Fills against real order book depth. Specify shares (count) OR amount (dollar proceeds target).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID to sell' },
        shares: { type: 'number', description: 'Number of shares to sell' },
        amount: { type: 'number', description: 'Dollar amount of proceeds to target' },
      },
      required: ['agent_id', 'outcome_id'],
    },
  },
  {
    name: 'pm_limit_order',
    description: 'Place a resting limit order at a specific price. Fills when market crosses that level.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID' },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Buy or sell' },
        shares: { type: 'number', description: 'Number of shares' },
        price: { type: 'number', description: 'Limit price' },
      },
      required: ['agent_id', 'outcome_id', 'side', 'shares', 'price'],
    },
  },
  {
    name: 'pm_orders',
    description: 'List pending limit orders for your agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Filter by outcome (optional)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_cancel_order',
    description: 'Cancel a pending limit order.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        order_id: { type: 'number', description: 'Order ID to cancel' },
      },
      required: ['agent_id', 'order_id'],
    },
  },
  {
    name: 'pm_cancel_all',
    description: 'Cancel all pending limit orders, optionally for a specific outcome.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Filter by outcome (optional)' },
      },
      required: ['agent_id'],
    },
  },
  // ---- Portfolio & Results ----
  {
    name: 'pm_positions',
    description: 'Your current open positions with mark-to-market P&L.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_balance',
    description: 'Account summary: cash, positions value, total portfolio, realized/unrealized P&L.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_history',
    description: 'Closed/resolved trade history with realized P&L. Use this for post-mortems.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        limit: { type: 'number', description: 'Max trades to return (default 50)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_leaderboard',
    description: 'Cross-agent performance comparison: total return, win rate, P&L.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'pm_check_resolution',
    description: 'Manually check if a market has resolved. Settles any open positions if resolved.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market_id: { type: 'string', description: 'Market ID to check' },
      },
      required: ['market_id'],
    },
  },
];

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  db: PolymarketDB,
  api: PolymarketAPI,
): Promise<string> {
  switch (name) {
    // ---- Market Data ----
    case 'pm_markets': {
      const query = args.query as string | undefined;
      if (query) {
        const results = await api.searchMarkets(query, (args.limit as number) ?? 20);
        return JSON.stringify(results, null, 2);
      }
      const markets = await api.listMarkets({
        category: args.category as string | undefined,
        min_volume: args.min_volume as number | undefined,
        max_end_date: args.max_end_date as string | undefined,
        limit: (args.limit as number) ?? 20,
        offset: args.offset as number | undefined,
      });
      // Cache results
      for (const m of markets) {
        db.upsertMarket({
          market_id: m.id, question: m.question ?? '', category: m.category,
          description: m.description, resolution_source: m.resolutionSource,
          volume: m.volumeNum, end_date: m.endDate, active: m.active ? 1 : 0,
          raw_json: JSON.stringify(m),
        });
        // Parse outcomes + token IDs
        if (m.outcomes && m.outcomePrices && m.clobTokenIds) {
          try {
            const names = JSON.parse(m.outcomes) as string[];
            const prices = JSON.parse(m.outcomePrices) as string[];
            const tokens = JSON.parse(m.clobTokenIds) as string[];
            for (let i = 0; i < names.length; i++) {
              db.upsertOutcome({
                outcome_id: tokens[i], market_id: m.id,
                name: names[i], current_price: parseFloat(prices[i]),
              });
            }
          } catch { /* skip malformed */ }
        }
      }
      // Return simplified view
      const simplified = markets.map(m => {
        let outcomes: Array<{ name: string; price: number; token_id: string }> = [];
        try {
          const names = JSON.parse(m.outcomes ?? '[]') as string[];
          const prices = JSON.parse(m.outcomePrices ?? '[]') as string[];
          const tokens = JSON.parse(m.clobTokenIds ?? '[]') as string[];
          outcomes = names.map((n, i) => ({ name: n, price: parseFloat(prices[i]), token_id: tokens[i] }));
        } catch { /* skip */ }
        return {
          market_id: m.id, question: m.question, category: m.category,
          outcomes, volume: m.volumeNum, end_date: m.endDate, active: m.active,
        };
      });
      return JSON.stringify(simplified, null, 2);
    }

    case 'pm_market_detail': {
      const marketId = args.market_id as string;
      const market = await api.getMarketDetail(marketId);
      db.upsertMarket({
        market_id: market.id, question: market.question ?? '', category: market.category,
        description: market.description, resolution_source: market.resolutionSource,
        volume: market.volumeNum, end_date: market.endDate,
        active: market.active ? 1 : 0, raw_json: JSON.stringify(market),
      });
      return JSON.stringify(market, null, 2);
    }

    case 'pm_orderbook': {
      const outcomeId = args.outcome_id as string;
      const book = await api.getOrderBook(outcomeId);
      return JSON.stringify(book, null, 2);
    }

    case 'pm_price_history': {
      const outcomeId = args.outcome_id as string;
      const history = await api.getPriceHistory(outcomeId, {
        interval: args.interval as string | undefined,
      });
      return JSON.stringify(history, null, 2);
    }

    // ---- Paper Trading ----
    case 'pm_buy': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string;
      const amount = args.amount as number | undefined;
      const shares = args.shares as number | undefined;
      if (!amount && !shares) throw new Error('Must specify amount or shares');

      db.getOrCreateAgent(agentId);
      const book = await api.getOrderBook(outcomeId);
      const fill = simulateBuy(book.asks, { amount, shares });
      if (fill.filled_shares === 0) throw new Error('No liquidity available');

      return db.transaction(() => {
        db.updateCash(agentId, -fill.filled_amount);
        const existing = db.getPosition(agentId, outcomeId);
        const totalShares = (existing?.shares ?? 0) + fill.filled_shares;
        const totalCost = (existing ? existing.avg_entry_price * existing.shares : 0) + fill.filled_amount;
        const newAvg = totalCost / totalShares;
        db.upsertPosition(agentId, outcomeId, totalShares, newAvg);

        const orderId = db.insertOrder({
          agent_id: agentId, outcome_id: outcomeId, side: 'buy', order_type: 'market',
          requested_amount: amount, requested_shares: shares,
          filled_amount: fill.filled_amount, filled_shares: fill.filled_shares,
          avg_fill_price: fill.avg_fill_price, slippage: fill.slippage, status: 'filled',
        });

        const agent = db.getOrCreateAgent(agentId);
        return JSON.stringify({
          order_id: orderId, outcome_id: outcomeId, side: 'buy',
          filled_amount: fill.filled_amount, avg_fill_price: fill.avg_fill_price,
          slippage: fill.slippage, shares_acquired: fill.filled_shares,
          new_cash_balance: agent.current_cash,
        }, null, 2);
      });
    }

    case 'pm_sell': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string;
      const shareCount = args.shares as number | undefined;
      const amount = args.amount as number | undefined;
      if (!shareCount && !amount) throw new Error('Must specify shares or amount');

      const position = db.getPosition(agentId, outcomeId);
      if (!position || position.shares <= 0) throw new Error('No position to sell');

      const book = await api.getOrderBook(outcomeId);

      let fill;
      if (shareCount) {
        if (shareCount > position.shares) throw new Error(`Cannot sell ${shareCount} shares, only hold ${position.shares}`);
        fill = simulateSell(book.bids, shareCount);
      } else {
        // Sell by dollar amount — cap shares at what we hold
        fill = simulateSellByAmount(book.bids, amount!);
        if (fill.filled_shares > position.shares) {
          // Recompute: sell only what we have
          fill = simulateSell(book.bids, position.shares);
        }
      }
      if (fill.filled_shares === 0) throw new Error('No liquidity available');

      return db.transaction(() => {
        db.updateCash(agentId, fill.filled_amount);
        const remainingShares = position.shares - fill.filled_shares;
        db.upsertPosition(agentId, outcomeId, remainingShares, position.avg_entry_price);

        const realizedPnl = (fill.avg_fill_price - position.avg_entry_price) * fill.filled_shares;

        const outcomeRow = db.getOutcomeById(outcomeId);
        const marketRow = db.getMarketByOutcomeId(outcomeId);

        db.recordTrade({
          agent_id: agentId, outcome_id: outcomeId,
          market_question: marketRow?.question ?? 'Unknown',
          outcome_name: outcomeRow?.name ?? 'Unknown',
          entry_price: position.avg_entry_price, exit_price: fill.avg_fill_price,
          shares: fill.filled_shares, realized_pnl: realizedPnl,
          reason: 'sold', opened_at: position.updated_at,
        });

        const orderId = db.insertOrder({
          agent_id: agentId, outcome_id: outcomeId, side: 'sell', order_type: 'market',
          requested_shares: shareCount, requested_amount: amount,
          filled_amount: fill.filled_amount, filled_shares: fill.filled_shares,
          avg_fill_price: fill.avg_fill_price, slippage: fill.slippage, status: 'filled',
        });

        const agent = db.getOrCreateAgent(agentId);
        return JSON.stringify({
          order_id: orderId, outcome_id: outcomeId, side: 'sell',
          filled_shares: fill.filled_shares, avg_fill_price: fill.avg_fill_price,
          slippage: fill.slippage, proceeds: fill.filled_amount,
          realized_pnl: realizedPnl, new_cash_balance: agent.current_cash,
        }, null, 2);
      });
    }

    case 'pm_limit_order': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string;
      const side = args.side as 'buy' | 'sell';
      const shares = args.shares as number;
      const price = args.price as number;

      db.getOrCreateAgent(agentId);

      if (side === 'buy') {
        const escrow = shares * price;
        db.updateCash(agentId, -escrow); // escrow cash
      } else {
        const position = db.getPosition(agentId, outcomeId);
        if (!position || position.shares < shares) {
          throw new Error(`Insufficient shares to place sell limit. Have ${position?.shares ?? 0}, need ${shares}`);
        }
        // Escrow shares by reducing position (avg_entry_price preserved on order via requested_amount field)
        db.upsertPosition(agentId, outcomeId, position.shares - shares, position.avg_entry_price);
      }

      // For sell limits, store original avg_entry_price so we can compute correct P&L on fill
      const entryPrice = side === 'sell'
        ? (db.getPosition(agentId, outcomeId)?.avg_entry_price ?? 0)
        : undefined;

      const orderId = db.insertOrder({
        agent_id: agentId, outcome_id: outcomeId, side, order_type: 'limit',
        requested_shares: shares, limit_price: price,
        escrowed_entry_price: entryPrice,
        status: 'pending',
      });

      return JSON.stringify({ order_id: orderId, status: 'pending', outcome_id: outcomeId, side, shares, price }, null, 2);
    }

    case 'pm_orders': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string | undefined;
      const orders = db.getPendingOrders(agentId, outcomeId);
      return JSON.stringify(orders.map(o => ({
        order_id: o.order_id, outcome_id: o.outcome_id, side: o.side,
        shares: o.requested_shares, filled_shares: o.filled_shares,
        remaining_shares: (o.requested_shares ?? 0) - o.filled_shares,
        price: o.limit_price, status: o.status, created_at: o.created_at,
      })), null, 2);
    }

    case 'pm_cancel_order': {
      const agentId = args.agent_id as string;
      const orderId = args.order_id as number;
      const order = db.cancelOrder(orderId, agentId);
      if (!order) throw new Error(`Order ${orderId} not found or not cancellable`);

      // Release escrow
      let releasedAmount = 0;
      const remainingShares = (order.requested_shares ?? 0) - order.filled_shares;
      if (order.side === 'buy' && order.limit_price) {
        releasedAmount = remainingShares * order.limit_price;
        db.updateCash(agentId, releasedAmount);
      } else if (order.side === 'sell') {
        // Return escrowed shares to position, using stored entry price
        const pos = db.getPosition(agentId, order.outcome_id);
        const currentShares = pos?.shares ?? 0;
        const entryPrice = order.escrowed_entry_price ?? pos?.avg_entry_price ?? 0;
        db.upsertPosition(agentId, order.outcome_id, currentShares + remainingShares, entryPrice);
      }

      return JSON.stringify({ order_id: orderId, status: 'cancelled', released_amount: releasedAmount }, null, 2);
    }

    case 'pm_cancel_all': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string | undefined;

      return db.transaction(() => {
        const orders = db.getPendingOrders(agentId, outcomeId);
        let totalReleasedCash = 0;
        let totalReleasedShares = 0;

        for (const order of orders) {
          const remaining = (order.requested_shares ?? 0) - order.filled_shares;
          if (order.side === 'buy' && order.limit_price) {
            const released = remaining * order.limit_price;
            totalReleasedCash += released;
            db.updateCash(agentId, released);
          } else if (order.side === 'sell') {
            totalReleasedShares += remaining;
            const pos = db.getPosition(agentId, order.outcome_id);
            const entryPrice = order.escrowed_entry_price ?? pos?.avg_entry_price ?? 0;
            db.upsertPosition(agentId, order.outcome_id, (pos?.shares ?? 0) + remaining, entryPrice);
          }
        }

        const count = db.cancelAllOrders(agentId, outcomeId);
        return JSON.stringify({ cancelled_count: count, total_released_cash: totalReleasedCash, total_released_shares: totalReleasedShares }, null, 2);
      });
    }

    // ---- Portfolio & Results ----
    case 'pm_positions': {
      const agentId = args.agent_id as string;
      const positions = db.getPositions(agentId);
      // Mark to market with latest prices
      for (const pos of positions) {
        try {
          const mid = await api.getMidpointPrice(pos.outcome_id);
          db.updatePositionPrice(agentId, pos.outcome_id, mid);
        } catch { /* use cached price */ }
      }
      const updated = db.getPositions(agentId);
      const enriched = updated.map(pos => {
        const outcomeRow = db.getOutcomeById(pos.outcome_id);
        const marketRow = db.getMarketByOutcomeId(pos.outcome_id);
        return {
          outcome_id: pos.outcome_id,
          market_question: marketRow?.question ?? 'Unknown',
          outcome_name: outcomeRow?.name ?? 'Unknown',
          shares: pos.shares,
          avg_entry_price: pos.avg_entry_price, current_price: pos.current_price,
          unrealized_pnl: pos.unrealized_pnl,
          unrealized_pnl_pct: pos.avg_entry_price > 0
            ? ((pos.current_price ?? pos.avg_entry_price) - pos.avg_entry_price) / pos.avg_entry_price * 100
            : 0,
        };
      });
      return JSON.stringify(enriched, null, 2);
    }

    case 'pm_balance': {
      const agentId = args.agent_id as string;
      const agent = db.getOrCreateAgent(agentId);
      const positions = db.getPositions(agentId);
      const positionsValue = positions.reduce((sum, p) => sum + p.shares * (p.current_price ?? p.avg_entry_price), 0);
      const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
      const totalRealized = db.getTotalRealizedPnl(agentId);
      const numClosedTrades = db.getTradeCount(agentId);

      return JSON.stringify({
        agent_id: agentId, cash: agent.current_cash,
        positions_value: positionsValue,
        total_portfolio_value: agent.current_cash + positionsValue,
        total_realized_pnl: totalRealized, total_unrealized_pnl: totalUnrealized,
        num_open_positions: positions.length, num_closed_trades: numClosedTrades,
      }, null, 2);
    }

    case 'pm_history': {
      const agentId = args.agent_id as string;
      const limit = (args.limit as number) ?? 50;
      const history = db.getTradeHistory(agentId, limit);
      return JSON.stringify(history, null, 2);
    }

    case 'pm_leaderboard': {
      const rows = db.getLeaderboard();
      const leaderboard = rows.map(r => {
        const totalReturn = r.realized_pnl + r.unrealized_pnl;
        const history = db.getTradeHistory(r.agent_id, 10000);
        const pnls = history.map(t => t.realized_pnl);
        const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
        const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
        return {
          agent_id: r.agent_id,
          total_return_pct: r.initial_balance > 0 ? (totalReturn / r.initial_balance) * 100 : 0,
          realized_pnl: r.realized_pnl, unrealized_pnl: r.unrealized_pnl,
          win_rate: r.num_trades > 0 ? (r.wins / r.num_trades) * 100 : 0,
          num_trades: r.num_trades, best_trade_pnl: bestTrade, worst_trade_pnl: worstTrade,
        };
      });
      leaderboard.sort((a, b) => b.total_return_pct - a.total_return_pct);
      return JSON.stringify(leaderboard, null, 2);
    }

    case 'pm_check_resolution': {
      const marketId = args.market_id as string;
      const market = await api.getMarketDetail(marketId);
      if (!market.closed) {
        return JSON.stringify({ market_id: marketId, resolved: false });
      }
      // Market is closed/resolved — settle positions
      const outcomeNames = JSON.parse(market.outcomes ?? '[]') as string[];
      const outcomePrices = JSON.parse(market.outcomePrices ?? '[]') as string[];
      const tokenIds = JSON.parse(market.clobTokenIds ?? '[]') as string[];
      let positionsSettled = 0;
      const outcomeResults: Array<{ outcome_id: string; resolved_value: number }> = [];

      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        const resolvedValue = parseFloat(outcomePrices[i]) >= 0.99 ? 1 : 0;
        outcomeResults.push({ outcome_id: tokenId, resolved_value: resolvedValue });

        if (db.getResolution(tokenId)) continue; // already resolved
        db.insertResolution(tokenId, resolvedValue);

        // Cancel pending limit orders, release escrow
        const pendingOrders = db.getPendingOrders(undefined, tokenId);
        for (const order of pendingOrders) {
          db.cancelOrder(order.order_id, order.agent_id);
          const remaining = (order.requested_shares ?? 0) - order.filled_shares;
          if (order.side === 'buy' && order.limit_price) {
            db.updateCash(order.agent_id, remaining * order.limit_price);
          }
        }

        // Settle all positions
        const positions = db.getPositionsForOutcome(tokenId);
        for (const pos of positions) {
          db.transaction(() => {
            const payout = pos.shares * resolvedValue;
            db.updateCash(pos.agent_id, payout);
            const outcome = db.getOutcomeById(tokenId);
            db.recordTrade({
              agent_id: pos.agent_id, outcome_id: tokenId,
              market_question: market.question ?? 'Unknown',
              outcome_name: outcome?.name ?? outcomeNames[i] ?? 'Unknown',
              entry_price: pos.avg_entry_price, exit_price: resolvedValue,
              shares: pos.shares,
              realized_pnl: (resolvedValue - pos.avg_entry_price) * pos.shares,
              reason: resolvedValue === 1 ? 'resolved_win' : 'resolved_loss',
              opened_at: pos.updated_at,
            });
            db.upsertPosition(pos.agent_id, tokenId, 0, 0);
            positionsSettled++;
          });
        }
      }

      return JSON.stringify({
        market_id: marketId, resolved: true,
        outcome_results: outcomeResults, positions_settled: positionsSettled,
      }, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd polymarket-mcp && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "feat(polymarket-mcp): add 15 MCP tool definitions and handlers"
```

---

### Task 6: Tool Handler Tests

**Files:**
- Create: `polymarket-mcp/src/tools.test.ts`

- [ ] **Step 1: Write tool handler tests**

Create `polymarket-mcp/src/tools.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleTool } from './tools.js';
import { PolymarketDB } from './db.js';
import { PolymarketAPI } from './polymarket-api.js';
import fs from 'fs';
import path from 'path';

const TEST_DIR = path.join(import.meta.dirname, '..', '.test-data-tools');
let db: PolymarketDB;
let api: PolymarketAPI;

// Mock the API
vi.mock('./polymarket-api.js', () => {
  return {
    PolymarketAPI: vi.fn().mockImplementation(() => ({
      listMarkets: vi.fn().mockResolvedValue([]),
      searchMarkets: vi.fn().mockResolvedValue({ events: [] }),
      getMarketDetail: vi.fn().mockResolvedValue({
        id: 'mkt-1', question: 'Will X?', category: 'politics',
        description: 'Test', resolutionSource: null, volumeNum: 50000,
        endDate: '2026-04-01', active: true, closed: false,
        outcomes: '["Yes","No"]', outcomePrices: '[0.6,0.4]',
        clobTokenIds: '["token-yes","token-no"]',
      }),
      getOrderBook: vi.fn().mockResolvedValue({
        asset_id: 'token-yes',
        bids: [{ price: 0.55, size: 500 }, { price: 0.50, size: 1000 }],
        asks: [{ price: 0.60, size: 500 }, { price: 0.65, size: 1000 }],
        spread: 0.05, mid_price: 0.575, timestamp: '123',
      }),
      getPriceHistory: vi.fn().mockResolvedValue([{ t: 1000, p: 0.5 }]),
      getMidpointPrice: vi.fn().mockResolvedValue(0.575),
    })),
  };
});

beforeEach(() => {
  if (fs.existsSync(path.join(TEST_DIR, 'polymarket.db'))) {
    fs.unlinkSync(path.join(TEST_DIR, 'polymarket.db'));
  }
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  db = new PolymarketDB(TEST_DIR);
  api = new PolymarketAPI();
});

afterEach(() => {
  db.close();
  if (fs.existsSync(path.join(TEST_DIR, 'polymarket.db'))) {
    fs.unlinkSync(path.join(TEST_DIR, 'polymarket.db'));
  }
});

describe('pm_buy', () => {
  it('buys shares and updates position', async () => {
    const result = await handleTool('pm_buy', {
      agent_id: 'agent-1', outcome_id: 'token-yes', amount: 60,
    }, db, api);
    const parsed = JSON.parse(result);
    expect(parsed.side).toBe('buy');
    expect(parsed.shares_acquired).toBe(100); // $60 / $0.60 = 100 shares
    expect(parsed.avg_fill_price).toBe(0.60);
    expect(parsed.new_cash_balance).toBe(9940);
  });

  it('rejects buy with no amount or shares', async () => {
    await expect(
      handleTool('pm_buy', { agent_id: 'agent-1', outcome_id: 'token-yes' }, db, api)
    ).rejects.toThrow('Must specify');
  });
});

describe('pm_sell', () => {
  it('sells shares and records P&L', async () => {
    // First buy
    await handleTool('pm_buy', {
      agent_id: 'agent-1', outcome_id: 'token-yes', amount: 60,
    }, db, api);
    // Then sell
    const result = await handleTool('pm_sell', {
      agent_id: 'agent-1', outcome_id: 'token-yes', shares: 50,
    }, db, api);
    const parsed = JSON.parse(result);
    expect(parsed.side).toBe('sell');
    expect(parsed.filled_shares).toBe(50);
    expect(parsed.realized_pnl).toBeCloseTo(-2.5); // bought at 0.60, sold at 0.55
  });

  it('rejects selling more than held', async () => {
    await handleTool('pm_buy', {
      agent_id: 'agent-1', outcome_id: 'token-yes', amount: 60,
    }, db, api);
    await expect(
      handleTool('pm_sell', { agent_id: 'agent-1', outcome_id: 'token-yes', shares: 200 }, db, api)
    ).rejects.toThrow('Cannot sell');
  });
});

describe('pm_limit_order', () => {
  it('places a buy limit order and escrows cash', async () => {
    const result = await handleTool('pm_limit_order', {
      agent_id: 'agent-1', outcome_id: 'token-yes', side: 'buy', shares: 100, price: 0.50,
    }, db, api);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('pending');
    // Check cash was escrowed
    const agent = db.getOrCreateAgent('agent-1');
    expect(agent.current_cash).toBe(9950); // 10000 - (100 * 0.50)
  });
});

describe('pm_cancel_order', () => {
  it('cancels and releases escrowed cash', async () => {
    const orderResult = await handleTool('pm_limit_order', {
      agent_id: 'agent-1', outcome_id: 'token-yes', side: 'buy', shares: 100, price: 0.50,
    }, db, api);
    const { order_id } = JSON.parse(orderResult);

    const cancelResult = await handleTool('pm_cancel_order', {
      agent_id: 'agent-1', order_id,
    }, db, api);
    const parsed = JSON.parse(cancelResult);
    expect(parsed.status).toBe('cancelled');
    expect(parsed.released_amount).toBe(50); // 100 * 0.50

    const agent = db.getOrCreateAgent('agent-1');
    expect(agent.current_cash).toBe(10000); // fully restored
  });
});

describe('pm_balance', () => {
  it('returns correct portfolio summary', async () => {
    const result = await handleTool('pm_balance', { agent_id: 'agent-1' }, db, api);
    const parsed = JSON.parse(result);
    expect(parsed.cash).toBe(10000);
    expect(parsed.total_portfolio_value).toBe(10000);
  });
});

describe('pm_leaderboard', () => {
  it('returns leaderboard for all agents', async () => {
    db.getOrCreateAgent('agent-1');
    db.getOrCreateAgent('agent-2');
    const result = await handleTool('pm_leaderboard', {}, db, api);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
  });
});

describe('pm_history', () => {
  it('returns empty history for new agent', async () => {
    db.getOrCreateAgent('agent-1');
    const result = await handleTool('pm_history', { agent_id: 'agent-1' }, db, api);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd polymarket-mcp && npx vitest run src/tools.test.ts
```
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "test(polymarket-mcp): add tool handler tests"
```

---

## Chunk 4: Background Loops & Server Entry Point

### Task 7: Background Loops

**Files:**
- Create: `polymarket-mcp/src/background.ts`
- Create: `polymarket-mcp/src/background.test.ts`

- [ ] **Step 1: Write failing test for limit order checker**

Create `polymarket-mcp/src/background.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkLimitOrders, checkResolutions } from './background.js';
import { PolymarketDB } from './db.js';
import type { PolymarketAPI } from './polymarket-api.js';
import fs from 'fs';
import path from 'path';

const TEST_DIR = path.join(import.meta.dirname, '..', '.test-data-bg');
let db: PolymarketDB;

beforeEach(() => {
  const dbPath = path.join(TEST_DIR, 'polymarket.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  db = new PolymarketDB(TEST_DIR);
});

afterEach(() => {
  db.close();
  const dbPath = path.join(TEST_DIR, 'polymarket.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('checkLimitOrders', () => {
  it('fills a buy limit order when ask crosses price', async () => {
    db.getOrCreateAgent('agent-1');
    db.updateCash('agent-1', -50); // escrow $50 for 100 shares at 0.50
    db.insertOrder({
      agent_id: 'agent-1', outcome_id: 'token-1', side: 'buy',
      order_type: 'limit', requested_shares: 100, limit_price: 0.50,
      status: 'pending',
    });

    const mockApi = {
      getOrderBook: vi.fn().mockResolvedValue({
        asset_id: 'token-1',
        bids: [{ price: 0.45, size: 500 }],
        asks: [{ price: 0.48, size: 200 }], // ask is below limit price of 0.50
        spread: 0.03, mid_price: 0.465, timestamp: '123',
      }),
    } as unknown as PolymarketAPI;

    await checkLimitOrders(db, mockApi);

    const pending = db.getPendingOrders('agent-1');
    expect(pending).toHaveLength(0); // order should be filled

    const pos = db.getPosition('agent-1', 'token-1');
    expect(pos).toBeDefined();
    expect(pos!.shares).toBe(100);
  });

  it('skips order when market has not crossed limit', async () => {
    db.getOrCreateAgent('agent-1');
    db.updateCash('agent-1', -50);
    db.insertOrder({
      agent_id: 'agent-1', outcome_id: 'token-1', side: 'buy',
      order_type: 'limit', requested_shares: 100, limit_price: 0.50,
      status: 'pending',
    });

    const mockApi = {
      getOrderBook: vi.fn().mockResolvedValue({
        asset_id: 'token-1',
        bids: [{ price: 0.50, size: 500 }],
        asks: [{ price: 0.55, size: 200 }], // ask is ABOVE limit price
        spread: 0.05, mid_price: 0.525, timestamp: '123',
      }),
    } as unknown as PolymarketAPI;

    await checkLimitOrders(db, mockApi);
    expect(db.getPendingOrders('agent-1')).toHaveLength(1); // still pending
  });
});

describe('checkResolutions', () => {
  it('settles winning positions on resolved market', async () => {
    db.getOrCreateAgent('agent-1');
    db.upsertMarket({
      market_id: 'mkt-1', question: 'Will X?', category: null,
      description: null, resolution_source: null, volume: null,
      end_date: null, active: 0, raw_json: null,
    });
    db.upsertOutcome({ outcome_id: 'token-yes', market_id: 'mkt-1', name: 'Yes', current_price: 1.0 });
    db.upsertPosition('agent-1', 'token-yes', 100, 0.60);
    db.updateCash('agent-1', -60); // simulate having spent $60

    const mockApi = {
      getMarketDetail: vi.fn().mockResolvedValue({
        id: 'mkt-1', question: 'Will X?', closed: true,
        outcomes: '["Yes","No"]', outcomePrices: '[1.0,0.0]',
        clobTokenIds: '["token-yes","token-no"]',
      }),
    } as unknown as PolymarketAPI;

    await checkResolutions(db, mockApi);

    // Position should be gone
    expect(db.getPosition('agent-1', 'token-yes')).toBeUndefined();
    // Cash should be credited (100 shares * $1.00 = $100)
    const agent = db.getOrCreateAgent('agent-1');
    expect(agent.current_cash).toBe(10040); // 9940 + 100
    // Trade history should record the win
    const history = db.getTradeHistory('agent-1');
    expect(history).toHaveLength(1);
    expect(history[0].reason).toBe('resolved_win');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd polymarket-mcp && npx vitest run src/background.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement background.ts**

Create `polymarket-mcp/src/background.ts`:
```typescript
import type { PolymarketDB } from './db.js';
import type { PolymarketAPI } from './polymarket-api.js';
import { simulateBuy, simulateSell } from './order-engine.js';

/**
 * Check all pending limit orders against current market prices.
 * Called every 60 seconds by the background loop.
 */
export async function checkLimitOrders(db: PolymarketDB, api: PolymarketAPI): Promise<number> {
  const pending = db.getPendingOrders();
  let filled = 0;

  // Group by outcome to avoid duplicate API calls
  const byOutcome = new Map<string, typeof pending>();
  for (const order of pending) {
    const list = byOutcome.get(order.outcome_id) ?? [];
    list.push(order);
    byOutcome.set(order.outcome_id, list);
  }

  for (const [outcomeId, orders] of byOutcome) {
    let book;
    try {
      book = await api.getOrderBook(outcomeId);
    } catch {
      continue; // skip if API fails
    }

    for (const order of orders) {
      const limitPrice = order.limit_price!;
      const requestedShares = order.requested_shares ?? 0;
      const remainingShares = requestedShares - order.filled_shares;

      if (order.side === 'buy') {
        // Buy limit: fill when best ask <= limit price
        if (book.asks.length === 0 || book.asks[0].price > limitPrice) continue;

        // Fill at limit price or better
        const fill = simulateBuy(
          book.asks.filter(a => a.price <= limitPrice),
          { shares: remainingShares },
        );
        if (fill.filled_shares === 0) continue;

        db.transaction(() => {
          // Cash was already escrowed, refund overpayment
          const escrowed = remainingShares * limitPrice;
          const actualCost = fill.filled_amount;
          if (actualCost < escrowed) {
            db.updateCash(order.agent_id, escrowed - actualCost);
          }

          const existing = db.getPosition(order.agent_id, outcomeId);
          const totalShares = (existing?.shares ?? 0) + fill.filled_shares;
          const totalCost = (existing ? existing.avg_entry_price * existing.shares : 0) + fill.filled_amount;
          db.upsertPosition(order.agent_id, outcomeId, totalShares, totalCost / totalShares);

          const status = fill.filled_shares >= remainingShares ? 'filled' as const : 'partial' as const;
          db.updateOrderFill(
            order.order_id, order.filled_amount + fill.filled_amount,
            order.filled_shares + fill.filled_shares, fill.avg_fill_price, fill.slippage, status,
          );
        });
        filled++;
      } else {
        // Sell limit: fill when best bid >= limit price
        if (book.bids.length === 0 || book.bids[0].price < limitPrice) continue;

        const fill = simulateSell(
          book.bids.filter(b => b.price >= limitPrice),
          remainingShares,
        );
        if (fill.filled_shares === 0) continue;

        db.transaction(() => {
          db.updateCash(order.agent_id, fill.filled_amount);

          // Shares were already escrowed (removed from position)
          // Use escrowed_entry_price stored on the order for correct P&L
          const entryPrice = order.escrowed_entry_price ?? 0;
          const realizedPnl = (fill.avg_fill_price - entryPrice) * fill.filled_shares;
          const outcome = db.getOutcomeById(outcomeId);
          const market = db.getMarketByOutcomeId(outcomeId);
          db.recordTrade({
            agent_id: order.agent_id, outcome_id: outcomeId,
            market_question: market?.question ?? 'Unknown',
            outcome_name: outcome?.name ?? 'Unknown',
            entry_price: entryPrice,
            exit_price: fill.avg_fill_price, shares: fill.filled_shares,
            realized_pnl: realizedPnl, reason: 'sold',
            opened_at: order.created_at,
          });

          const status = fill.filled_shares >= remainingShares ? 'filled' as const : 'partial' as const;
          db.updateOrderFill(
            order.order_id, order.filled_amount + fill.filled_amount,
            order.filled_shares + fill.filled_shares, fill.avg_fill_price, fill.slippage, status,
          );
        });
        filled++;
      }
    }
  }

  return filled;
}

/**
 * Check for resolved markets and settle positions.
 * Called every 5 minutes by the background loop.
 */
export async function checkResolutions(db: PolymarketDB, api: PolymarketAPI): Promise<number> {
  const outcomeIds = db.getAllPositionedOutcomes();
  if (outcomeIds.length === 0) return 0;

  // Get unique market IDs for positioned outcomes
  const marketIds = new Set<string>();
  for (const oid of outcomeIds) {
    const market = db.getMarketByOutcomeId(oid);
    if (market) marketIds.add(market.market_id);
  }

  let settled = 0;

  for (const marketId of marketIds) {
    let detail;
    try {
      detail = await api.getMarketDetail(marketId);
    } catch {
      continue;
    }

    if (!detail.closed) continue;

    // Market resolved — parse outcomes
    const outcomeNames = JSON.parse(detail.outcomes ?? '[]') as string[];
    const outcomePrices = JSON.parse(detail.outcomePrices ?? '[]') as string[];
    const tokenIds = JSON.parse(detail.clobTokenIds ?? '[]') as string[];

    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      if (db.getResolution(tokenId)) continue; // already resolved

      const resolvedValue = parseFloat(outcomePrices[i]) >= 0.99 ? 1 : 0;
      db.insertResolution(tokenId, resolvedValue);

      // Cancel any pending limit orders for this outcome
      const pendingOrders = db.getPendingOrders(undefined, tokenId);
      for (const order of pendingOrders) {
        db.cancelOrder(order.order_id, order.agent_id);
        // Release escrow
        const remaining = (order.requested_shares ?? 0) - order.filled_shares;
        if (order.side === 'buy' && order.limit_price) {
          db.updateCash(order.agent_id, remaining * order.limit_price);
        }
        // Sell limit escrow: shares are gone (resolved), no need to return
      }

      // Settle positions
      const positions = db.getPositionsForOutcome(tokenId);
      for (const pos of positions) {
        db.transaction(() => {
          const payout = pos.shares * resolvedValue;
          db.updateCash(pos.agent_id, payout);

          const outcome = db.getOutcomeById(tokenId);
          db.recordTrade({
            agent_id: pos.agent_id, outcome_id: tokenId,
            market_question: detail.question ?? 'Unknown',
            outcome_name: outcome?.name ?? outcomeNames[i] ?? 'Unknown',
            entry_price: pos.avg_entry_price, exit_price: resolvedValue,
            shares: pos.shares,
            realized_pnl: (resolvedValue - pos.avg_entry_price) * pos.shares,
            reason: resolvedValue === 1 ? 'resolved_win' : 'resolved_loss',
            opened_at: pos.updated_at,
          });

          db.upsertPosition(pos.agent_id, tokenId, 0, 0); // deletes position
          settled++;
        });
      }
    }
  }

  return settled;
}

/**
 * Start background loops. Returns a cleanup function.
 */
export function startBackgroundLoops(db: PolymarketDB, api: PolymarketAPI): () => void {
  const limitOrderInterval = setInterval(() => {
    checkLimitOrders(db, api).catch(err => {
      console.error('[background] limit order check failed:', err);
    });
  }, 60_000);

  const resolutionInterval = setInterval(() => {
    checkResolutions(db, api).catch(err => {
      console.error('[background] resolution check failed:', err);
    });
  }, 300_000);

  return () => {
    clearInterval(limitOrderInterval);
    clearInterval(resolutionInterval);
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd polymarket-mcp && npx vitest run src/background.test.ts
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "feat(polymarket-mcp): add background loops for limit orders and resolutions"
```

---

### Task 8: MCP Server Entry Point

**Files:**
- Create: `polymarket-mcp/src/index.ts`

- [ ] **Step 1: Write index.ts**

Create `polymarket-mcp/src/index.ts`:
```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PolymarketDB } from './db.js';
import { PolymarketAPI } from './polymarket-api.js';
import { TOOL_DEFINITIONS, handleTool } from './tools.js';
import { startBackgroundLoops } from './background.js';
import path from 'path';
import os from 'os';

const dataDir = process.env.POLYMARKET_DATA_DIR ?? path.join(os.homedir(), '.polymarket-mcp');
const db = new PolymarketDB(dataDir);
const api = new PolymarketAPI();

const server = new Server(
  { name: 'polymarket-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>, db, api);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const stopBackground = startBackgroundLoops(db, api);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGINT', () => {
  stopBackground();
  db.close();
  process.exit(0);
});
```

- [ ] **Step 2: Build and verify**

```bash
cd polymarket-mcp && npm run build
```
Expected: Compiles to `dist/` with no errors.

- [ ] **Step 3: Commit**

```bash
cd polymarket-mcp && git add -A && git commit -m "feat(polymarket-mcp): add MCP server entry point with background loops"
```

---

### Task 9: Run All Tests & Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd polymarket-mcp && npx vitest run
```
Expected: All tests across db.test.ts, order-engine.test.ts, polymarket-api.test.ts, tools.test.ts, and background.test.ts pass.

- [ ] **Step 2: Full build**

```bash
cd polymarket-mcp && npm run build
```
Expected: Clean compile.

- [ ] **Step 3: Smoke test the server starts**

```bash
cd polymarket-mcp && echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5 node dist/index.js 2>/dev/null || true
```
Expected: JSON response listing 15 tools.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
cd polymarket-mcp && git add -A && git commit -m "fix(polymarket-mcp): final adjustments from integration testing"
```
