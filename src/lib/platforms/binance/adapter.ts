import type { Platform } from '../types';
import type { OrderBook, OrderBookLevel } from '@/lib/trading/types';

const BINANCE = 'https://data-api.binance.vision/api/v3';

export class BinancePlatform implements Platform {
  name = 'binance';

  async getOrderBook(symbol: string): Promise<OrderBook> {
    const res = await fetch(`${BINANCE}/depth?symbol=${symbol}&limit=20`);
    if (!res.ok) throw new Error(`Binance error ${res.status}`);
    const raw = await res.json() as { bids: Array<[string, string]>; asks: Array<[string, string]> };
    const bids: OrderBookLevel[] = raw.bids.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }));
    const asks: OrderBookLevel[] = raw.asks.map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    return { asset_id: symbol, bids, asks, spread: bestAsk - bestBid, mid_price: (bestBid + bestAsk) / 2, timestamp: new Date().toISOString() };
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const res = await fetch(`${BINANCE}/ticker/price?symbol=${symbol}`);
    if (!res.ok) throw new Error(`Binance error ${res.status}`);
    const d = await res.json() as { price: string };
    return parseFloat(d.price);
  }
}
