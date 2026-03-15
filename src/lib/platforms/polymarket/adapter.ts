import type { Platform } from '../types';
import type { OrderBook } from '@/lib/trading/types';
import { PolymarketAPI } from './api';

export class PolymarketPlatform implements Platform {
  name = 'polymarket';
  private api = new PolymarketAPI();

  async getOrderBook(assetId: string): Promise<OrderBook> {
    return this.api.getOrderBook(assetId);
  }

  async getCurrentPrice(assetId: string): Promise<number> {
    return this.api.getMidpointPrice(assetId);
  }
}
