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
