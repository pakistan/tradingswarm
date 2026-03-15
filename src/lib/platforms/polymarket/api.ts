import type { OrderBook, OrderBookLevel } from '@/lib/trading/types.js';
import type { GammaMarket, PricePoint } from './types.js';

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
      const res = await fetch(url, init ?? {});
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

    const bids: OrderBookLevel[] = raw.bids
      .map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .sort((a, b) => b.price - a.price); // highest bid first
    const asks: OrderBookLevel[] = raw.asks
      .map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .sort((a, b) => a.price - b.price); // lowest ask first

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
