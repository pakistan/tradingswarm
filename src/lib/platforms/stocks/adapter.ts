import type { Platform } from '../types';
import type { OrderBook, OrderBookLevel } from '@/lib/trading/types';

export class StocksPlatform implements Platform {
  name = 'stocks';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`
    );
    if (!res.ok) throw new Error(`Alpha Vantage error ${res.status}`);
    const d = await res.json() as { 'Global Quote'?: Record<string, string> };
    const price = d['Global Quote']?.['05. price'];
    if (!price) throw new Error(`No price data for ${symbol}`);
    return parseFloat(price);
  }

  // Synthetic order book — simulate depth around the current price
  // Uses a 0.1% spread and decreasing liquidity at each level
  async getOrderBook(symbol: string): Promise<OrderBook> {
    const price = await this.getCurrentPrice(symbol);
    const spreadPct = 0.001; // 0.1% spread
    const halfSpread = price * spreadPct / 2;

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    // Generate 10 levels on each side
    for (let i = 0; i < 10; i++) {
      const offset = halfSpread + (price * 0.0005 * i); // Each level 0.05% apart
      const size = Math.round(10000 / price) * (1 / (i + 1)); // Decreasing size
      bids.push({ price: parseFloat((price - offset).toFixed(2)), size });
      asks.push({ price: parseFloat((price + offset).toFixed(2)), size });
    }

    return {
      asset_id: symbol,
      bids,
      asks,
      spread: halfSpread * 2,
      mid_price: price,
      timestamp: new Date().toISOString(),
    };
  }
}
