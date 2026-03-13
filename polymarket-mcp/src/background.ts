import type { PolymarketDB } from './db.js';
import type { PolymarketAPI } from './polymarket-api.js';
import { simulateBuy, simulateSell } from './order-engine.js';

/**
 * Check all pending limit orders against current market prices.
 * Called every 60 seconds by the background loop.
 */
export async function checkLimitOrders(db: PolymarketDB, api: PolymarketAPI): Promise<number> {
  const pending = db.getPendingOrders();
  let filled = 0;

  // Group by outcome to avoid duplicate API calls
  const byOutcome = new Map<string, typeof pending>();
  for (const order of pending) {
    const list = byOutcome.get(order.outcome_id) ?? [];
    list.push(order);
    byOutcome.set(order.outcome_id, list);
  }

  for (const [outcomeId, orders] of byOutcome) {
    let book;
    try {
      book = await api.getOrderBook(outcomeId);
    } catch {
      continue; // skip if API fails
    }

    for (const order of orders) {
      const limitPrice = order.limit_price!;
      const requestedShares = order.requested_shares ?? 0;
      const remainingShares = requestedShares - order.filled_shares;

      if (order.side === 'buy') {
        // Buy limit: fill when best ask <= limit price
        if (book.asks.length === 0 || book.asks[0].price > limitPrice) continue;

        // Fill at limit price or better
        const fill = simulateBuy(
          book.asks.filter(a => a.price <= limitPrice),
          { shares: remainingShares },
        );
        if (fill.filled_shares === 0) continue;

        db.transaction(() => {
          // Cash was already escrowed, refund overpayment
          const escrowed = remainingShares * limitPrice;
          const actualCost = fill.filled_amount;
          if (actualCost < escrowed) {
            db.updateCash(order.agent_id, escrowed - actualCost);
          }

          const existing = db.getPosition(order.agent_id, outcomeId);
          const totalShares = (existing?.shares ?? 0) + fill.filled_shares;
          const totalCost = (existing ? existing.avg_entry_price * existing.shares : 0) + fill.filled_amount;
          db.upsertPosition(order.agent_id, outcomeId, totalShares, totalCost / totalShares);

          const status = fill.filled_shares >= remainingShares ? 'filled' as const : 'partial' as const;
          db.updateOrderFill(
            order.order_id, order.filled_amount + fill.filled_amount,
            order.filled_shares + fill.filled_shares, fill.avg_fill_price, fill.slippage, status,
          );
        });
        filled++;
      } else {
        // Sell limit: fill when best bid >= limit price
        if (book.bids.length === 0 || book.bids[0].price < limitPrice) continue;

        const fill = simulateSell(
          book.bids.filter(b => b.price >= limitPrice),
          remainingShares,
        );
        if (fill.filled_shares === 0) continue;

        db.transaction(() => {
          db.updateCash(order.agent_id, fill.filled_amount);

          // Shares were already escrowed (removed from position)
          // Use escrowed_entry_price stored on the order for correct P&L
          const entryPrice = order.escrowed_entry_price ?? 0;
          const realizedPnl = (fill.avg_fill_price - entryPrice) * fill.filled_shares;
          const outcome = db.getOutcomeById(outcomeId);
          const market = db.getMarketByOutcomeId(outcomeId);
          db.recordTrade({
            agent_id: order.agent_id, outcome_id: outcomeId,
            market_question: market?.question ?? 'Unknown',
            outcome_name: outcome?.name ?? 'Unknown',
            entry_price: entryPrice,
            exit_price: fill.avg_fill_price, shares: fill.filled_shares,
            realized_pnl: realizedPnl, reason: 'sold',
            opened_at: order.created_at,
          });

          const status = fill.filled_shares >= remainingShares ? 'filled' as const : 'partial' as const;
          db.updateOrderFill(
            order.order_id, order.filled_amount + fill.filled_amount,
            order.filled_shares + fill.filled_shares, fill.avg_fill_price, fill.slippage, status,
          );
        });
        filled++;
      }
    }
  }

  return filled;
}

/**
 * Check for resolved markets and settle positions.
 * Called every 5 minutes by the background loop.
 */
export async function checkResolutions(db: PolymarketDB, api: PolymarketAPI): Promise<number> {
  // Check outcomes with positions OR pending limit orders
  const positionedOutcomes = db.getAllPositionedOutcomes();
  const pendingOrderOutcomes = db.getPendingOrders().map(o => o.outcome_id);
  const outcomeIds = [...new Set([...positionedOutcomes, ...pendingOrderOutcomes])];
  if (outcomeIds.length === 0) return 0;

  // Get unique market IDs for relevant outcomes
  const marketIds = new Set<string>();
  for (const oid of outcomeIds) {
    const market = db.getMarketByOutcomeId(oid);
    if (market) marketIds.add(market.market_id);
  }

  let settled = 0;

  for (const marketId of marketIds) {
    let detail;
    try {
      detail = await api.getMarketDetail(marketId);
    } catch {
      continue;
    }

    if (!detail.closed) continue;

    // Market resolved — parse outcomes
    const outcomeNames = JSON.parse(detail.outcomes ?? '[]') as string[];
    const outcomePrices = JSON.parse(detail.outcomePrices ?? '[]') as string[];
    const tokenIds = JSON.parse(detail.clobTokenIds ?? '[]') as string[];

    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      if (db.getResolution(tokenId)) continue; // already resolved

      const resolvedValue = parseFloat(outcomePrices[i]) >= 0.99 ? 1 : 0;
      db.insertResolution(tokenId, resolvedValue);

      // Cancel any pending limit orders for this outcome
      const pendingOrders = db.getPendingOrders(undefined, tokenId);
      for (const order of pendingOrders) {
        db.cancelOrder(order.order_id, order.agent_id);
        // Release escrow
        const remaining = (order.requested_shares ?? 0) - order.filled_shares;
        if (order.side === 'buy' && order.limit_price) {
          db.updateCash(order.agent_id, remaining * order.limit_price);
        }
        // Sell limit escrow: shares resolve at resolvedValue — pay out if winning
        if (order.side === 'sell') {
          db.updateCash(order.agent_id, remaining * resolvedValue);
        }
      }

      // Settle positions
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

          db.upsertPosition(pos.agent_id, tokenId, 0, 0); // deletes position
          settled++;
        });
      }
    }
  }

  return settled;
}

/**
 * Start background loops. Returns a cleanup function.
 */
export function startBackgroundLoops(db: PolymarketDB, api: PolymarketAPI): () => void {
  const limitOrderInterval = setInterval(() => {
    checkLimitOrders(db, api).catch(err => {
      console.error('[background] limit order check failed:', err);
    });
  }, 60_000);

  const resolutionInterval = setInterval(() => {
    checkResolutions(db, api).catch(err => {
      console.error('[background] resolution check failed:', err);
    });
  }, 300_000);

  return () => {
    clearInterval(limitOrderInterval);
    clearInterval(resolutionInterval);
  };
}
