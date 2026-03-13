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
