// Phase 1 subset — scoped for prediction markets only.
// Will be extended in Plan 2 (Agent Runner) to include tools[], capabilities[],
// and handleTool() per the full spec interface.
import type { OrderBook } from '@/lib/trading/types.js';

export interface PlatformPlugin {
  name: string;
  getMarkets(params: { limit?: number; query?: string }): Promise<unknown[]>;
  getOrderBook(outcomeId: string): Promise<OrderBook>;
  getMidpointPrice(outcomeId: string): Promise<number>;
}
