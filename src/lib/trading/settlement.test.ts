import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from '@/lib/db/schema.js';
import { createAgent } from '@/lib/db/agents.js';
import {
  upsertMarket,
  upsertOutcome,
  upsertPosition,
  insertOrder,
  getResolution,
  getPendingOrders,
  getPositionsForOutcome,
  getTradeHistory,
} from '@/lib/db/trades.js';
import { settleMarket } from './settlement.js';
import type { GammaMarket } from '@/lib/platforms/polymarket/types.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-settle-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

function makeGammaMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'mkt-1',
    question: 'Will X happen?',
    category: 'politics',
    description: null,
    resolutionSource: null,
    volume: null,
    volumeNum: null,
    endDate: null,
    active: false,
    closed: true,
    outcomes: '["Yes","No"]',
    outcomePrices: '["1","0"]',
    clobTokenIds: '["token-yes","token-no"]',
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
    oneDayPriceChange: null,
    acceptingOrders: false,
    ...overrides,
  };
}

describe('settleMarket', () => {
  it('records resolutions for each outcome token', () => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 0 });
    upsertOutcome(db, { outcome_id: 'token-yes', market_id: 'mkt-1', name: 'Yes', current_price: 1 });
    upsertOutcome(db, { outcome_id: 'token-no', market_id: 'mkt-1', name: 'No', current_price: 0 });

    const result = settleMarket(db, makeGammaMarket());

    expect(result.outcome_results).toHaveLength(2);
    expect(result.outcome_results[0]).toEqual({ outcome_id: 'token-yes', resolved_value: 1 });
    expect(result.outcome_results[1]).toEqual({ outcome_id: 'token-no', resolved_value: 0 });

    expect(getResolution(db, 'token-yes')?.resolved_value).toBe(1);
    expect(getResolution(db, 'token-no')?.resolved_value).toBe(0);
  });

  it('skips already resolved outcomes', () => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 0 });

    // First settlement
    settleMarket(db, makeGammaMarket());
    // Second settlement should be idempotent
    const result = settleMarket(db, makeGammaMarket());

    expect(result.positions_settled).toBe(0);
    // Resolution should still exist from first call
    expect(getResolution(db, 'token-yes')).toBeDefined();
  });

  it('pays out winning position and records trade history', () => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 0 });
    upsertOutcome(db, { outcome_id: 'token-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.9 });
    upsertOutcome(db, { outcome_id: 'token-no', market_id: 'mkt-1', name: 'No', current_price: 0.1 });

    const agent = createAgent(db, 'agent-1', 'Trader A');
    // Give the agent some initial cash via a direct SQL update since createAgent uses default balance
    db.prepare(`UPDATE agents SET current_cash = 1000 WHERE agent_id = ?`).run('agent-1');

    upsertPosition(db, 'agent-1', 'token-yes', 100, 0.6);

    const result = settleMarket(db, makeGammaMarket());

    expect(result.positions_settled).toBe(1);

    // Payout: 100 shares * 1.0 = $100 added to cash
    const agentRow = db.prepare(`SELECT current_cash FROM agents WHERE agent_id = ?`).get('agent-1') as { current_cash: number };
    expect(agentRow.current_cash).toBeCloseTo(1100); // 1000 + 100

    // Position should be cleared
    const positions = getPositionsForOutcome(db, 'token-yes');
    expect(positions).toHaveLength(0);

    // Trade history should have an entry
    const trades = getTradeHistory(db, 'agent-1');
    expect(trades).toHaveLength(1);
    expect(trades[0].reason).toBe('resolved_win');
    expect(trades[0].realized_pnl).toBeCloseTo(40); // (1 - 0.6) * 100
  });

  it('records resolved_loss for losing position', () => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 0 });
    upsertOutcome(db, { outcome_id: 'token-yes', market_id: 'mkt-1', name: 'Yes', current_price: 1 });
    upsertOutcome(db, { outcome_id: 'token-no', market_id: 'mkt-1', name: 'No', current_price: 0 });

    createAgent(db, 'agent-2');
    db.prepare(`UPDATE agents SET current_cash = 1000 WHERE agent_id = ?`).run('agent-2');

    // Held "No" position — will be worth 0
    upsertPosition(db, 'agent-2', 'token-no', 50, 0.4);

    const result = settleMarket(db, makeGammaMarket());
    expect(result.positions_settled).toBe(1);

    const trades = getTradeHistory(db, 'agent-2');
    expect(trades[0].reason).toBe('resolved_loss');
    expect(trades[0].realized_pnl).toBeCloseTo(-20); // (0 - 0.4) * 50
  });

  it('cancels pending limit orders and releases escrow on buy side', () => {
    upsertMarket(db, { market_id: 'mkt-1', platform: 'polymarket', question: 'Will X happen?', active: 0 });
    upsertOutcome(db, { outcome_id: 'token-yes', market_id: 'mkt-1', name: 'Yes', current_price: 0.9 });
    upsertOutcome(db, { outcome_id: 'token-no', market_id: 'mkt-1', name: 'No', current_price: 0.1 });

    createAgent(db, 'agent-3');
    db.prepare(`UPDATE agents SET current_cash = 500 WHERE agent_id = ?`).run('agent-3');

    // Pending buy order: 10 shares at 0.5 limit = $5 escrowed
    insertOrder(db, {
      agent_id: 'agent-3',
      outcome_id: 'token-yes',
      side: 'buy',
      order_type: 'limit',
      requested_shares: 10,
      filled_shares: 0,
      limit_price: 0.5,
      status: 'pending',
    });

    settleMarket(db, makeGammaMarket());

    // Order should be cancelled
    const pending = getPendingOrders(db, 'agent-3', 'token-yes');
    expect(pending).toHaveLength(0);

    // Escrow released: 10 * 0.5 = $5 returned
    const agentRow = db.prepare(`SELECT current_cash FROM agents WHERE agent_id = ?`).get('agent-3') as { current_cash: number };
    expect(agentRow.current_cash).toBeCloseTo(505);
  });

  it('returns empty results when no token ids present', () => {
    const result = settleMarket(db, makeGammaMarket({ clobTokenIds: '[]' }));
    expect(result.outcome_results).toHaveLength(0);
    expect(result.positions_settled).toBe(0);
  });
});
