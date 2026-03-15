import type { OrderBook } from '@/lib/trading/types';

export interface Platform {
  name: string;
  getOrderBook(assetId: string): Promise<OrderBook>;
  getCurrentPrice(assetId: string): Promise<number>;
}
