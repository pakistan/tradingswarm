import type { Platform } from '../types';
import type { OrderBook, OrderBookLevel } from '@/lib/trading/types';
import { KalshiAPI } from './api';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

export class KalshiPlatform implements Platform {
  name = 'kalshi';
  private api = new KalshiAPI();

  async getOrderBook(ticker: string): Promise<OrderBook> {
    const res = await fetch(`${KALSHI_BASE}/markets/${ticker}/orderbook`);
    if (!res.ok) throw new Error(`Kalshi orderbook error ${res.status}`);
    const d = await res.json() as {
      orderbook_fp: { yes_dollars: Array<[string, string]>; no_dollars: Array<[string, string]> }
    };

    const ob = d.orderbook_fp;

    // Yes bids = people wanting to buy YES
    // No bids at price X = equivalent to YES asks at price (1 - X)
    const bids: OrderBookLevel[] = (ob.yes_dollars ?? [])
      .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
      .sort((a, b) => b.price - a.price);

    const asks: OrderBookLevel[] = (ob.no_dollars ?? [])
      .map(([p, s]) => ({ price: 1 - parseFloat(p), size: parseFloat(s) }))
      .sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;

    return {
      asset_id: ticker,
      bids,
      asks,
      spread: bestAsk - bestBid,
      mid_price: (bestBid + bestAsk) / 2,
      timestamp: new Date().toISOString(),
    };
  }

  async getCurrentPrice(ticker: string): Promise<number> {
    const market = await this.api.getMarket(ticker);
    return parseFloat(market.last_price_dollars ?? market.yes_ask_dollars ?? '0');
  }
}
