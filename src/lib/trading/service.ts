import type Database from 'better-sqlite3';
import * as trades from '@/lib/db/trades';
import * as agentsDb from '@/lib/db/agents';
import * as channels from '@/lib/db/channels';
import * as snapshots from '@/lib/db/snapshots';
import type { Platform } from '@/lib/platforms/types';
import { simulateBuy, simulateSell } from './order-engine';

const MAX_ORDER_PCT = 0.05;   // 5% of bankroll
const MAX_SLIPPAGE_PCT = 0.05; // 5% of best price

export interface TradeResult {
  success: boolean;
  order_id?: number;
  filled_shares?: number;
  filled_amount?: number;
  avg_fill_price?: number;
  slippage?: number;
  levels_consumed?: number;
  pnl?: number;
  remaining_cash?: number;
  error?: string;
}

export interface PositionSummary {
  agent_id: string;
  platform: string;
  outcome_id: string;
  outcome_name: string | null;
  market_question: string | null;
  shares: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  cost_basis: number;
  market_value: number | null;
}

export interface PortfolioSummary {
  agent_id: string;
  cash: number;
  initial_balance: number;
  positions: PositionSummary[];
  total_positions_value: number;
  total_portfolio_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  return_pct: number;
}

export interface SwarmSummary {
  total_aum: number;
  total_cash: number;
  total_positions_value: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  total_pnl: number;
  total_return_pct: number;
  num_agents: number;
  num_positions: number;
  num_trades: number;
  portfolios: PortfolioSummary[];
}

export class TradingService {
  private db: Database.Database;
  private platforms = new Map<string, Platform>();

  constructor(db: Database.Database) {
    this.db = db;
  }

  registerPlatform(platform: Platform): void {
    this.platforms.set(platform.name, platform);
  }

  private getPlatform(name: string): Platform {
    const platform = this.platforms.get(name);
    if (!platform) throw new Error(`Platform "${name}" not registered`);
    return platform;
  }

  private postToChannel(channelName: string, agentId: string, content: string): void {
    try {
      const ch = this.db.prepare('SELECT channel_id FROM channels WHERE name = ?').get(channelName) as { channel_id: number } | undefined;
      if (ch) channels.createPost(this.db, ch.channel_id, agentId, content);
    } catch { /* don't fail trades if posting fails */ }
  }

  // --- Execute trades ---

  async buy(platform: string, agentId: string, assetId: string, amount: number, agentContext?: string): Promise<TradeResult> {
    const agent = agentsDb.getAgent(this.db, agentId);
    if (!agent) return { success: false, error: 'Agent not found' };

    const maxOrder = agent.initial_balance * MAX_ORDER_PCT;
    if (amount > maxOrder) return { success: false, error: `Max order $${maxOrder.toFixed(0)} (${MAX_ORDER_PCT * 100}% of bankroll)` };
    if (agent.current_cash < amount) return { success: false, error: `Insufficient cash: $${agent.current_cash.toFixed(2)}` };

    const orderBook = await this.getPlatform(platform).getOrderBook(assetId);
    if (orderBook.asks.length === 0) return { success: false, error: 'No asks in order book' };

    const fill = simulateBuy(orderBook.asks, { amount });
    if (fill.filled_shares === 0) return { success: false, error: 'Could not fill any shares' };

    const bestAsk = orderBook.asks[0].price;
    if (fill.slippage / bestAsk > MAX_SLIPPAGE_PCT) {
      return {
        success: false,
        error: `Slippage too high (${((fill.slippage / bestAsk) * 100).toFixed(1)}%). Reduce order size.`,
        slippage: fill.slippage,
        avg_fill_price: fill.avg_fill_price,
      };
    }

    // Snapshot
    if (agentContext) {
      snapshots.insertSnapshot(this.db, agentId, assetId, agentContext,
        JSON.stringify({ mid_price: orderBook.mid_price, spread: orderBook.spread, best_ask: bestAsk }));
    }

    // Cache outcome if not already in DB (so dashboard can show names)
    if (!trades.getOutcomeById(this.db, assetId)) {
      // Create a placeholder market if needed, then cache the outcome
      const placeholderId = `${platform}_${assetId.slice(0, 20)}`;
      if (!trades.getMarket(this.db, placeholderId)) {
        trades.upsertMarket(this.db, { market_id: placeholderId, platform, question: assetId.slice(0, 50), category: null, description: null, resolution_source: null, end_date: null, active: 1, volume: 0, raw_json: null });
      }
      trades.upsertOutcome(this.db, { outcome_id: assetId, market_id: placeholderId, name: assetId.slice(0, 30), current_price: fill.avg_fill_price });
    }

    // Execute
    agentsDb.updateAgentCash(this.db, agentId, -fill.filled_amount);

    const orderId = trades.insertOrder(this.db, {
      agent_id: agentId, outcome_id: assetId, side: 'buy', order_type: 'market',
      requested_amount: amount, filled_amount: fill.filled_amount, filled_shares: fill.filled_shares,
      avg_fill_price: fill.avg_fill_price, status: 'filled', platform,
    });

    // Update position
    const existing = trades.getPosition(this.db, agentId, assetId);
    if (existing && existing.shares > 0) {
      const totalShares = existing.shares + fill.filled_shares;
      const totalCost = (existing.shares * existing.avg_entry_price) + fill.filled_amount;
      trades.upsertPosition(this.db, agentId, assetId, totalShares, totalCost / totalShares, platform);
    } else {
      trades.upsertPosition(this.db, agentId, assetId, fill.filled_shares, fill.avg_fill_price, platform);
    }
    // Set current price to fill price so dashboard always has something to show
    trades.updatePositionPrice(this.db, agentId, assetId, fill.avg_fill_price);

    // Auto-post to #positions
    this.postToChannel('positions', agentId,
      `**BUY** ${platform} | ${assetId.slice(0, 20)}... | ${fill.filled_shares.toFixed(1)} shares @ $${fill.avg_fill_price.toFixed(3)} ($${fill.filled_amount.toFixed(0)})`);

    return {
      success: true, order_id: orderId,
      filled_shares: fill.filled_shares, filled_amount: fill.filled_amount,
      avg_fill_price: fill.avg_fill_price, slippage: fill.slippage,
      levels_consumed: fill.levels_consumed,
      remaining_cash: agent.current_cash - fill.filled_amount,
    };
  }

  async sell(platform: string, agentId: string, assetId: string, shares: number, agentContext?: string): Promise<TradeResult> {
    const position = trades.getPosition(this.db, agentId, assetId);
    if (!position || position.shares <= 0) return { success: false, error: 'No position' };
    const sharesToSell = Math.min(shares, position.shares);

    const orderBook = await this.getPlatform(platform).getOrderBook(assetId);
    if (orderBook.bids.length === 0) return { success: false, error: 'No bids in order book' };

    const fill = simulateSell(orderBook.bids, sharesToSell);
    if (fill.filled_shares === 0) return { success: false, error: 'Could not fill any shares' };

    if (agentContext) {
      snapshots.insertSnapshot(this.db, agentId, assetId, agentContext,
        JSON.stringify({ mid_price: orderBook.mid_price, spread: orderBook.spread, best_bid: orderBook.bids[0]?.price }));
    }

    agentsDb.updateAgentCash(this.db, agentId, fill.filled_amount);

    const orderId = trades.insertOrder(this.db, {
      agent_id: agentId, outcome_id: assetId, side: 'sell', order_type: 'market',
      requested_shares: sharesToSell, filled_amount: fill.filled_amount, filled_shares: fill.filled_shares,
      avg_fill_price: fill.avg_fill_price, status: 'filled', platform,
    });

    const pnl = (fill.avg_fill_price - position.avg_entry_price) * fill.filled_shares;
    const remainingShares = position.shares - fill.filled_shares;
    trades.upsertPosition(this.db, agentId, assetId, remainingShares, position.avg_entry_price, platform);

    // Record in trade history
    const outcome = trades.getOutcomeById(this.db, assetId);
    const market = outcome ? trades.getMarketByOutcomeId(this.db, assetId) : undefined;
    trades.recordTrade(this.db, {
      agent_id: agentId, outcome_id: assetId,
      market_question: market?.question ?? 'Unknown',
      outcome_name: outcome?.name ?? 'Unknown',
      entry_price: position.avg_entry_price, exit_price: fill.avg_fill_price,
      shares: fill.filled_shares, realized_pnl: pnl,
      reason: 'sold', snapshot_id: null,
      opened_at: position.updated_at ?? new Date().toISOString(),
    });

    // Auto-post to #positions
    try {
      const sign = pnl >= 0 ? '+' : '';
      this.postToChannel('positions', agentId,
        `**SELL** ${platform} | ${market?.question ?? assetId.slice(0, 20) + '...'} (${outcome?.name ?? '?'}) | ${fill.filled_shares.toFixed(1)} shares @ $${fill.avg_fill_price.toFixed(3)} | P&L: ${sign}$${pnl.toFixed(2)}`);
    } catch { /* don't fail trade if post fails */ }

    return {
      success: true, order_id: orderId,
      filled_shares: fill.filled_shares, filled_amount: fill.filled_amount,
      avg_fill_price: fill.avg_fill_price, slippage: fill.slippage, pnl,
    };
  }

  // --- Portfolio queries ---

  async getPortfolio(agentId: string): Promise<PortfolioSummary> {
    const agent = agentsDb.getAgent(this.db, agentId);
    if (!agent) throw new Error('Agent not found');

    const positions = trades.getPositions(this.db, agentId);

    // Update prices from live market
    const summaries: PositionSummary[] = [];
    for (const p of positions) {
      let currentPrice = p.current_price;
      try {
        currentPrice = await this.getPlatform(p.platform).getCurrentPrice(p.outcome_id);
        trades.updatePositionPrice(this.db, agentId, p.outcome_id, currentPrice);
      } catch { /* keep old price */ }

      const outcome = trades.getOutcomeById(this.db, p.outcome_id);
      const market = outcome ? trades.getMarketByOutcomeId(this.db, p.outcome_id) : undefined;
      const unrealizedPnl = currentPrice ? (currentPrice - p.avg_entry_price) * p.shares : null;

      summaries.push({
        agent_id: agentId, platform: p.platform ?? 'polymarket', outcome_id: p.outcome_id,
        outcome_name: outcome?.name ?? null,
        market_question: market?.question ?? null,
        shares: p.shares, avg_entry_price: p.avg_entry_price,
        current_price: currentPrice,
        unrealized_pnl: unrealizedPnl,
        cost_basis: p.shares * p.avg_entry_price,
        market_value: currentPrice ? p.shares * currentPrice : null,
      });
    }

    const realizedPnl = trades.getTotalRealizedPnl(this.db, agentId);
    const unrealizedPnl = summaries.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
    const positionsValue = summaries.reduce((sum, p) => sum + (p.market_value ?? p.cost_basis), 0);

    return {
      agent_id: agentId,
      cash: agent.current_cash,
      initial_balance: agent.initial_balance,
      positions: summaries,
      total_positions_value: positionsValue,
      total_portfolio_value: agent.current_cash + positionsValue,
      realized_pnl: realizedPnl,
      unrealized_pnl: unrealizedPnl,
      total_pnl: realizedPnl + unrealizedPnl,
      return_pct: ((realizedPnl + unrealizedPnl) / agent.initial_balance) * 100,
    };
  }

  getSwarmSummary(): SwarmSummary {
    const agents = agentsDb.listAgents(this.db);
    const allPositions = this.db.prepare('SELECT * FROM positions WHERE shares > 0').all() as Array<{ agent_id: string; outcome_id: string; shares: number; avg_entry_price: number; current_price: number | null; unrealized_pnl: number | null }>;
    const tradeCount = (this.db.prepare('SELECT COUNT(*) as c FROM orders WHERE status = ?').get('filled') as { c: number }).c;

    let totalCash = 0;
    let totalInitial = 0;
    let totalRealized = 0;
    let totalUnrealized = 0;
    let totalPositionsValue = 0;

    const portfolios: PortfolioSummary[] = agents.map(agent => {
      const positions = allPositions.filter(p => p.agent_id === agent.agent_id);
      const realized = trades.getTotalRealizedPnl(this.db, agent.agent_id);
      const unrealized = positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
      const posValue = positions.reduce((s, p) => s + (p.current_price ? p.shares * p.current_price : p.shares * p.avg_entry_price), 0);

      totalCash += agent.current_cash;
      totalInitial += agent.initial_balance;
      totalRealized += realized;
      totalUnrealized += unrealized;
      totalPositionsValue += posValue;

      return {
        agent_id: agent.agent_id,
        cash: agent.current_cash,
        initial_balance: agent.initial_balance,
        positions: positions.map(p => {
          const outcome = trades.getOutcomeById(this.db, p.outcome_id);
          const market = outcome ? trades.getMarketByOutcomeId(this.db, p.outcome_id) : undefined;
          return {
            agent_id: p.agent_id, platform: p.platform ?? 'polymarket', outcome_id: p.outcome_id,
            outcome_name: outcome?.name ?? null, market_question: market?.question ?? null,
            shares: p.shares, avg_entry_price: p.avg_entry_price,
            current_price: p.current_price, unrealized_pnl: p.unrealized_pnl,
            cost_basis: p.shares * p.avg_entry_price,
            market_value: p.current_price ? p.shares * p.current_price : null,
          };
        }),
        total_positions_value: posValue,
        total_portfolio_value: agent.current_cash + posValue,
        realized_pnl: realized, unrealized_pnl: unrealized,
        total_pnl: realized + unrealized,
        return_pct: ((realized + unrealized) / agent.initial_balance) * 100,
      };
    });

    const totalPnl = totalRealized + totalUnrealized;
    return {
      total_aum: totalCash + totalPositionsValue,
      total_cash: totalCash, total_positions_value: totalPositionsValue,
      total_realized_pnl: totalRealized, total_unrealized_pnl: totalUnrealized,
      total_pnl: totalPnl,
      total_return_pct: totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0,
      num_agents: agents.length,
      num_positions: allPositions.length,
      num_trades: tradeCount,
      portfolios,
    };
  }
}
