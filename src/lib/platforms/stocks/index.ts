import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';

const AV = 'https://www.alphavantage.co/query';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  stock_price: {
    name: 'stock_price',
    description: 'Get current stock price from Alpha Vantage. Use for equities, ETFs, indices.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol, e.g. SPY, AAPL, XLE, GLD, TLT' },
      },
      required: ['symbol'],
    },
  },
  stock_top_movers: {
    name: 'stock_top_movers',
    description: 'Get top gainers, losers, and most active stocks today.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  stock_buy: {
    name: 'stock_buy',
    description: 'Paper trade: buy stock/ETF shares.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol, e.g. SPY, AAPL, XLE, GLD, TLT' },
        amount: { type: 'number', description: 'Dollar amount to spend (max $500)' },
        agent_context: { type: 'string', description: 'Your reasoning' },
      },
      required: ['symbol', 'amount'],
    },
  },
  stock_sell: {
    name: 'stock_sell',
    description: 'Paper trade: sell stock/ETF shares you hold.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol' },
        shares: { type: 'number', description: 'Number of shares to sell' },
        agent_context: { type: 'string', description: 'Your reasoning' },
      },
      required: ['symbol', 'shares'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const { agentId, tradingService, getToolConfig } = ctx;
  const alphaVantageKey = getToolConfig('Alpha Vantage').api_key ?? '';

  return {
    stock_price: async (args) => {
      if (!alphaVantageKey) return JSON.stringify({ error: 'Alpha Vantage API key not configured' });
      const symbol = String(args.symbol).toUpperCase();
      const res = await fetch(`${AV}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageKey}`);
      if (!res.ok) return JSON.stringify({ error: `Alpha Vantage error ${res.status}` });
      const d = await res.json() as { 'Global Quote'?: Record<string, string> };
      const q = d['Global Quote'];
      if (!q || !q['05. price']) return JSON.stringify({ error: `No data for ${symbol}` });
      return JSON.stringify({
        symbol,
        price: q['05. price'],
        change: q['09. change'],
        change_pct: q['10. change percent'],
        volume: q['06. volume'],
        prev_close: q['08. previous close'],
      });
    },
    stock_top_movers: async () => {
      if (!alphaVantageKey) return JSON.stringify({ error: 'Alpha Vantage API key not configured' });
      const res = await fetch(`${AV}?function=TOP_GAINERS_LOSERS&apikey=${alphaVantageKey}`);
      if (!res.ok) return JSON.stringify({ error: `Alpha Vantage error ${res.status}` });
      const d = await res.json() as { top_gainers?: Array<Record<string, string>>; top_losers?: Array<Record<string, string>> };
      return JSON.stringify({
        top_gainers: (d.top_gainers ?? []).slice(0, 5).map(s => ({ symbol: s.ticker, price: s.price, change: s.change_percentage })),
        top_losers: (d.top_losers ?? []).slice(0, 5).map(s => ({ symbol: s.ticker, price: s.price, change: s.change_percentage })),
      });
    },
    stock_buy: async (args) => {
      const result = await tradingService.buy(
        'stocks', agentId, String(args.symbol).toUpperCase(),
        Number(args.amount), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
    stock_sell: async (args) => {
      const result = await tradingService.sell(
        'stocks', agentId, String(args.symbol).toUpperCase(),
        Number(args.shares), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
  };
}

// ---- Domain Export ----

export const stocksDomain: DomainModule = {
  name: 'stocks',
  tools: { definitions, handlers },
};
