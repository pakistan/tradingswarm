import type Database from 'better-sqlite3';
import type { GammaMarket } from '@/lib/platforms/polymarket/types.js';
import {
  getResolution,
  insertResolution,
  getPendingOrders,
  cancelOrder,
  getPositionsForOutcome,
  getOutcomeById,
  recordTrade,
  upsertPosition,
} from '@/lib/db/trades.js';
import { updateAgentCash } from '@/lib/db/agents.js';

export interface SettlementResult {
  outcome_results: Array<{ outcome_id: string; resolved_value: number }>;
  positions_settled: number;
}

/**
 * Settle a resolved market: record resolutions, cancel pending orders
 * (releasing escrow), and pay out / zero positions.
 * Accepts a raw Database.Database instance and uses the functional CRUD layer.
 */
export function settleMarket(db: Database.Database, detail: GammaMarket): SettlementResult {
  const outcomeNames = JSON.parse(detail.outcomes ?? '[]') as string[];
  const outcomePrices = JSON.parse(detail.outcomePrices ?? '[]') as string[];
  const tokenIds = JSON.parse(detail.clobTokenIds ?? '[]') as string[];

  let positionsSettled = 0;
  const outcomeResults: Array<{ outcome_id: string; resolved_value: number }> = [];

  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    const resolvedValue = parseFloat(outcomePrices[i]) >= 0.99 ? 1 : 0;
    outcomeResults.push({ outcome_id: tokenId, resolved_value: resolvedValue });

    if (getResolution(db, tokenId)) continue; // already resolved
    insertResolution(db, tokenId, resolvedValue);

    // Cancel pending limit orders, release escrow
    const pendingOrders = getPendingOrders(db, undefined, tokenId);
    for (const order of pendingOrders) {
      cancelOrder(db, order.order_id, order.agent_id);
      const remaining = (order.requested_shares ?? 0) - order.filled_shares;
      if (order.side === 'buy' && order.limit_price) {
        updateAgentCash(db, order.agent_id, remaining * order.limit_price);
      }
      if (order.side === 'sell') {
        updateAgentCash(db, order.agent_id, remaining * resolvedValue);
      }
    }

    // Settle all positions
    const positions = getPositionsForOutcome(db, tokenId);
    for (const pos of positions) {
      db.transaction(() => {
        const payout = pos.shares * resolvedValue;
        updateAgentCash(db, pos.agent_id, payout);

        const outcome = getOutcomeById(db, tokenId);
        recordTrade(db, {
          agent_id: pos.agent_id,
          outcome_id: tokenId,
          market_question: detail.question ?? 'Unknown',
          outcome_name: outcome?.name ?? outcomeNames[i] ?? 'Unknown',
          entry_price: pos.avg_entry_price,
          exit_price: resolvedValue,
          shares: pos.shares,
          realized_pnl: (resolvedValue - pos.avg_entry_price) * pos.shares,
          reason: resolvedValue === 1 ? 'resolved_win' : 'resolved_loss',
          snapshot_id: null,
          opened_at: pos.updated_at,
        });

        upsertPosition(db, pos.agent_id, tokenId, 0, 0);
        positionsSettled++;
      })();
    }
  }

  return { outcome_results: outcomeResults, positions_settled: positionsSettled };
}
