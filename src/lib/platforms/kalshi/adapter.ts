import type { Platform } from '../types';
import type { OrderBook, OrderBookLevel } from '@/lib/trading/types';
import { KalshiAPI } from './api';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

export class KalshiPlatform implements Platform {
  name = 'kalshi';
  private api = new KalshiAPI();

  async getOrderBook(tickerWithSide: string): Promise<OrderBook> {
    // Support "TICKER:no" suffix for NO side order book
    const [ticker, sideStr] = tickerWithSide.split(':');
    const side: 'yes' | 'no' = sideStr === 'no' ? 'no' : 'yes';
    const res = await fetch(`${KALSHI_BASE}/markets/${ticker}/orderbook`);
    if (!res.ok) throw new Error(`Kalshi orderbook error ${res.status}`);
    const d = await res.json() as {
      orderbook_fp: { yes_dollars: Array<[string, string]>; no_dollars: Array<[string, string]> }
    };

    const ob = d.orderbook_fp;

    let bids: OrderBookLevel[];
    let asks: OrderBookLevel[];

    if (side === 'yes') {
      // Standard: YES bids, NO bids become YES asks
      bids = (ob.yes_dollars ?? []).map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) })).sort((a, b) => b.price - a.price);
      asks = (ob.no_dollars ?? []).map(([p, s]) => ({ price: 1 - parseFloat(p), size: parseFloat(s) })).sort((a, b) => a.price - b.price);
    } else {
      // Flipped: NO bids, YES bids become NO asks
      bids = (ob.no_dollars ?? []).map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) })).sort((a, b) => b.price - a.price);
      asks = (ob.yes_dollars ?? []).map(([p, s]) => ({ price: 1 - parseFloat(p), size: parseFloat(s) })).sort((a, b) => a.price - b.price);
    }

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;

    return {
      asset_id: `${ticker}:${side}`,
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
