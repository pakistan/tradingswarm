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
    expect(result.filled_shares).toBeCloseTo(50);
    expect(result.filled_amount).toBeCloseTo(27.5);
    expect(result.avg_fill_price).toBeCloseTo(0.55);
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
