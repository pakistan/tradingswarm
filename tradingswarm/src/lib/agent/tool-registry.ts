import type Database from 'better-sqlite3';
import type { ToolDef } from './llm-client';
import { insertToolLog } from '@/lib/db/observability';
import { getVersionCapabilities } from '@/lib/db/configs';
import * as trades from '@/lib/db/trades';
import * as channels from '@/lib/db/channels';
import * as snapshots from '@/lib/db/snapshots';
import * as agents from '@/lib/db/agents';
import { getMemory, upsertMemory } from '@/lib/db/observability';

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
  hub_create_channel: {
    name: 'hub_create_channel',
    description: 'Create a new coordination channel.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name' },
        description: { type: 'string', description: 'Channel description' },
      },
      required: ['name'],
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
  return {
    pm_markets: async (args) => {
      // We return locally cached markets; in a real implementation this would call the API
      const rows = db.prepare(
        `SELECT m.*, GROUP_CONCAT(o.outcome_id || ':' || o.name || ':' || COALESCE(o.current_price, 0)) as outcomes_str
         FROM markets m LEFT JOIN outcomes o ON o.market_id = m.market_id
         WHERE m.active = 1
         GROUP BY m.market_id
         ORDER BY m.volume DESC
         LIMIT ?`
      ).all(Number(args.limit) || 20);
      return JSON.stringify(rows);
    },
    pm_market_detail: async (args) => {
      const market = trades.getMarket(db, String(args.market_id));
      if (!market) return JSON.stringify({ error: 'Market not found' });
      const outcomes = db.prepare(`SELECT * FROM outcomes WHERE market_id = ?`).all(market.market_id);
      return JSON.stringify({ ...market, outcomes });
    },
    pm_positions: async () => {
      const positions = trades.getPositions(db, agentId);
      return JSON.stringify(positions);
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
      // Record as pending market order — the actual fill simulation happens externally
      const orderId = trades.insertOrder(db, {
        agent_id: agentId,
        outcome_id: String(args.outcome_id),
        side: 'buy',
        order_type: 'market',
        requested_amount: Number(args.amount),
        status: 'pending',
      });
      return JSON.stringify({ order_id: orderId, status: 'pending', message: 'Buy order submitted' });
    },
    pm_sell: async (args) => {
      const position = trades.getPosition(db, agentId, String(args.outcome_id));
      if (!position) return JSON.stringify({ error: 'No position found for this outcome' });
      const sharesToSell = Math.min(Number(args.shares), position.shares);
      const orderId = trades.insertOrder(db, {
        agent_id: agentId,
        outcome_id: String(args.outcome_id),
        side: 'sell',
        order_type: 'market',
        requested_shares: sharesToSell,
        status: 'pending',
      });
      return JSON.stringify({ order_id: orderId, status: 'pending', message: 'Sell order submitted' });
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
    hub_create_channel: async (args) => {
      const channel = channels.createChannel(
        db,
        String(args.name),
        args.description ? String(args.description) : undefined,
        agentId,
      );
      return JSON.stringify(channel);
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

// ---- Build Registry ----

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

  // Register only enabled tools (or all if no capabilities configured)
  for (const [name, { handler, def, platform }] of Object.entries(allHandlers)) {
    if (enableAll || enabledCaps.includes(name)) {
      const wrapped = wrapWithLogging(db, agentId, cycleIdFn, name, platform, handler);
      registry.register(name, wrapped, def);
    }
  }

  return registry;
}
