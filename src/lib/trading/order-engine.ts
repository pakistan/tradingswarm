import type { OrderBookLevel, FillResult } from './types.js';

/**
 * Simulate a market buy against ask levels.
 * Specify either { amount } (dollars to spend) or { shares } (shares to acquire).
 */
export function simulateBuy(
  asks: OrderBookLevel[],
  target: { amount?: number; shares?: number },
): FillResult {
  if (asks.length === 0 || (!target.amount && !target.shares)) {
    return { filled_amount: 0, filled_shares: 0, avg_fill_price: 0, slippage: 0, levels_consumed: 0 };
  }

  const bestAsk = asks[0].price;
  let remainingAmount = target.amount ?? Infinity;
  let remainingShares = target.shares ?? Infinity;
  let totalCost = 0;
  let totalShares = 0;
  let levelsConsumed = 0;

  for (const level of asks) {
    if (remainingAmount <= 0 || remainingShares <= 0) break;
    levelsConsumed++;

    const maxSharesByAmount = remainingAmount / level.price;
    const maxSharesByTarget = remainingShares;
    const maxSharesByBook = level.size;
    const sharesToFill = Math.min(maxSharesByAmount, maxSharesByTarget, maxSharesByBook);

    const cost = sharesToFill * level.price;
    totalCost += cost;
    totalShares += sharesToFill;

    if (target.amount !== undefined) remainingAmount -= cost;
    if (target.shares !== undefined) remainingShares -= sharesToFill;
  }

  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
  const slippage = totalShares > 0 ? avgPrice - bestAsk : 0;

  return {
    filled_amount: totalCost,
    filled_shares: totalShares,
    avg_fill_price: avgPrice,
    slippage: Math.max(0, slippage),
    levels_consumed: levelsConsumed,
  };
}

/**
 * Simulate a market sell against bid levels.
 */
export function simulateSell(
  bids: OrderBookLevel[],
  sharesToSell: number,
): FillResult {
  if (bids.length === 0 || sharesToSell <= 0) {
    return { filled_amount: 0, filled_shares: 0, avg_fill_price: 0, slippage: 0, levels_consumed: 0 };
  }

  const bestBid = bids[0].price;
  let remaining = sharesToSell;
  let totalProceeds = 0;
  let totalShares = 0;
  let levelsConsumed = 0;

  for (const level of bids) {
    if (remaining <= 0) break;
    levelsConsumed++;

    const sharesToFill = Math.min(remaining, level.size);
    const proceeds = sharesToFill * level.price;
    totalProceeds += proceeds;
    totalShares += sharesToFill;
    remaining -= sharesToFill;
  }

  const avgPrice = totalShares > 0 ? totalProceeds / totalShares : 0;
  const slippage = totalShares > 0 ? bestBid - avgPrice : 0;

  return {
    filled_amount: totalProceeds,
    filled_shares: totalShares,
    avg_fill_price: avgPrice,
    slippage: Math.max(0, slippage),
    levels_consumed: levelsConsumed,
  };
}

/**
 * Simulate selling enough shares to generate a target dollar amount.
 */
export function simulateSellByAmount(
  bids: OrderBookLevel[],
  targetAmount: number,
): FillResult {
  if (bids.length === 0 || targetAmount <= 0) {
    return { filled_amount: 0, filled_shares: 0, avg_fill_price: 0, slippage: 0, levels_consumed: 0 };
  }

  const bestBid = bids[0].price;
  let remainingAmount = targetAmount;
  let totalProceeds = 0;
  let totalShares = 0;
  let levelsConsumed = 0;

  for (const level of bids) {
    if (remainingAmount <= 0) break;
    levelsConsumed++;

    const maxSharesForAmount = remainingAmount / level.price;
    const sharesToFill = Math.min(maxSharesForAmount, level.size);
    const proceeds = sharesToFill * level.price;
    totalProceeds += proceeds;
    totalShares += sharesToFill;
    remainingAmount -= proceeds;
  }

  const avgPrice = totalShares > 0 ? totalProceeds / totalShares : 0;
  const slippage = totalShares > 0 ? bestBid - avgPrice : 0;

  return {
    filled_amount: totalProceeds,
    filled_shares: totalShares,
    avg_fill_price: avgPrice,
    slippage: Math.max(0, slippage),
    levels_consumed: levelsConsumed,
  };
}
