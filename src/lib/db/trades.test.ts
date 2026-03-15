import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  upsertMarket, upsertOutcome, getMarket, getOutcomeById, getMarketByOutcomeId,
  insertOrder, getPendingOrders, updateOrderFill, cancelOrder, cancelAllOrders,
  upsertPosition, getPosition, getPositions, getPositionsForOutcome, getAllPositionedOutcomes, updatePositionPrice,
  recordTrade, getTradeHistory, getTotalRealizedPnl, getTradeCount,
  insertResolution, getResolution,
  getLeaderboard,
} from './trades';
import { createAgent } from './agents';

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

describe('markets', () => {
  it('upserts and retrieves a market', () => {
    upsertMarket(db, { market_id: 'mkt-x', platform: 'polymarket', question: 'Test?', active: 1 });
    const m = getMarket(db, 'mkt-x');
    expect(m).toBeDefined();
    expect(m!.question).toBe('Test?');
    expect(m!.platform).toBe('polymarket');
  });

  it('updates market on conflict', () => {
    upsertMarket(db, { market_id: 'mkt-x', platform: 'polymarket', question: 'Old?', active: 1 });
    upsertMarket(db, { market_id: 'mkt-x', platform: 'polymarket', question: 'New?', active: 0 });
    const m = getMarket(db, 'mkt-x')!;
    expect(m.question).toBe('New?');
    expect(m.active).toBe(0);
  });

  it('upserts outcome and retrieves by id', () => {
    upsertMarket(db, { market_id: 'mkt-2', platform: 'polymarket', question: 'Q?', active: 1 });
    upsertOutcome(db, { outcome_id: 'o-1', market_id: 'mkt-2', name: 'Yes', current_price: 0.7 });
    const o = getOutcomeById(db, 'o-1');
    expect(o).toBeDefined();
    expect(o!.current_price).toBe(0.7);
  });

  it('gets market by outcome id', () => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 1 });
    upsertOutcome(db, { outcome_id: 'out-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.6 });
    const m = getMarketByOutcomeId(db, 'out-yes');
    expect(m).toBeDefined();
    expect(m!.market_id).toBe('mkt-1');
  });

  it('returns undefined for missing market', () => {
    expect(getMarket(db, 'nonexistent')).toBeUndefined();
    expect(getOutcomeById(db, 'nonexistent')).toBeUndefined();
  });
});

describe('orders', () => {
  beforeEach(() => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 1 });
    upsertOutcome(db, { outcome_id: 'out-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.6 });
    upsertOutcome(db, { outcome_id: 'out-no', market_id: 'mkt-1', name: 'No', current_price: 0.4 });
    createAgent(db, 'agent-t1', 'Trader');
  });

  it('inserts and retrieves pending orders', () => {
    const id = insertOrder(db, {
      agent_id: 'agent-t1',
      outcome_id: 'out-yes',
      side: 'buy',
      order_type: 'limit',
      limit_price: 0.55,
      requested_amount: 100,
      status: 'pending',
    });
    expect(id).toBeGreaterThan(0);

    const orders = getPendingOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0].order_id).toBe(id);
    expect(orders[0].side).toBe('buy');
  });

  it('filters pending orders by agent', () => {
    createAgent(db, 'agent-t2');
    insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', side: 'buy', order_type: 'market', status: 'pending' });
    insertOrder(db, { agent_id: 'agent-t2', outcome_id: 'out-yes', side: 'buy', order_type: 'market', status: 'pending' });
    expect(getPendingOrders(db, 'agent-t1')).toHaveLength(1);
    expect(getPendingOrders(db, 'agent-t2')).toHaveLength(1);
  });

  it('updateOrderFill updates fill fields', () => {
    const id = insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', side: 'buy', order_type: 'limit', status: 'pending' });
    updateOrderFill(db, id, 100, 180, 0.556, 0.006, 'filled');
    const pending = getPendingOrders(db);
    expect(pending).toHaveLength(0);
  });

  it('cancelOrder cancels a pending order', () => {
    const id = insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', side: 'buy', order_type: 'limit', status: 'pending' });
    const cancelled = cancelOrder(db, id, 'agent-t1');
    expect(cancelled).toBeDefined();
    expect(getPendingOrders(db)).toHaveLength(0);
  });

  it('cancelOrder returns undefined for wrong agent', () => {
    const id = insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', side: 'buy', order_type: 'limit', status: 'pending' });
    const result = cancelOrder(db, id, 'wrong-agent');
    expect(result).toBeUndefined();
    expect(getPendingOrders(db)).toHaveLength(1);
  });

  it('cancelAllOrders cancels all for agent', () => {
    insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', side: 'buy', order_type: 'limit', status: 'pending' });
    insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-no', side: 'buy', order_type: 'limit', status: 'pending' });
    const count = cancelAllOrders(db, 'agent-t1');
    expect(count).toBe(2);
    expect(getPendingOrders(db, 'agent-t1')).toHaveLength(0);
  });

  it('cancelAllOrders by outcome_id', () => {
    insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', side: 'buy', order_type: 'limit', status: 'pending' });
    insertOrder(db, { agent_id: 'agent-t1', outcome_id: 'out-no', side: 'buy', order_type: 'limit', status: 'pending' });
    cancelAllOrders(db, 'agent-t1', 'out-yes');
    const remaining = getPendingOrders(db, 'agent-t1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].outcome_id).toBe('out-no');
  });
});

describe('positions', () => {
  beforeEach(() => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 1 });
    upsertOutcome(db, { outcome_id: 'out-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.6 });
    upsertOutcome(db, { outcome_id: 'out-no', market_id: 'mkt-1', name: 'No', current_price: 0.4 });
    createAgent(db, 'agent-t1', 'Trader');
  });

  it('creates and retrieves position', () => {
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    const pos = getPosition(db, 'agent-t1', 'out-yes');
    expect(pos).toBeDefined();
    expect(pos!.shares).toBe(100);
    expect(pos!.avg_entry_price).toBe(0.6);
  });

  it('updates existing position', () => {
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    upsertPosition(db, 'agent-t1', 'out-yes', 200, 0.55);
    const pos = getPosition(db, 'agent-t1', 'out-yes')!;
    expect(pos.shares).toBe(200);
    expect(pos.avg_entry_price).toBe(0.55);
  });

  it('deletes position when shares <= 0', () => {
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    upsertPosition(db, 'agent-t1', 'out-yes', 0, 0.6);
    expect(getPosition(db, 'agent-t1', 'out-yes')).toBeUndefined();
  });

  it('getPositions returns all positions for agent', () => {
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    upsertPosition(db, 'agent-t1', 'out-no', 50, 0.4);
    expect(getPositions(db, 'agent-t1')).toHaveLength(2);
  });

  it('getPositionsForOutcome returns positions across agents', () => {
    createAgent(db, 'agent-t2');
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    upsertPosition(db, 'agent-t2', 'out-yes', 50, 0.65);
    expect(getPositionsForOutcome(db, 'out-yes')).toHaveLength(2);
  });

  it('getAllPositionedOutcomes returns distinct outcome ids', () => {
    createAgent(db, 'agent-t2');
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    upsertPosition(db, 'agent-t2', 'out-yes', 50, 0.65);
    upsertPosition(db, 'agent-t1', 'out-no', 50, 0.4);
    const outcomes = getAllPositionedOutcomes(db);
    expect(outcomes).toHaveLength(2);
    expect(outcomes).toContain('out-yes');
    expect(outcomes).toContain('out-no');
  });

  it('updatePositionPrice sets current_price and unrealized_pnl', () => {
    upsertPosition(db, 'agent-t1', 'out-yes', 100, 0.6);
    updatePositionPrice(db, 'agent-t1', 'out-yes', 0.7);
    const pos = getPosition(db, 'agent-t1', 'out-yes')!;
    expect(pos.current_price).toBeCloseTo(0.7);
    expect(pos.unrealized_pnl).toBeCloseTo(10.0); // (0.7 - 0.6) * 100
  });
});

describe('trade history', () => {
  beforeEach(() => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 1 });
    upsertOutcome(db, { outcome_id: 'out-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.6 });
    upsertOutcome(db, { outcome_id: 'out-no', market_id: 'mkt-1', name: 'No', current_price: 0.4 });
    createAgent(db, 'agent-t1', 'Trader');
  });

  it('records and retrieves trade history', () => {
    recordTrade(db, {
      agent_id: 'agent-t1',
      outcome_id: 'out-yes',
      market_question: 'Will X happen?',
      outcome_name: 'Yes',
      entry_price: 0.5,
      exit_price: 0.75,
      shares: 100,
      realized_pnl: 25,
      reason: 'sold',
      snapshot_id: null,
      opened_at: '2024-01-01T00:00:00',
    });
    const history = getTradeHistory(db, 'agent-t1');
    expect(history).toHaveLength(1);
    expect(history[0].realized_pnl).toBe(25);
    expect(history[0].reason).toBe('sold');
  });

  it('getTotalRealizedPnl sums correctly', () => {
    recordTrade(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', market_question: 'Q', outcome_name: 'Y', entry_price: 0.5, exit_price: 0.75, shares: 100, realized_pnl: 25, reason: 'sold', snapshot_id: null, opened_at: '2024-01-01' });
    recordTrade(db, { agent_id: 'agent-t1', outcome_id: 'out-no', market_question: 'Q', outcome_name: 'N', entry_price: 0.5, exit_price: 0.1, shares: 50, realized_pnl: -20, reason: 'resolved_loss', snapshot_id: null, opened_at: '2024-01-02' });
    expect(getTotalRealizedPnl(db, 'agent-t1')).toBe(5);
  });

  it('returns 0 realized pnl for agent with no trades', () => {
    expect(getTotalRealizedPnl(db, 'agent-t1')).toBe(0);
  });

  it('getTradeCount returns correct count', () => {
    expect(getTradeCount(db, 'agent-t1')).toBe(0);
    recordTrade(db, { agent_id: 'agent-t1', outcome_id: 'out-yes', market_question: 'Q', outcome_name: 'Y', entry_price: 0.5, exit_price: 0.75, shares: 100, realized_pnl: 25, reason: 'sold', snapshot_id: null, opened_at: '2024-01-01' });
    expect(getTradeCount(db, 'agent-t1')).toBe(1);
  });
});

describe('resolutions', () => {
  it('inserts and retrieves resolution', () => {
    insertResolution(db, 'out-yes', 1.0);
    const r = getResolution(db, 'out-yes');
    expect(r).toBeDefined();
    expect(r!.resolved_value).toBe(1.0);
  });

  it('is idempotent (INSERT OR IGNORE)', () => {
    insertResolution(db, 'out-yes', 1.0);
    insertResolution(db, 'out-yes', 0.0); // ignored
    expect(getResolution(db, 'out-yes')!.resolved_value).toBe(1.0);
  });

  it('returns undefined for unresolved outcome', () => {
    expect(getResolution(db, 'out-no')).toBeUndefined();
  });
});

describe('leaderboard', () => {
  it('returns leaderboard with agents', () => {
    createAgent(db, 'lb-agent-1');
    createAgent(db, 'lb-agent-2');
    const board = getLeaderboard(db);
    expect(board.length).toBeGreaterThanOrEqual(2);
    const a1 = board.find(r => r.agent_id === 'lb-agent-1')!;
    expect(a1.current_cash).toBe(10000);
    expect(a1.num_trades).toBe(0);
  });
});
