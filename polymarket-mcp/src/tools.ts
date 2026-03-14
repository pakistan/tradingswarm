import type { PolymarketDB } from './db.js';
import type { PolymarketAPI } from './polymarket-api.js';
import { simulateBuy, simulateSell, simulateSellByAmount } from './order-engine.js';
import { settleMarket } from './settlement.js';

export const TOOL_DEFINITIONS = [
  // ---- Market Data ----
  {
    name: 'pm_markets',
    description: 'Search and browse active Polymarket prediction markets. Returns market ID, question, outcomes with prices, volume, and end date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        category: { type: 'string', description: 'Filter by category' },
        min_volume: { type: 'number', description: 'Minimum trading volume' },
        max_end_date: { type: 'string', description: 'Latest resolution date (ISO 8601)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'pm_market_detail',
    description: 'Full detail on a single market: description, resolution source, rules, outcomes with prices, volume, end date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market_id: { type: 'string', description: 'Market ID' },
      },
      required: ['market_id'],
    },
  },
  {
    name: 'pm_orderbook',
    description: 'Live order book depth for a specific outcome token. Shows bids, asks, sizes at each price level, spread, and mid price.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outcome_id: { type: 'string', description: 'Outcome token ID (clobTokenId)' },
      },
      required: ['outcome_id'],
    },
  },
  {
    name: 'pm_price_history',
    description: 'Historical price movement for an outcome token over time.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        outcome_id: { type: 'string', description: 'Outcome token ID' },
        interval: { type: 'string', enum: ['1h', '6h', '1d', '1w', '1m', 'all'], description: 'Time interval' },
        limit: { type: 'number', description: 'Max data points' },
      },
      required: ['outcome_id'],
    },
  },
  // ---- Trade Snapshots ----
  {
    name: 'pm_snapshot',
    description: 'Record your trading context BEFORE placing a trade. Captures your reasoning + auto-captures market conditions. Returns a snapshot_id required by pm_buy, pm_sell, and pm_limit_order. Include everything: research findings, web search results, thesis, reasoning, why you believe the market is mispriced.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID you plan to trade' },
        context: { type: 'string', description: 'Your full trading context: research, thesis, reasoning, data sources, why you believe this is mispriced. Be thorough — this is your record for post-mortems.' },
      },
      required: ['agent_id', 'outcome_id', 'context'],
    },
  },
  // ---- Paper Trading ----
  {
    name: 'pm_buy',
    description: 'Place a simulated buy order. Fills against real order book depth, modeling slippage. Specify amount (dollars) OR shares (count). Requires a snapshot_id from pm_snapshot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID to buy' },
        amount: { type: 'number', description: 'Dollar amount to spend' },
        shares: { type: 'number', description: 'Number of shares to buy' },
        snapshot_id: { type: 'number', description: 'Snapshot ID from pm_snapshot (required)' },
      },
      required: ['agent_id', 'outcome_id', 'snapshot_id'],
    },
  },
  {
    name: 'pm_sell',
    description: 'Sell/exit a position. Fills against real order book depth. Specify shares (count) OR amount (dollar proceeds target). Requires a snapshot_id from pm_snapshot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID to sell' },
        shares: { type: 'number', description: 'Number of shares to sell' },
        amount: { type: 'number', description: 'Dollar amount of proceeds to target' },
        snapshot_id: { type: 'number', description: 'Snapshot ID from pm_snapshot (required)' },
      },
      required: ['agent_id', 'outcome_id', 'snapshot_id'],
    },
  },
  {
    name: 'pm_limit_order',
    description: 'Place a resting limit order at a specific price. Fills when market crosses that level. Requires a snapshot_id from pm_snapshot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Outcome token ID' },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Buy or sell' },
        shares: { type: 'number', description: 'Number of shares' },
        price: { type: 'number', description: 'Limit price' },
        snapshot_id: { type: 'number', description: 'Snapshot ID from pm_snapshot (required)' },
      },
      required: ['agent_id', 'outcome_id', 'side', 'shares', 'price', 'snapshot_id'],
    },
  },
  {
    name: 'pm_orders',
    description: 'List pending limit orders for your agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Filter by outcome (optional)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_cancel_order',
    description: 'Cancel a pending limit order.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        order_id: { type: 'number', description: 'Order ID to cancel' },
      },
      required: ['agent_id', 'order_id'],
    },
  },
  {
    name: 'pm_cancel_all',
    description: 'Cancel all pending limit orders, optionally for a specific outcome.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        outcome_id: { type: 'string', description: 'Filter by outcome (optional)' },
      },
      required: ['agent_id'],
    },
  },
  // ---- Portfolio & Results ----
  {
    name: 'pm_positions',
    description: 'Your current open positions with mark-to-market P&L.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_balance',
    description: 'Account summary: cash, positions value, total portfolio, realized/unrealized P&L.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_history',
    description: 'Closed/resolved trade history with realized P&L. Use this for post-mortems.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        limit: { type: 'number', description: 'Max trades to return (default 50)' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'pm_leaderboard',
    description: 'Cross-agent performance comparison: total return, win rate, P&L.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'pm_check_resolution',
    description: 'Manually check if a market has resolved. Settles any open positions if resolved.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market_id: { type: 'string', description: 'Market ID to check' },
      },
      required: ['market_id'],
    },
  },
];

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${key} must be a non-empty string`);
  return v;
}

function requirePositiveNumber(args: Record<string, unknown>, key: string): number {
  const v = Number(args[key]);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${key} must be a positive number`);
  return v;
}

function requireSide(args: Record<string, unknown>): 'buy' | 'sell' {
  const v = args.side;
  if (v !== 'buy' && v !== 'sell') throw new Error(`side must be 'buy' or 'sell'`);
  return v;
}

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  db: PolymarketDB,
  api: PolymarketAPI,
): Promise<string> {
  switch (name) {
    // ---- Market Data ----
    case 'pm_markets': {
      const query = args.query as string | undefined;
      if (query) {
        const results = await api.searchMarkets(query, (args.limit as number) ?? 20);
        return JSON.stringify(results, null, 2);
      }
      const markets = await api.listMarkets({
        category: args.category as string | undefined,
        min_volume: args.min_volume as number | undefined,
        max_end_date: args.max_end_date as string | undefined,
        limit: (args.limit as number) ?? 20,
        offset: args.offset as number | undefined,
      });
      // Cache results
      for (const m of markets) {
        db.upsertMarket({
          market_id: m.id, question: m.question ?? '', category: m.category,
          description: m.description, resolution_source: m.resolutionSource,
          volume: m.volumeNum, end_date: m.endDate, active: m.active ? 1 : 0,
          raw_json: JSON.stringify(m),
        });
        // Parse outcomes + token IDs
        if (m.outcomes && m.outcomePrices && m.clobTokenIds) {
          try {
            const names = JSON.parse(m.outcomes) as string[];
            const prices = JSON.parse(m.outcomePrices) as string[];
            const tokens = JSON.parse(m.clobTokenIds) as string[];
            for (let i = 0; i < names.length; i++) {
              db.upsertOutcome({
                outcome_id: tokens[i], market_id: m.id,
                name: names[i], current_price: parseFloat(prices[i]),
              });
            }
          } catch { /* skip malformed */ }
        }
      }
      // Return simplified view
      const simplified = markets.map(m => {
        let outcomes: Array<{ name: string; price: number; token_id: string }> = [];
        try {
          const names = JSON.parse(m.outcomes ?? '[]') as string[];
          const prices = JSON.parse(m.outcomePrices ?? '[]') as string[];
          const tokens = JSON.parse(m.clobTokenIds ?? '[]') as string[];
          outcomes = names.map((n, i) => ({ name: n, price: parseFloat(prices[i]), token_id: tokens[i] }));
        } catch { /* skip */ }
        return {
          market_id: m.id, question: m.question, category: m.category,
          outcomes, volume: m.volumeNum, end_date: m.endDate, active: m.active,
        };
      });
      return JSON.stringify(simplified, null, 2);
    }

    case 'pm_market_detail': {
      const marketId = args.market_id as string;
      const market = await api.getMarketDetail(marketId);
      db.upsertMarket({
        market_id: market.id, question: market.question ?? '', category: market.category,
        description: market.description, resolution_source: market.resolutionSource,
        volume: market.volumeNum, end_date: market.endDate,
        active: market.active ? 1 : 0, raw_json: JSON.stringify(market),
      });
      return JSON.stringify(market, null, 2);
    }

    case 'pm_orderbook': {
      const outcomeId = args.outcome_id as string;
      const book = await api.getOrderBook(outcomeId);
      return JSON.stringify(book, null, 2);
    }

    case 'pm_price_history': {
      const outcomeId = args.outcome_id as string;
      const history = await api.getPriceHistory(outcomeId, {
        interval: args.interval as string | undefined,
      });
      return JSON.stringify(history, null, 2);
    }

    // ---- Trade Snapshots ----
    case 'pm_snapshot': {
      const agentId = requireString(args, 'agent_id');
      const outcomeId = requireString(args, 'outcome_id');
      const context = requireString(args, 'context');

      // Auto-capture market conditions
      let marketSnapshot: Record<string, unknown> = {};
      try {
        const book = await api.getOrderBook(outcomeId);
        const askDepth = book.asks.reduce((sum, l) => sum + l.price * l.size, 0);
        const bidDepth = book.bids.reduce((sum, l) => sum + l.price * l.size, 0);
        marketSnapshot = {
          best_bid: book.bids[0]?.price ?? null,
          best_ask: book.asks[0]?.price ?? null,
          spread: book.spread,
          mid_price: book.mid_price,
          ask_levels: book.asks.length,
          bid_levels: book.bids.length,
          total_ask_depth_usd: Math.round(askDepth * 100) / 100,
          total_bid_depth_usd: Math.round(bidDepth * 100) / 100,
          top_5_asks: book.asks.slice(0, 5),
          top_5_bids: book.bids.slice(0, 5),
          timestamp: book.timestamp,
        };
      } catch {
        marketSnapshot = { error: 'Could not fetch order book' };
      }

      // Capture agent's current portfolio state
      const agent = db.getOrCreateAgent(agentId);
      const positions = db.getPositions(agentId);
      const portfolioSnapshot = {
        cash: agent.current_cash,
        num_positions: positions.length,
        total_position_value: positions.reduce((sum, p) => sum + p.shares * (p.current_price ?? p.avg_entry_price), 0),
      };

      const snapshotId = db.insertSnapshot({
        agent_id: agentId,
        outcome_id: outcomeId,
        agent_context: context,
        market_snapshot: JSON.stringify({ market: marketSnapshot, portfolio: portfolioSnapshot }),
      });

      return JSON.stringify({ snapshot_id: snapshotId, outcome_id: outcomeId, market: marketSnapshot }, null, 2);
    }

    // ---- Paper Trading ----
    case 'pm_buy': {
      const agentId = requireString(args, 'agent_id');
      const outcomeId = requireString(args, 'outcome_id');
      const amount = args.amount != null ? requirePositiveNumber(args, 'amount') : undefined;
      const shares = args.shares != null ? requirePositiveNumber(args, 'shares') : undefined;
      if (!amount && !shares) throw new Error('Must specify amount or shares');
      const snapshotId = args.snapshot_id as number;
      if (!snapshotId) throw new Error('snapshot_id is required. Call pm_snapshot first to record your trading context.');
      if (!db.getSnapshot(snapshotId)) throw new Error(`Snapshot ${snapshotId} not found`);

      db.getOrCreateAgent(agentId);
      const book = await api.getOrderBook(outcomeId);
      const fill = simulateBuy(book.asks, { amount, shares });
      if (fill.filled_shares === 0) throw new Error('No liquidity available');

      return db.transaction(() => {
        db.updateCash(agentId, -fill.filled_amount);
        const existing = db.getPosition(agentId, outcomeId);
        const totalShares = (existing?.shares ?? 0) + fill.filled_shares;
        const totalCost = (existing ? existing.avg_entry_price * existing.shares : 0) + fill.filled_amount;
        const newAvg = totalCost / totalShares;
        db.upsertPosition(agentId, outcomeId, totalShares, newAvg);

        const orderId = db.insertOrder({
          agent_id: agentId, outcome_id: outcomeId, side: 'buy', order_type: 'market',
          requested_amount: amount, requested_shares: shares,
          filled_amount: fill.filled_amount, filled_shares: fill.filled_shares,
          avg_fill_price: fill.avg_fill_price, slippage: fill.slippage,
          snapshot_id: snapshotId, status: 'filled',
        });

        const agent = db.getOrCreateAgent(agentId);
        return JSON.stringify({
          order_id: orderId, outcome_id: outcomeId, side: 'buy',
          filled_amount: fill.filled_amount, avg_fill_price: fill.avg_fill_price,
          slippage: fill.slippage, shares_acquired: fill.filled_shares,
          new_cash_balance: agent.current_cash,
        }, null, 2);
      });
    }

    case 'pm_sell': {
      const agentId = requireString(args, 'agent_id');
      const outcomeId = requireString(args, 'outcome_id');
      const shareCount = args.shares != null ? requirePositiveNumber(args, 'shares') : undefined;
      const amount = args.amount != null ? requirePositiveNumber(args, 'amount') : undefined;
      if (!shareCount && !amount) throw new Error('Must specify shares or amount');
      const snapshotId = args.snapshot_id as number;
      if (!snapshotId) throw new Error('snapshot_id is required. Call pm_snapshot first to record your trading context.');
      if (!db.getSnapshot(snapshotId)) throw new Error(`Snapshot ${snapshotId} not found`);

      const position = db.getPosition(agentId, outcomeId);
      if (!position || position.shares <= 0) throw new Error('No position to sell');

      const book = await api.getOrderBook(outcomeId);

      let fill;
      if (shareCount) {
        if (shareCount > position.shares) throw new Error(`Cannot sell ${shareCount} shares, only hold ${position.shares}`);
        fill = simulateSell(book.bids, shareCount);
      } else {
        // Sell by dollar amount — cap shares at what we hold
        fill = simulateSellByAmount(book.bids, amount!);
        if (fill.filled_shares > position.shares) {
          // Recompute: sell only what we have
          fill = simulateSell(book.bids, position.shares);
        }
      }
      if (fill.filled_shares === 0) throw new Error('No liquidity available');

      return db.transaction(() => {
        db.updateCash(agentId, fill.filled_amount);
        const remainingShares = position.shares - fill.filled_shares;
        db.upsertPosition(agentId, outcomeId, remainingShares, position.avg_entry_price);

        const realizedPnl = (fill.avg_fill_price - position.avg_entry_price) * fill.filled_shares;

        const outcomeRow = db.getOutcomeById(outcomeId);
        const marketRow = db.getMarketByOutcomeId(outcomeId);

        db.recordTrade({
          agent_id: agentId, outcome_id: outcomeId,
          market_question: marketRow?.question ?? 'Unknown',
          outcome_name: outcomeRow?.name ?? 'Unknown',
          entry_price: position.avg_entry_price, exit_price: fill.avg_fill_price,
          shares: fill.filled_shares, realized_pnl: realizedPnl,
          reason: 'sold', opened_at: position.updated_at,
        });

        const orderId = db.insertOrder({
          agent_id: agentId, outcome_id: outcomeId, side: 'sell', order_type: 'market',
          requested_shares: shareCount, requested_amount: amount,
          filled_amount: fill.filled_amount, filled_shares: fill.filled_shares,
          avg_fill_price: fill.avg_fill_price, slippage: fill.slippage,
          snapshot_id: snapshotId, status: 'filled',
        });

        const agent = db.getOrCreateAgent(agentId);
        return JSON.stringify({
          order_id: orderId, outcome_id: outcomeId, side: 'sell',
          filled_shares: fill.filled_shares, avg_fill_price: fill.avg_fill_price,
          slippage: fill.slippage, proceeds: fill.filled_amount,
          realized_pnl: realizedPnl, new_cash_balance: agent.current_cash,
        }, null, 2);
      });
    }

    case 'pm_limit_order': {
      const agentId = requireString(args, 'agent_id');
      const outcomeId = requireString(args, 'outcome_id');
      const side = requireSide(args);
      const shares = requirePositiveNumber(args, 'shares');
      const price = requirePositiveNumber(args, 'price');
      if (price > 1) throw new Error('price must be between 0 and 1 (prediction market)');
      const snapshotId = args.snapshot_id as number;
      if (!snapshotId) throw new Error('snapshot_id is required. Call pm_snapshot first to record your trading context.');
      if (!db.getSnapshot(snapshotId)) throw new Error(`Snapshot ${snapshotId} not found`);

      db.getOrCreateAgent(agentId);

      let entryPrice: number | undefined;

      if (side === 'buy') {
        const escrow = shares * price;
        db.updateCash(agentId, -escrow); // escrow cash
      } else {
        const position = db.getPosition(agentId, outcomeId);
        if (!position || position.shares < shares) {
          throw new Error(`Insufficient shares to place sell limit. Have ${position?.shares ?? 0}, need ${shares}`);
        }
        // Capture entry price BEFORE reducing position (upsert may delete the row if shares → 0)
        entryPrice = position.avg_entry_price;
        // Escrow shares by reducing position
        db.upsertPosition(agentId, outcomeId, position.shares - shares, position.avg_entry_price);
      }

      const orderId = db.insertOrder({
        agent_id: agentId, outcome_id: outcomeId, side, order_type: 'limit',
        requested_shares: shares, limit_price: price,
        escrowed_entry_price: entryPrice,
        snapshot_id: snapshotId, status: 'pending',
      });

      return JSON.stringify({ order_id: orderId, status: 'pending', outcome_id: outcomeId, side, shares, price }, null, 2);
    }

    case 'pm_orders': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string | undefined;
      const orders = db.getPendingOrders(agentId, outcomeId);
      return JSON.stringify(orders.map(o => ({
        order_id: o.order_id, outcome_id: o.outcome_id, side: o.side,
        shares: o.requested_shares, filled_shares: o.filled_shares,
        remaining_shares: (o.requested_shares ?? 0) - o.filled_shares,
        price: o.limit_price, status: o.status, created_at: o.created_at,
      })), null, 2);
    }

    case 'pm_cancel_order': {
      const agentId = args.agent_id as string;
      const orderId = args.order_id as number;
      const order = db.cancelOrder(orderId, agentId);
      if (!order) throw new Error(`Order ${orderId} not found or not cancellable`);

      // Release escrow
      let releasedAmount = 0;
      const remainingShares = (order.requested_shares ?? 0) - order.filled_shares;
      if (order.side === 'buy' && order.limit_price) {
        releasedAmount = remainingShares * order.limit_price;
        db.updateCash(agentId, releasedAmount);
      } else if (order.side === 'sell') {
        // Return escrowed shares to position, using stored entry price
        const pos = db.getPosition(agentId, order.outcome_id);
        const currentShares = pos?.shares ?? 0;
        const entryPrice = order.escrowed_entry_price ?? pos?.avg_entry_price ?? 0;
        db.upsertPosition(agentId, order.outcome_id, currentShares + remainingShares, entryPrice);
      }

      return JSON.stringify({ order_id: orderId, status: 'cancelled', released_amount: releasedAmount }, null, 2);
    }

    case 'pm_cancel_all': {
      const agentId = args.agent_id as string;
      const outcomeId = args.outcome_id as string | undefined;

      return db.transaction(() => {
        const orders = db.getPendingOrders(agentId, outcomeId);
        let totalReleasedCash = 0;
        let totalReleasedShares = 0;

        for (const order of orders) {
          const remaining = (order.requested_shares ?? 0) - order.filled_shares;
          if (order.side === 'buy' && order.limit_price) {
            const released = remaining * order.limit_price;
            totalReleasedCash += released;
            db.updateCash(agentId, released);
          } else if (order.side === 'sell') {
            totalReleasedShares += remaining;
            const pos = db.getPosition(agentId, order.outcome_id);
            const entryPrice = order.escrowed_entry_price ?? pos?.avg_entry_price ?? 0;
            db.upsertPosition(agentId, order.outcome_id, (pos?.shares ?? 0) + remaining, entryPrice);
          }
        }

        const count = db.cancelAllOrders(agentId, outcomeId);
        return JSON.stringify({ cancelled_count: count, total_released_cash: totalReleasedCash, total_released_shares: totalReleasedShares }, null, 2);
      });
    }

    // ---- Portfolio & Results ----
    case 'pm_positions': {
      const agentId = args.agent_id as string;
      const positions = db.getPositions(agentId);
      // Mark to market with latest prices
      for (const pos of positions) {
        try {
          const mid = await api.getMidpointPrice(pos.outcome_id);
          db.updatePositionPrice(agentId, pos.outcome_id, mid);
        } catch { /* use cached price */ }
      }
      const updated = db.getPositions(agentId);
      const enriched = updated.map(pos => {
        const outcomeRow = db.getOutcomeById(pos.outcome_id);
        const marketRow = db.getMarketByOutcomeId(pos.outcome_id);
        return {
          outcome_id: pos.outcome_id,
          market_question: marketRow?.question ?? 'Unknown',
          outcome_name: outcomeRow?.name ?? 'Unknown',
          shares: pos.shares,
          avg_entry_price: pos.avg_entry_price, current_price: pos.current_price,
          unrealized_pnl: pos.unrealized_pnl,
          unrealized_pnl_pct: pos.avg_entry_price > 0
            ? ((pos.current_price ?? pos.avg_entry_price) - pos.avg_entry_price) / pos.avg_entry_price * 100
            : 0,
        };
      });
      return JSON.stringify(enriched, null, 2);
    }

    case 'pm_balance': {
      const agentId = args.agent_id as string;
      const agent = db.getOrCreateAgent(agentId);
      const positions = db.getPositions(agentId);
      const positionsValue = positions.reduce((sum, p) => sum + p.shares * (p.current_price ?? p.avg_entry_price), 0);
      const totalUnrealized = positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
      const totalRealized = db.getTotalRealizedPnl(agentId);
      const numClosedTrades = db.getTradeCount(agentId);

      return JSON.stringify({
        agent_id: agentId, cash: agent.current_cash,
        positions_value: positionsValue,
        total_portfolio_value: agent.current_cash + positionsValue,
        total_realized_pnl: totalRealized, total_unrealized_pnl: totalUnrealized,
        num_open_positions: positions.length, num_closed_trades: numClosedTrades,
      }, null, 2);
    }

    case 'pm_history': {
      const agentId = args.agent_id as string;
      const limit = (args.limit as number) ?? 50;
      const history = db.getTradeHistory(agentId, limit);
      return JSON.stringify(history, null, 2);
    }

    case 'pm_leaderboard': {
      const rows = db.getLeaderboard();
      const leaderboard = rows.map(r => {
        const totalReturn = r.realized_pnl + r.unrealized_pnl;
        const history = db.getTradeHistory(r.agent_id, 10000);
        const pnls = history.map(t => t.realized_pnl);
        const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
        const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
        return {
          agent_id: r.agent_id,
          total_return_pct: r.initial_balance > 0 ? (totalReturn / r.initial_balance) * 100 : 0,
          realized_pnl: r.realized_pnl, unrealized_pnl: r.unrealized_pnl,
          win_rate: r.num_trades > 0 ? (r.wins / r.num_trades) * 100 : 0,
          num_trades: r.num_trades, best_trade_pnl: bestTrade, worst_trade_pnl: worstTrade,
        };
      });
      leaderboard.sort((a, b) => b.total_return_pct - a.total_return_pct);
      return JSON.stringify(leaderboard, null, 2);
    }

    case 'pm_check_resolution': {
      const marketId = args.market_id as string;
      const market = await api.getMarketDetail(marketId);
      if (!market.closed) {
        return JSON.stringify({ market_id: marketId, resolved: false });
      }
      const result = settleMarket(db, market);
      return JSON.stringify({
        market_id: marketId, resolved: true, ...result,
      }, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
