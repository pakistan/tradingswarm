import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';

const BINANCE = 'https://data-api.binance.vision/api/v3';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  crypto_price: {
    name: 'crypto_price',
    description: 'Get current crypto prices from Binance. No API key needed.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading pair, e.g. BTCUSDT, ETHUSDT, SOLUSDT' },
      },
      required: ['symbol'],
    },
  },
  crypto_history: {
    name: 'crypto_history',
    description: 'Get crypto price history (candlesticks) from Binance.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading pair, e.g. BTCUSDT' },
        interval: { type: 'string', description: 'Candle interval: 1h, 4h, 1d, 1w (default 1d)' },
        limit: { type: 'number', description: 'Number of candles (default 30, max 100)' },
      },
      required: ['symbol'],
    },
  },
  crypto_buy: {
    name: 'crypto_buy',
    description: 'Paper trade: buy crypto against real Binance order book.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading pair, e.g. BTCUSDT, ETHUSDT, SOLUSDT' },
        amount: { type: 'number', description: 'Dollar amount to spend (max $500)' },
        agent_context: { type: 'string', description: 'Your reasoning for this trade' },
      },
      required: ['symbol', 'amount'],
    },
  },
  crypto_sell: {
    name: 'crypto_sell',
    description: 'Paper trade: sell crypto you hold.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading pair, e.g. BTCUSDT' },
        shares: { type: 'number', description: 'Amount of crypto to sell' },
        agent_context: { type: 'string', description: 'Your reasoning for this trade' },
      },
      required: ['symbol', 'shares'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const { agentId, tradingService } = ctx;

  return {
    crypto_price: async (args) => {
      const symbol = String(args.symbol).toUpperCase();
      const res = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`);
      if (!res.ok) return JSON.stringify({ error: `Binance error ${res.status} for ${symbol}` });
      const d = await res.json() as Record<string, string>;
      return JSON.stringify({
        symbol,
        price: d.lastPrice,
        change_24h: `${Number(d.priceChangePercent).toFixed(2)}%`,
        high_24h: d.highPrice,
        low_24h: d.lowPrice,
        volume_24h: `$${(Number(d.quoteVolume) / 1e6).toFixed(1)}M`,
      });
    },
    crypto_history: async (args) => {
      const symbol = String(args.symbol).toUpperCase();
      const interval = String(args.interval || '1d');
      const limit = Math.min(Number(args.limit) || 30, 100);
      const res = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!res.ok) return JSON.stringify({ error: `Binance error ${res.status}` });
      const klines = await res.json() as Array<Array<string | number>>;
      return JSON.stringify(klines.map(k => ({
        date: new Date(k[0] as number).toISOString().split('T')[0],
        open: k[1], high: k[2], low: k[3], close: k[4],
        volume: `$${(Number(k[7]) / 1e6).toFixed(1)}M`,
      })));
    },
    crypto_buy: async (args) => {
      const result = await tradingService.buy(
        'binance', agentId, String(args.symbol).toUpperCase(),
        Number(args.amount), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
    crypto_sell: async (args) => {
      const result = await tradingService.sell(
        'binance', agentId, String(args.symbol).toUpperCase(),
        Number(args.shares), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
  };
}

// ---- Domain Export ----

export const binanceDomain: DomainModule = {
  name: 'binance',
  tools: { definitions, handlers },
};
