import type Database from 'better-sqlite3';
import type { ToolDef } from './llm-client';
import { insertToolLog } from '@/lib/db/observability';
import { getVersionCapabilities } from '@/lib/db/configs';
import * as trades from '@/lib/db/trades';
import * as channels from '@/lib/db/channels';
import * as snapshots from '@/lib/db/snapshots';
import * as agents from '@/lib/db/agents';
import { getMemory, upsertMemory } from '@/lib/db/observability';
import { PolymarketAPI } from '@/lib/platforms/polymarket/api';
import { simulateBuy, simulateSell } from '@/lib/trading/order-engine';
import type { GammaMarket } from '@/lib/platforms/polymarket/types';

// ---- Types ----

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export interface ToolRegistry {
  register(name: string, handler: ToolHandler, definition: ToolDef): void;
  getHandler(name: string): ToolHandler | undefined;
  getDefinitions(): ToolDef[];
  listNames(): string[];
}

// ---- Implementation ----

export function createToolRegistry(): ToolRegistry {
  const handlers = new Map<string, ToolHandler>();
  const definitions = new Map<string, ToolDef>();

  return {
    register(name: string, handler: ToolHandler, definition: ToolDef): void {
      handlers.set(name, handler);
      definitions.set(name, definition);
    },
    getHandler(name: string): ToolHandler | undefined {
      return handlers.get(name);
    },
    getDefinitions(): ToolDef[] {
      return Array.from(definitions.values());
    },
    listNames(): string[] {
      return Array.from(handlers.keys());
    },
  };
}

// ---- Tool Definitions ----

const PM_TOOL_DEFS: Record<string, ToolDef> = {
  pm_markets: {
    name: 'pm_markets',
    description: 'List prediction markets. Returns market question, outcome prices, volume, end date.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 20)' },
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
        outcome_id: { type: 'string', description: 'Outcome/token ID to buy' },
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
        outcome_id: { type: 'string', description: 'Outcome/token ID to sell' },
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
    description: 'Get the order book for an outcome. Shows bids, asks, spread, mid price, and depth. Check this BEFORE trading to understand liquidity.',
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: 'Outcome/token ID' },
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
        outcome_id: { type: 'string', description: 'Outcome/token ID' },
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

const WORKSPACE_TOOL_DEFS: Record<string, ToolDef> = {
  notepad_read: {
    name: 'notepad_read',
    description: 'Read a file from your workspace. Use for notes, analysis, code, or any scratch work.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to your workspace (e.g. "notes.md", "analysis/model.py")' },
      },
      required: ['path'],
    },
  },
  notepad_write: {
    name: 'notepad_write',
    description: 'Write a file to your workspace. Creates directories as needed. Use for notes, calculations, code, research logs.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to your workspace' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  notepad_list: {
    name: 'notepad_list',
    description: 'List all files in your workspace.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  run_code: {
    name: 'run_code',
    description: 'Execute a Python or Node.js script from your workspace. Use for calculations, data analysis, or any computation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Script path relative to your workspace (e.g. "calc.py", "analysis.js")' },
      },
      required: ['path'],
    },
  },
};

const CHANNEL_TOOL_DEFS: Record<string, ToolDef> = {
  hub_list_channels: {
    name: 'hub_list_channels',
    description: 'List all coordination channels.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  hub_read: {
    name: 'hub_read',
    description: 'Read recent posts from a coordination channel.',
    parameters: {
      type: 'object',
      properties: {
        channel_id: { type: 'number', description: 'Channel ID to read' },
        limit: { type: 'number', description: 'Max posts (default 50)' },
      },
      required: ['channel_id'],
    },
  },
  hub_post: {
    name: 'hub_post',
    description: 'Post a message to a coordination channel.',
    parameters: {
      type: 'object',
      properties: {
        channel_id: { type: 'number', description: 'Channel ID' },
        content: { type: 'string', description: 'Message content' },
        parent_id: { type: 'number', description: 'Reply to post ID (optional)' },
      },
      required: ['channel_id', 'content'],
    },
  },
};

const WEB_TOOL_DEFS: Record<string, ToolDef> = {
  web_search: {
    name: 'web_search',
    description: 'Search the web for information. Returns titles, URLs, and snippets from top results.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Number of results (default 5, max 20)' },
      },
      required: ['query'],
    },
  },
};

const MEMORY_TOOL_DEFS: Record<string, ToolDef> = {
  memory_get: {
    name: 'memory_get',
    description: 'Get all your stored memory entries.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  memory_set: {
    name: 'memory_set',
    description: 'Store or update a memory entry by topic. Persists across loops.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic/key for this memory' },
        content: { type: 'string', description: 'Content to remember' },
      },
      required: ['topic', 'content'],
    },
  },
};

// ---- Handler builders ----

function wrapWithLogging(
  db: Database.Database,
  agentId: string,
  cycleIdFn: () => string,
  toolName: string,
  platform: string,
  handler: ToolHandler,
): ToolHandler {
  return async (args: Record<string, unknown>): Promise<string> => {
    const start = Date.now();
    try {
      const result = await handler(args);
      insertToolLog(db, {
        agent_id: agentId,
        tool_name: toolName,
        platform,
        cycle_id: cycleIdFn(),
        input_json: JSON.stringify(args),
        output_json: result.substring(0, 10000), // cap log size
        duration_ms: Date.now() - start,
      });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      insertToolLog(db, {
        agent_id: agentId,
        tool_name: toolName,
        platform,
        cycle_id: cycleIdFn(),
        input_json: JSON.stringify(args),
        error: errorMsg,
        duration_ms: Date.now() - start,
      });
      return JSON.stringify({ error: errorMsg });
    }
  };
}

function buildPmHandlers(
  db: Database.Database,
  agentId: string,
): Record<string, ToolHandler> {
  const api = new PolymarketAPI();

  return {
    pm_markets: async (args) => {
      const limit = Number(args.limit) || 20;
      // Randomize offset so different agents explore different markets
      const randomOffset = Math.floor(Math.random() * 80);
      const markets = await api.listMarkets({ limit, offset: randomOffset, closed: false });
      // Cache to DB
      for (const m of markets) {
        try {
          trades.upsertMarket(db, { market_id: m.id, platform: 'polymarket', question: m.question, category: m.category, description: m.description, resolution_source: m.resolutionSource, end_date: m.endDate, active: m.active ? 1 : 0, volume: m.volumeNum ?? 0, raw_json: null });
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
      return JSON.stringify(markets.map(m => ({ id: m.id, question: m.question, outcomes: m.outcomes, outcomePrices: m.outcomePrices, clobTokenIds: m.clobTokenIds, volume: m.volumeNum, endDate: m.endDate })));
    },
    pm_market_detail: async (args) => {
      const detail = await api.getMarketDetail(String(args.market_id));
      return JSON.stringify({
        id: detail.id,
        question: detail.question,
        description: detail.description,
        category: detail.category,
        outcomes: detail.outcomes,
        outcomePrices: detail.outcomePrices,
        clobTokenIds: detail.clobTokenIds,
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
      const positions = trades.getPositions(db, agentId);
      // Update current prices from API for unrealized P&L
      for (const pos of positions) {
        try {
          const mid = await api.getMidpointPrice(pos.outcome_id);
          trades.updatePositionPrice(db, agentId, pos.outcome_id, mid);
        } catch { /* skip price update failures */ }
      }
      const updated = trades.getPositions(db, agentId);
      return JSON.stringify(updated);
    },
    pm_balance: async () => {
      const agent = agents.getAgent(db, agentId);
      if (!agent) return JSON.stringify({ error: 'Agent not found' });
      const positions = trades.getPositions(db, agentId);
      const totalRealizedPnl = trades.getTotalRealizedPnl(db, agentId);
      const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
      return JSON.stringify({
        cash: agent.current_cash,
        initial_balance: agent.initial_balance,
        positions_count: positions.length,
        realized_pnl: totalRealizedPnl,
        unrealized_pnl: unrealizedPnl,
        total_portfolio_value: agent.current_cash + unrealizedPnl,
      });
    },
    pm_buy: async (args) => {
      const outcomeId = String(args.outcome_id);
      const amount = Number(args.amount);
      const agentContext = args.agent_context ? String(args.agent_context) : undefined;

      // Check agent has enough cash
      const agent = agents.getAgent(db, agentId);
      if (!agent) return JSON.stringify({ error: 'Agent not found' });
      const maxOrderSize = agent.initial_balance * 0.05; // 5% of bankroll
      if (amount > maxOrderSize) {
        return JSON.stringify({ error: `Order too large. Max order size is $${maxOrderSize.toFixed(0)} (5% of bankroll). Requested: $${amount}` });
      }
      if (agent.current_cash < amount) {
        return JSON.stringify({ error: `Insufficient cash. Have $${agent.current_cash.toFixed(2)}, need $${amount}` });
      }

      // Fetch live order book and simulate fill
      const orderBook = await api.getOrderBook(outcomeId);
      if (orderBook.asks.length === 0) {
        return JSON.stringify({ error: 'No asks in order book — cannot buy' });
      }
      const fill = simulateBuy(orderBook.asks, { amount });
      if (fill.filled_shares === 0) {
        return JSON.stringify({ error: 'Could not fill any shares at current prices' });
      }

      // Reject if slippage exceeds 5% of best ask price
      const bestAsk = orderBook.asks[0].price;
      const slippagePct = fill.slippage / bestAsk;
      if (slippagePct > 0.05) {
        return JSON.stringify({
          error: `Order rejected: slippage too high (${(slippagePct * 100).toFixed(1)}%). Best ask: $${bestAsk.toFixed(3)}, avg fill: $${fill.avg_fill_price.toFixed(3)}. Reduce order size or find a deeper book.`,
          best_ask: bestAsk,
          avg_fill_price: fill.avg_fill_price,
          slippage: fill.slippage,
          slippage_pct: slippagePct,
          levels_consumed: fill.levels_consumed,
        });
      }

      // Record snapshot if context provided
      if (agentContext) {
        snapshots.insertSnapshot(db, agentId, outcomeId, agentContext,
          JSON.stringify({ mid_price: orderBook.mid_price, spread: orderBook.spread, best_ask: orderBook.asks[0]?.price }));
      }

      // Deduct cash
      agents.updateAgentCash(db, agentId, -fill.filled_amount);

      // Record order as filled
      const orderId = trades.insertOrder(db, {
        agent_id: agentId,
        outcome_id: outcomeId,
        side: 'buy',
        order_type: 'market',
        requested_amount: amount,
        filled_amount: fill.filled_amount,
        filled_shares: fill.filled_shares,
        avg_fill_price: fill.avg_fill_price,
        status: 'filled',
      });

      // Update position — merge with existing if any
      const existingPos = trades.getPosition(db, agentId, outcomeId);
      if (existingPos && existingPos.shares > 0) {
        const totalShares = existingPos.shares + fill.filled_shares;
        const totalCost = (existingPos.shares * existingPos.avg_entry_price) + fill.filled_amount;
        trades.upsertPosition(db, agentId, outcomeId, totalShares, totalCost / totalShares);
      } else {
        trades.upsertPosition(db, agentId, outcomeId, fill.filled_shares, fill.avg_fill_price);
      }

      return JSON.stringify({
        order_id: orderId,
        status: 'filled',
        filled_shares: fill.filled_shares,
        filled_amount: fill.filled_amount,
        avg_fill_price: fill.avg_fill_price,
        slippage: fill.slippage,
        levels_consumed: fill.levels_consumed,
        remaining_cash: agent.current_cash - fill.filled_amount,
      });
    },
    pm_sell: async (args) => {
      const outcomeId = String(args.outcome_id);
      const requestedShares = Number(args.shares);
      const agentContext = args.agent_context ? String(args.agent_context) : undefined;

      const position = trades.getPosition(db, agentId, outcomeId);
      if (!position || position.shares <= 0) {
        return JSON.stringify({ error: 'No position found for this outcome' });
      }
      const sharesToSell = Math.min(requestedShares, position.shares);

      // Fetch live order book and simulate fill
      const orderBook = await api.getOrderBook(outcomeId);
      if (orderBook.bids.length === 0) {
        return JSON.stringify({ error: 'No bids in order book — cannot sell' });
      }
      const fill = simulateSell(orderBook.bids, sharesToSell);
      if (fill.filled_shares === 0) {
        return JSON.stringify({ error: 'Could not fill any shares at current prices' });
      }

      // Record snapshot if context provided
      if (agentContext) {
        snapshots.insertSnapshot(db, agentId, outcomeId, agentContext,
          JSON.stringify({ mid_price: orderBook.mid_price, spread: orderBook.spread, best_bid: orderBook.bids[0]?.price }));
      }

      // Add proceeds to cash
      agents.updateAgentCash(db, agentId, fill.filled_amount);

      // Record order as filled
      const orderId = trades.insertOrder(db, {
        agent_id: agentId,
        outcome_id: outcomeId,
        side: 'sell',
        order_type: 'market',
        requested_shares: sharesToSell,
        filled_amount: fill.filled_amount,
        filled_shares: fill.filled_shares,
        avg_fill_price: fill.avg_fill_price,
        status: 'filled',
      });

      // Calculate P&L
      const pnl = (fill.avg_fill_price - position.avg_entry_price) * fill.filled_shares;

      // Update or close position
      const remainingShares = position.shares - fill.filled_shares;
      trades.upsertPosition(db, agentId, outcomeId, remainingShares, position.avg_entry_price);

      // Record trade in history
      const outcome = trades.getOutcomeById(db, outcomeId);
      const market = outcome ? trades.getMarketByOutcomeId(db, outcomeId) : undefined;
      trades.recordTrade(db, {
        agent_id: agentId,
        outcome_id: outcomeId,
        market_question: market?.question ?? 'Unknown',
        outcome_name: outcome?.name ?? 'Unknown',
        entry_price: position.avg_entry_price,
        exit_price: fill.avg_fill_price,
        shares: fill.filled_shares,
        realized_pnl: pnl,
        reason: 'sold',
        snapshot_id: null,
        opened_at: position.updated_at ?? new Date().toISOString(),
      });

      // Auto-post to trade-results channel
      try {
        const tradeResultsChannel = db.prepare("SELECT channel_id FROM channels WHERE name = 'trade-results'").get() as { channel_id: number } | undefined;
        if (tradeResultsChannel) {
          const pnlSign = pnl >= 0 ? '+' : '';
          const post = `**Trade Closed** | ${market?.question ?? 'Unknown'} (${outcome?.name ?? '?'})\nEntry: $${position.avg_entry_price.toFixed(3)} → Exit: $${fill.avg_fill_price.toFixed(3)} | ${fill.filled_shares.toFixed(1)} shares | P&L: ${pnlSign}$${pnl.toFixed(2)}`;
          channels.createPost(db, tradeResultsChannel.channel_id, agentId, post);
        }
      } catch { /* don't fail the trade if posting fails */ }

      return JSON.stringify({
        order_id: orderId,
        status: 'filled',
        filled_shares: fill.filled_shares,
        filled_amount: fill.filled_amount,
        avg_fill_price: fill.avg_fill_price,
        slippage: fill.slippage,
        pnl,
      });
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

function buildWorkspaceHandlers(agentId: string): Record<string, ToolHandler> {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const { execSync } = require('child_process') as typeof import('child_process');

  const workspaceDir = path.join(process.cwd(), 'data', 'workspaces', agentId);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const safePath = (p: string) => {
    const resolved = path.resolve(workspaceDir, p);
    if (!resolved.startsWith(workspaceDir)) throw new Error('Path outside workspace');
    return resolved;
  };

  return {
    notepad_read: async (args) => {
      const filePath = safePath(String(args.path));
      if (!fs.existsSync(filePath)) return JSON.stringify({ error: 'File not found' });
      return fs.readFileSync(filePath, 'utf-8');
    },
    notepad_write: async (args) => {
      const filePath = safePath(String(args.path));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, String(args.content));
      return JSON.stringify({ ok: true, path: args.path });
    },
    notepad_list: async () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else files.push(path.relative(workspaceDir, full));
        }
      };
      walk(workspaceDir);
      return JSON.stringify(files);
    },
    run_code: async (args) => {
      const filePath = safePath(String(args.path));
      if (!fs.existsSync(filePath)) return JSON.stringify({ error: 'File not found' });
      const ext = path.extname(filePath);
      let cmd: string;
      if (ext === '.py') cmd = `python3 "${filePath}"`;
      else if (ext === '.js') cmd = `node "${filePath}"`;
      else return JSON.stringify({ error: `Unsupported file type: ${ext}. Use .py or .js` });
      try {
        const output = execSync(cmd, { cwd: workspaceDir, timeout: 30000, encoding: 'utf-8' });
        return output || '(no output)';
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        return JSON.stringify({ error: e.stderr || e.message || 'Execution failed' });
      }
    },
  };
}

function buildChannelHandlers(
  db: Database.Database,
  agentId: string,
): Record<string, ToolHandler> {
  return {
    hub_list_channels: async () => {
      return JSON.stringify(channels.listChannels(db));
    },
    hub_read: async (args) => {
      const posts = channels.getPosts(db, Number(args.channel_id), Number(args.limit) || 50);
      return JSON.stringify(posts);
    },
    hub_post: async (args) => {
      const post = channels.createPost(
        db,
        Number(args.channel_id),
        agentId,
        String(args.content),
        args.parent_id ? Number(args.parent_id) : undefined,
      );
      return JSON.stringify(post);
    },
  };
}

function buildSnapshotHandlers(
  db: Database.Database,
  agentId: string,
): Record<string, ToolHandler> {
  return {
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
  };
}

function buildMemoryHandlers(
  db: Database.Database,
  agentId: string,
): Record<string, ToolHandler> {
  return {
    memory_get: async () => {
      const memories = getMemory(db, agentId);
      return JSON.stringify(memories);
    },
    memory_set: async (args) => {
      upsertMemory(db, agentId, String(args.topic), String(args.content));
      return JSON.stringify({ success: true, topic: args.topic });
    },
  };
}

function buildWebSearchHandlers(apiKey: string): Record<string, ToolHandler> {
  return {
    web_search: async (args) => {
      if (!apiKey) return JSON.stringify({ error: 'Web Search API key not configured. Set it in Admin > Tools > Web Search.' });
      const query = String(args.query);
      const count = Math.min(Number(args.count) || 5, 20);
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(count));
      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
      });
      if (!res.ok) throw new Error(`Brave Search API error ${res.status}`);
      const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
      const results = (data.web?.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description }));
      return JSON.stringify(results);
    },
  };
}

// ---- Build Registry ----

function getToolConfig(db: Database.Database, toolName: string): Record<string, string> {
  const row = db.prepare('SELECT config_json FROM tools WHERE name = ?').get(toolName) as { config_json: string | null } | undefined;
  if (!row?.config_json) return {};
  try { return JSON.parse(row.config_json); } catch { return {}; }
}

export function buildToolRegistry(
  db: Database.Database,
  agentId: string,
  configVersionId: number,
  cycleIdFn: () => string,
): ToolRegistry {
  const registry = createToolRegistry();

  // Get enabled capabilities for this config version
  const enabledCaps = getVersionCapabilities(db, configVersionId)
    .filter(c => c.enabled === 1)
    .map(c => c.name);

  // If no capabilities configured, enable all tools by default
  const enableAll = enabledCaps.length === 0;

  // Build all handler maps
  const allHandlers: Record<string, { handler: ToolHandler; def: ToolDef; platform: string }> = {};

  const pmHandlers = buildPmHandlers(db, agentId);
  for (const [name, handler] of Object.entries(pmHandlers)) {
    if (PM_TOOL_DEFS[name]) {
      allHandlers[name] = { handler, def: PM_TOOL_DEFS[name], platform: 'polymarket' };
    }
  }

  const channelHandlers = buildChannelHandlers(db, agentId);
  for (const [name, handler] of Object.entries(channelHandlers)) {
    if (CHANNEL_TOOL_DEFS[name]) {
      allHandlers[name] = { handler, def: CHANNEL_TOOL_DEFS[name], platform: 'hub' };
    }
  }

  const snapshotHandlers = buildSnapshotHandlers(db, agentId);
  for (const [name, handler] of Object.entries(snapshotHandlers)) {
    if (PM_TOOL_DEFS[name]) {
      allHandlers[name] = { handler, def: PM_TOOL_DEFS[name], platform: 'polymarket' };
    }
  }

  const memoryHandlers = buildMemoryHandlers(db, agentId);
  for (const [name, handler] of Object.entries(memoryHandlers)) {
    if (MEMORY_TOOL_DEFS[name]) {
      allHandlers[name] = { handler, def: MEMORY_TOOL_DEFS[name], platform: 'agent' };
    }
  }

  const webConfig = getToolConfig(db, 'Web Search');
  const webHandlers = buildWebSearchHandlers(webConfig.api_key ?? '');
  for (const [name, handler] of Object.entries(webHandlers)) {
    if (WEB_TOOL_DEFS[name]) {
      allHandlers[name] = { handler, def: WEB_TOOL_DEFS[name], platform: 'web' };
    }
  }

  const workspaceHandlers = buildWorkspaceHandlers(agentId);
  for (const [name, handler] of Object.entries(workspaceHandlers)) {
    if (WORKSPACE_TOOL_DEFS[name]) {
      allHandlers[name] = { handler, def: WORKSPACE_TOOL_DEFS[name], platform: 'workspace' };
    }
  }

  // Register only enabled tools (or all if no capabilities configured)
  for (const [name, { handler, def, platform }] of Object.entries(allHandlers)) {
    if (enableAll || enabledCaps.includes(name)) {
      const wrapped = wrapWithLogging(db, agentId, cycleIdFn, name, platform, handler);
      registry.register(name, wrapped, def);
    }
  }

  return registry;
}
