# Trading Service Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all trade execution, position management, and P&L calculation behind a single `TradingService` class with a platform abstraction so agents can trade across Polymarket, Binance, and future platforms using one bankroll.

**Architecture:** A `Platform` interface defines `getOrderBook()` and `getCurrentPrice()`. Each platform (Polymarket, Binance) implements it. `TradingService` takes a platform name, looks up the adapter, executes trades, manages positions, and calculates P&L. Tool handlers become thin wrappers. Dashboard reads from `getSwarmSummary()`.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), existing Polymarket/Binance APIs

---

## File Structure

```
src/lib/platforms/types.ts          — UPDATE: Platform interface with getOrderBook, getCurrentPrice
src/lib/platforms/polymarket/adapter.ts — CREATE: Polymarket Platform implementation
src/lib/platforms/binance/adapter.ts    — CREATE: Binance Platform implementation
src/lib/trading/service.ts          — UPDATE: Rewrite with platform param, registry
src/lib/trading/types.ts            — UPDATE: Add platform field to existing types
src/lib/db/schema.ts                — UPDATE: Add platform column to orders, positions
src/lib/db/trades.ts                — UPDATE: Add platform to insertOrder, upsertPosition
src/lib/agent/tool-registry.ts      — UPDATE: Replace inline buy/sell with service calls
src/app/api/trading/summary/route.ts — CREATE: Swarm summary API endpoint
src/app/page.tsx                    — UPDATE: Dashboard uses swarm summary
```

---

## Chunk 1: Platform Interface & Adapters

### Task 1: Update Platform Interface

**Files:**
- Modify: `src/lib/platforms/types.ts`

- [ ] **Step 1: Rewrite the platform interface**

Replace the existing `PlatformPlugin` with a cleaner `Platform` interface:

```typescript
import type { OrderBook } from '@/lib/trading/types';

export interface Platform {
  name: string;
  getOrderBook(assetId: string): Promise<OrderBook>;
  getCurrentPrice(assetId: string): Promise<number>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/platforms/types.ts
git commit -m "refactor: simplify Platform interface to orderbook + price"
```

### Task 2: Create Polymarket Adapter

**Files:**
- Create: `src/lib/platforms/polymarket/adapter.ts`

- [ ] **Step 1: Create the adapter**

Wraps existing `PolymarketAPI` to implement `Platform`:

```typescript
import type { Platform } from '../types';
import type { OrderBook } from '@/lib/trading/types';
import { PolymarketAPI } from './api';

export class PolymarketPlatform implements Platform {
  name = 'polymarket';
  private api = new PolymarketAPI();

  async getOrderBook(assetId: string): Promise<OrderBook> {
    return this.api.getOrderBook(assetId);
  }

  async getCurrentPrice(assetId: string): Promise<number> {
    return this.api.getMidpointPrice(assetId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/platforms/polymarket/adapter.ts
git commit -m "feat: add Polymarket platform adapter"
```

### Task 3: Create Binance Adapter

**Files:**
- Create: `src/lib/platforms/binance/adapter.ts`

- [ ] **Step 1: Create the adapter**

Binance public API needs no auth. For paper trading crypto, we simulate an order book from the real ticker data:

```typescript
import type { Platform } from '../types';
import type { OrderBook, OrderBookLevel } from '@/lib/trading/types';

const BINANCE = 'https://data-api.binance.vision/api/v3';

export class BinancePlatform implements Platform {
  name = 'binance';

  async getOrderBook(symbol: string): Promise<OrderBook> {
    const res = await fetch(`${BINANCE}/depth?symbol=${symbol}&limit=20`);
    if (!res.ok) throw new Error(`Binance error ${res.status}`);
    const raw = await res.json() as {
      bids: Array<[string, string]>;
      asks: Array<[string, string]>;
    };
    const bids: OrderBookLevel[] = raw.bids.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }));
    const asks: OrderBookLevel[] = raw.asks.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    return {
      asset_id: symbol, bids, asks,
      spread: bestAsk - bestBid,
      mid_price: (bestBid + bestAsk) / 2,
      timestamp: new Date().toISOString(),
    };
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const res = await fetch(`${BINANCE}/ticker/price?symbol=${symbol}`);
    if (!res.ok) throw new Error(`Binance error ${res.status}`);
    const d = await res.json() as { price: string };
    return parseFloat(d.price);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/platforms/binance/adapter.ts
git commit -m "feat: add Binance platform adapter"
```

---

## Chunk 2: DB Schema Changes

### Task 4: Add platform column to orders and positions

**Files:**
- Modify: `src/lib/db/schema.ts` (migration section)
- Modify: `src/lib/db/trades.ts` (insertOrder, upsertPosition)
- Modify: `src/lib/types.ts` (OrderRow, PositionRow)

- [ ] **Step 1: Add migration for platform column**

In `schema.ts` `migrate()`, after the `config_json` migration, add:

```typescript
// Add platform column to orders if missing
const orderCols = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
if (!orderCols.find(c => c.name === 'platform')) {
  db.exec("ALTER TABLE orders ADD COLUMN platform TEXT NOT NULL DEFAULT 'polymarket'");
}
// Add platform column to positions if missing
const posCols = db.prepare("PRAGMA table_info(positions)").all() as { name: string }[];
if (!posCols.find(c => c.name === 'platform')) {
  db.exec("ALTER TABLE positions ADD COLUMN platform TEXT NOT NULL DEFAULT 'polymarket'");
}
```

- [ ] **Step 2: Update types**

Add `platform: string` to `OrderRow` and `PositionRow` in `src/lib/types.ts`.

- [ ] **Step 3: Update insertOrder**

Add `platform` field to the insert params and SQL in `src/lib/db/trades.ts:insertOrder()`.

- [ ] **Step 4: Update upsertPosition**

Add `platform` parameter to `upsertPosition()`. The primary key is already `(agent_id, outcome_id)` — this should become `(agent_id, outcome_id, platform)` but for simplicity, since outcome IDs are unique per platform, keep existing PK and just store the platform field.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/trades.ts src/lib/types.ts
git commit -m "feat: add platform column to orders and positions"
```

---

## Chunk 3: Trading Service

### Task 5: Rewrite TradingService with platform registry

**Files:**
- Modify: `src/lib/trading/service.ts`

- [ ] **Step 1: Rewrite service with platform param**

Key changes from current service.ts:
- Constructor takes `db` and registers platform adapters
- `buy()` and `sell()` take `platform: string` as first arg
- Looks up the right adapter from registry
- All trade logic (validation, fill sim, position update, cash, order recording, trade-results post) stays in the service
- `getPortfolio()` marks positions to market using the right platform adapter
- `getSwarmSummary()` aggregates across all agents

The platform registry:
```typescript
private platforms = new Map<string, Platform>();

registerPlatform(platform: Platform) {
  this.platforms.set(platform.name, platform);
}

private getPlatform(name: string): Platform {
  const p = this.platforms.get(name);
  if (!p) throw new Error(`Unknown platform: ${name}`);
  return p;
}
```

Buy signature changes from:
```typescript
async buy(agentId, outcomeId, amount, context?)
```
to:
```typescript
async buy(platform: string, agentId: string, assetId: string, amount: number, context?: string)
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/trading/service.ts
git commit -m "refactor: trading service with platform registry"
```

---

## Chunk 4: Wire Tool Handlers

### Task 6: Replace inline trade logic in tool-registry with service calls

**Files:**
- Modify: `src/lib/agent/tool-registry.ts`

- [ ] **Step 1: Create trading service in buildToolRegistry**

At the top of `buildToolRegistry()`, create and configure the service:

```typescript
const tradingService = new TradingService(db);
tradingService.registerPlatform(new PolymarketPlatform());
tradingService.registerPlatform(new BinancePlatform());
```

- [ ] **Step 2: Replace pm_buy handler**

Replace the ~80 lines of inline buy logic with:

```typescript
pm_buy: async (args) => {
  const result = await tradingService.buy(
    'polymarket', agentId, String(args.outcome_id),
    Number(args.amount), args.agent_context ? String(args.agent_context) : undefined
  );
  return JSON.stringify(result);
},
```

- [ ] **Step 3: Replace pm_sell handler**

Replace the ~70 lines of inline sell logic with:

```typescript
pm_sell: async (args) => {
  const result = await tradingService.sell(
    'polymarket', agentId, String(args.outcome_id),
    Number(args.shares), args.agent_context ? String(args.agent_context) : undefined
  );
  return JSON.stringify(result);
},
```

- [ ] **Step 4: Replace pm_balance and pm_positions**

Use `tradingService.getPortfolio()` for both:

```typescript
pm_balance: async () => {
  const p = await tradingService.getPortfolio(agentId);
  return JSON.stringify({
    cash: p.cash, initial_balance: p.initial_balance,
    positions_count: p.positions.length,
    realized_pnl: p.realized_pnl, unrealized_pnl: p.unrealized_pnl,
    total_portfolio_value: p.total_portfolio_value,
  });
},
pm_positions: async () => {
  const p = await tradingService.getPortfolio(agentId);
  return JSON.stringify(p.positions);
},
```

- [ ] **Step 5: Remove unused imports**

Remove `simulateBuy`, `simulateSell`, and direct `agents`/`snapshots`/`channels` imports that are now handled by the service.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/tool-registry.ts
git commit -m "refactor: tool handlers use TradingService instead of inline logic"
```

---

## Chunk 5: API Endpoint & Dashboard

### Task 7: Add trading summary API endpoint

**Files:**
- Create: `src/app/api/trading/summary/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { TradingService } from '@/lib/trading/service';
import { PolymarketPlatform } from '@/lib/platforms/polymarket/adapter';
import { BinancePlatform } from '@/lib/platforms/binance/adapter';

export async function GET() {
  const db = getDb();
  const service = new TradingService(db);
  service.registerPlatform(new PolymarketPlatform());
  service.registerPlatform(new BinancePlatform());
  const summary = service.getSwarmSummary();
  return NextResponse.json(summary);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/trading/summary/route.ts
git commit -m "feat: add /api/trading/summary endpoint"
```

### Task 8: Update dashboard to use swarm summary

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace raw SQL with TradingService**

At the top of `DashboardPage()`, create the service and get swarm summary:

```typescript
const service = new TradingService(db);
service.registerPlatform(new PolymarketPlatform());
service.registerPlatform(new BinancePlatform());
const swarm = service.getSwarmSummary();
```

- [ ] **Step 2: Add swarm P&L banner at top**

Above the stats bar, add a hero section showing:
- Total AUM (assets under management)
- Total P&L (realized + unrealized) with color
- Total return %
- Number of open positions across all platforms

- [ ] **Step 3: Replace inline positions/orders SQL**

Replace the raw SQL for open positions and recent orders with data from `swarm.portfolios`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: dashboard uses TradingService swarm summary"
```

---

## Summary

| Chunk | Tasks | What it does |
|-------|-------|-------------|
| 1 | 1-3 | Platform interface + Polymarket & Binance adapters |
| 2 | 4 | DB schema: platform column on orders/positions |
| 3 | 5 | TradingService rewrite with platform registry |
| 4 | 6 | Tool handlers become thin wrappers |
| 5 | 7-8 | API endpoint + dashboard integration |

Total: 8 tasks. Each builds on the previous. After chunk 4, agents can trade across platforms. Chunk 5 is the UI.
