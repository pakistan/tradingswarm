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
