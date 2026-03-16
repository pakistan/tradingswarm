import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { PolymarketAPI } from './api';
import * as trades from '@/lib/db/trades';
import * as snapshots from '@/lib/db/snapshots';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  pm_markets: {
    name: 'pm_markets',
    description: 'Browse prediction market events. Each event has one or more tradeable markets with clobTokenIds. Use offset to paginate.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events (default 15)' },
        offset: { type: 'number', description: 'Skip this many events for pagination (default 0)' },
      },
    },
  },
  pm_market_detail: {
    name: 'pm_market_detail',
    description: 'Get detailed info about a specific market by ID.',
    parameters: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'Market ID' },
      },
      required: ['market_id'],
    },
  },
  pm_positions: {
    name: 'pm_positions',
    description: 'Get your current positions (shares held, avg entry price, unrealized P&L).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  pm_balance: {
    name: 'pm_balance',
    description: 'Get your current cash balance and portfolio summary.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  pm_buy: {
    name: 'pm_buy',
    description: 'Buy shares of a prediction market outcome. Paper trade against real order book data.',
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: 'The clobTokenId (long hash) from pm_markets. NOT the market ID.' },
        amount: { type: 'number', description: 'Dollar amount to spend' },
        agent_context: { type: 'string', description: 'Your reasoning for this trade (recorded for analysis)' },
      },
      required: ['outcome_id', 'amount'],
    },
  },
  pm_sell: {
    name: 'pm_sell',
    description: 'Sell shares of a prediction market outcome you hold.',
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: 'The clobTokenId (long hash) from pm_markets. NOT the market ID.' },
        shares: { type: 'number', description: 'Number of shares to sell' },
        agent_context: { type: 'string', description: 'Your reasoning for this trade' },
      },
      required: ['outcome_id', 'shares'],
    },
  },
  pm_orders: {
    name: 'pm_orders',
    description: 'List your pending/partial limit orders.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  pm_cancel_order: {
    name: 'pm_cancel_order',
    description: 'Cancel a pending limit order by ID.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'number', description: 'Order ID to cancel' },
      },
      required: ['order_id'],
    },
  },
  pm_cancel_all: {
    name: 'pm_cancel_all',
    description: 'Cancel all your pending limit orders.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  pm_history: {
    name: 'pm_history',
    description: 'Get your trade history (closed positions and their P&L).',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
    },
  },
  pm_snapshot: {
    name: 'pm_snapshot',
    description: 'Record a trade snapshot with your reasoning and market state before a trade.',
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: 'Outcome ID' },
        agent_context: { type: 'string', description: 'Your analysis and reasoning' },
        market_snapshot: { type: 'string', description: 'Current market state summary' },
      },
      required: ['outcome_id', 'agent_context', 'market_snapshot'],
    },
  },
  pm_leaderboard: {
    name: 'pm_leaderboard',
    description: 'Get the trading leaderboard — all agents ranked by portfolio value.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  pm_orderbook: {
    name: 'pm_orderbook',
    description: 'Get the order book for an outcome. Shows bids, asks, spread, mid price, and depth. Check this BEFORE trading. IMPORTANT: Use the clobTokenId (long hash) from pm_markets, NOT the market ID (short number).',
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: 'The clobTokenId (long hash string) from pm_markets results. NOT the market ID.' },
      },
      required: ['outcome_id'],
    },
  },
  pm_price_history: {
    name: 'pm_price_history',
    description: 'Get price history for an outcome over time. Returns timestamped price points.',
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: 'The clobTokenId (long hash) from pm_markets. NOT the market ID.' },
        interval: { type: 'string', description: 'Time interval: 1m, 5m, 1h, 1d (default 1h)' },
      },
      required: ['outcome_id'],
    },
  },
  pm_search: {
    name: 'pm_search',
    description: 'Search for prediction markets by keyword. Returns matching markets, events, and profiles.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "crypto regulation", "NBA finals")' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const api = new PolymarketAPI();
  const { db, agentId, tradingService } = ctx;

  return {
    pm_markets: async (args) => {
      const limit = Math.min(Number(args.limit) || 15, 20);
      const offset = Number(args.offset) || 0;
      const events = await api.listEvents({ limit, offset, active: true, closed: false });
      // Cache markets from events to DB
      for (const event of events) {
        for (const m of (event.markets ?? [])) {
          try {
            trades.upsertMarket(db, { market_id: m.id, platform: 'polymarket', question: m.question ?? event.title, category: m.category, description: m.description, resolution_source: m.resolutionSource, end_date: m.endDate, active: m.active ? 1 : 0, volume: m.volumeNum ?? 0, raw_json: null });
            if (m.outcomes && m.clobTokenIds && m.outcomePrices) {
              const names = JSON.parse(m.outcomes) as string[];
              const tokenIds = JSON.parse(m.clobTokenIds) as string[];
              const prices = JSON.parse(m.outcomePrices) as string[];
              for (let i = 0; i < names.length; i++) {
                if (tokenIds[i]) trades.upsertOutcome(db, { outcome_id: tokenIds[i], market_id: m.id, name: names[i], current_price: parseFloat(prices[i] ?? '0') });
              }
            }
          } catch { /* skip */ }
        }
      }
      // Return events with their markets
      return JSON.stringify(events.map(e => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        markets: (e.markets ?? []).map(m => ({
          id: m.id, question: m.question, outcomes: m.outcomes,
          outcomePrices: m.outcomePrices, clobTokenIds: m.clobTokenIds,
          volume: m.volumeNum, endDate: m.endDate,
        })),
      })));
    },
    pm_market_detail: async (args) => {
      const detail = await api.getMarketDetail(String(args.market_id));
      // Parse outcomes and token IDs for clear labeling
      let outcomeDetails: Array<{ name: string; price: string; token_id: string }> = [];
      try {
        const names = JSON.parse(detail.outcomes ?? '[]') as string[];
        const prices = JSON.parse(detail.outcomePrices ?? '[]') as string[];
        const tokens = JSON.parse(detail.clobTokenIds ?? '[]') as string[];
        outcomeDetails = names.map((name, i) => ({
          name,
          price: prices[i] ?? '0',
          token_id: tokens[i] ?? '', // THIS is what you pass to pm_buy, pm_sell, pm_orderbook
        }));
      } catch { /* skip */ }
      return JSON.stringify({
        id: detail.id,
        question: detail.question,
        description: detail.description,
        category: detail.category,
        outcomes: outcomeDetails, // Each outcome has name, price, and token_id for trading
        volume: detail.volumeNum,
        endDate: detail.endDate,
        spread: detail.spread,
        bestBid: detail.bestBid,
        bestAsk: detail.bestAsk,
        active: detail.active,
        closed: detail.closed,
        resolutionSource: detail.resolutionSource,
      });
    },
    pm_positions: async () => {
      const portfolio = await tradingService.getPortfolio(agentId);
      return JSON.stringify(portfolio.positions);
    },
    pm_balance: async () => {
      const portfolio = await tradingService.getPortfolio(agentId);
      return JSON.stringify({
        cash: portfolio.cash, initial_balance: portfolio.initial_balance,
        positions_count: portfolio.positions.length,
        realized_pnl: portfolio.realized_pnl, unrealized_pnl: portfolio.unrealized_pnl,
        total_portfolio_value: portfolio.total_portfolio_value,
      });
    },
    pm_buy: async (args) => {
      const result = await tradingService.buy(
        'polymarket', agentId, String(args.outcome_id),
        Number(args.amount), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
    pm_sell: async (args) => {
      const result = await tradingService.sell(
        'polymarket', agentId, String(args.outcome_id),
        Number(args.shares), args.agent_context ? String(args.agent_context) : undefined
      );
      return JSON.stringify(result);
    },
    pm_orders: async () => {
      const pending = trades.getPendingOrders(db, agentId);
      return JSON.stringify(pending);
    },
    pm_cancel_order: async (args) => {
      const cancelled = trades.cancelOrder(db, Number(args.order_id), agentId);
      if (!cancelled) return JSON.stringify({ error: 'Order not found or already filled' });
      return JSON.stringify({ message: 'Order cancelled', order_id: args.order_id });
    },
    pm_cancel_all: async () => {
      const count = trades.cancelAllOrders(db, agentId);
      return JSON.stringify({ message: `Cancelled ${count} orders` });
    },
    pm_history: async (args) => {
      const history = trades.getTradeHistory(db, agentId, Number(args.limit) || 50);
      return JSON.stringify(history);
    },
    pm_snapshot: async (args) => {
      const snapshotId = snapshots.insertSnapshot(
        db,
        agentId,
        String(args.outcome_id),
        String(args.agent_context),
        String(args.market_snapshot),
      );
      return JSON.stringify({ snapshot_id: snapshotId });
    },
    pm_leaderboard: async () => {
      const board = trades.getLeaderboard(db);
      return JSON.stringify(board);
    },
    pm_orderbook: async (args) => {
      const orderBook = await api.getOrderBook(String(args.outcome_id));
      return JSON.stringify({
        mid_price: orderBook.mid_price,
        spread: orderBook.spread,
        best_bid: orderBook.bids[0]?.price ?? null,
        best_ask: orderBook.asks[0]?.price ?? null,
        bid_depth: orderBook.bids.slice(0, 10).map(l => ({ price: l.price, size: l.size })),
        ask_depth: orderBook.asks.slice(0, 10).map(l => ({ price: l.price, size: l.size })),
        total_bid_liquidity: orderBook.bids.reduce((s, l) => s + l.price * l.size, 0),
        total_ask_liquidity: orderBook.asks.reduce((s, l) => s + l.price * l.size, 0),
      });
    },
    pm_price_history: async (args) => {
      const history = await api.getPriceHistory(String(args.outcome_id), {
        interval: String(args.interval || '1h'),
      });
      return JSON.stringify(history);
    },
    pm_search: async (args) => {
      const results = await api.searchMarkets(String(args.query), Number(args.limit) || 10);
      return JSON.stringify(results);
    },
  };
}

// ---- Domain Export ----

export const polymarketDomain: DomainModule = {
  name: 'polymarket',
  tools: { definitions, handlers },
};
