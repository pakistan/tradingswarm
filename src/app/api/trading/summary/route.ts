import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { TradingService } from '@/lib/trading/service';
import { PolymarketPlatform } from '@/lib/platforms/polymarket/adapter';
import { BinancePlatform } from '@/lib/platforms/binance/adapter';
import { KalshiPlatform } from '@/lib/platforms/kalshi/adapter';

export async function GET() {
  const db = getDb();
  const service = new TradingService(db);
  service.registerPlatform(new PolymarketPlatform());
  service.registerPlatform(new BinancePlatform());
  service.registerPlatform(new KalshiPlatform());
  // StocksPlatform needs API key — skip for summary (positions still show, just no live price update)
  const summary = service.getSwarmSummary();
  return NextResponse.json(summary);
}
