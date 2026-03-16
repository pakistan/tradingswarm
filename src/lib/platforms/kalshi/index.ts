import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { KalshiAPI } from './api';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  kalshi_markets: {
    name: 'kalshi_markets',
    description: 'Browse prediction markets on Kalshi (another prediction market platform). Compare prices to Polymarket.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category filter: Politics, Climate and Weather, Science and Technology, World, Economics' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  kalshi_buy: {
    name: 'kalshi_buy',
    description: 'Paper trade: buy YES or NO shares on a Kalshi market.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Kalshi market ticker' },
        side: { type: 'string', description: '"yes" or "no" (default "yes")' },
        amount: { type: 'number', description: 'Dollar amount to spend (max $500)' },
        agent_context: { type: 'string', description: 'Your reasoning' },
      },
      required: ['ticker', 'amount'],
    },
  },
  kalshi_sell: {
    name: 'kalshi_sell',
    description: 'Paper trade: sell shares on a Kalshi market you hold.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Kalshi market ticker' },
        shares: { type: 'number', description: 'Number of shares to sell' },
        agent_context: { type: 'string', description: 'Your reasoning' },
      },
      required: ['ticker', 'shares'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const kalshiApi = new KalshiAPI();
  const { agentId, tradingService } = ctx;

  return {
    kalshi_markets: async (args) => {
      const events = await kalshiApi.getEvents({
        limit: Number(args.limit) || 20,
        category: args.category ? String(args.category) : undefined,
      });
      return JSON.stringify(events.map(e => ({
        title: e.title,
        category: e.category,
        markets: e.markets.filter(m => !m.title.includes(',yes ')).slice(0, 3).map(m => ({
          ticker: m.ticker,
          title: m.title,
          yes_price: m.yes_ask_dollars,
          volume_24h: m.volume_24h_fp,
        })),
      })));
    },
    kalshi_buy: async (args) => {
      const side = String(args.side || 'yes').toLowerCase();
      const ticker = side === 'no' ? `${String(args.ticker)}:no` : String(args.ticker);
      const result = await tradingService.buy(
        'kalshi', agentId, ticker,
        Number(args.amount), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
    kalshi_sell: async (args) => {
      const result = await tradingService.sell(
        'kalshi', agentId, String(args.ticker),
        Number(args.shares), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
  };
}

// ---- Domain Export ----

export const kalshiDomain: DomainModule = {
  name: 'kalshi',
  tools: { definitions, handlers },
};
