import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketAPI } from './api.js';

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
    await api.searchMarkets('election');
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
