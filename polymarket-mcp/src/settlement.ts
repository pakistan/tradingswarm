import type { PolymarketDB } from './db.js';
import type { GammaMarket } from './types.js';

export interface SettlementResult {
  outcome_results: Array<{ outcome_id: string; resolved_value: number }>;
  positions_settled: number;
}

/**
 * Settle a resolved market: record resolutions, cancel pending orders
 * (releasing escrow), and pay out / zero positions.
 * Shared by pm_check_resolution tool and the background resolution tracker.
 */
export function settleMarket(db: PolymarketDB, detail: GammaMarket): SettlementResult {
  const outcomeNames = JSON.parse(detail.outcomes ?? '[]') as string[];
  const outcomePrices = JSON.parse(detail.outcomePrices ?? '[]') as string[];
  const tokenIds = JSON.parse(detail.clobTokenIds ?? '[]') as string[];

  let positionsSettled = 0;
  const outcomeResults: Array<{ outcome_id: string; resolved_value: number }> = [];

  for (let i = 0; i < tokenIds.length; i++) {
    const tokenId = tokenIds[i];
    const resolvedValue = parseFloat(outcomePrices[i]) >= 0.99 ? 1 : 0;
    outcomeResults.push({ outcome_id: tokenId, resolved_value: resolvedValue });

    if (db.getResolution(tokenId)) continue; // already resolved
    db.insertResolution(tokenId, resolvedValue);

    // Cancel pending limit orders, release escrow
    const pendingOrders = db.getPendingOrders(undefined, tokenId);
    for (const order of pendingOrders) {
      db.cancelOrder(order.order_id, order.agent_id);
      const remaining = (order.requested_shares ?? 0) - order.filled_shares;
      if (order.side === 'buy' && order.limit_price) {
        db.updateCash(order.agent_id, remaining * order.limit_price);
      }
      if (order.side === 'sell') {
        db.updateCash(order.agent_id, remaining * resolvedValue);
      }
    }

    // Settle all positions
    const positions = db.getPositionsForOutcome(tokenId);
    for (const pos of positions) {
      db.transaction(() => {
        const payout = pos.shares * resolvedValue;
        db.updateCash(pos.agent_id, payout);

        const outcome = db.getOutcomeById(tokenId);
        db.recordTrade({
          agent_id: pos.agent_id, outcome_id: tokenId,
          market_question: detail.question ?? 'Unknown',
          outcome_name: outcome?.name ?? outcomeNames[i] ?? 'Unknown',
          entry_price: pos.avg_entry_price, exit_price: resolvedValue,
          shares: pos.shares,
          realized_pnl: (resolvedValue - pos.avg_entry_price) * pos.shares,
          reason: resolvedValue === 1 ? 'resolved_win' : 'resolved_loss',
          opened_at: pos.updated_at,
        });

        db.upsertPosition(pos.agent_id, tokenId, 0, 0);
        positionsSettled++;
      });
    }
  }

  return { outcome_results: outcomeResults, positions_settled: positionsSettled };
}
