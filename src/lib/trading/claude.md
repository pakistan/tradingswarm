# Trading Module

Trade execution, position management, P&L calculation, market indexing.

## Files

### `service.ts` — TradingService
Central class for all trade operations. Tool handlers call this, never trade directly.

```typescript
const service = new TradingService(db);
service.registerPlatform(new PolymarketPlatform());
service.registerPlatform(new BinancePlatform());

// Execute trades
service.buy(platform, agentId, assetId, amount, context?)  → TradeResult
service.sell(platform, agentId, assetId, shares, context?)  → TradeResult

// Portfolio queries
service.getPortfolio(agentId)  → PortfolioSummary (fetches live prices)
service.getSwarmSummary()      → SwarmSummary (all agents, no live price fetch)
```

**Guardrails (hardcoded):**
- Max order: 5% of agent's initial_balance ($500 on $10k)
- Max slippage: 5% of best price
- Auto-posts to #positions channel on every buy and sell
- Sets current_price on position at buy time

**P&L model (NETTING):**
- One position per agent per asset. Fills aggregate (weighted avg entry price).
- Realized P&L = (exit_price - entry_price) × shares — only on sell
- Unrealized P&L = (current_mid - entry_price) × shares — live from platform
- Sells record to trade_history and auto-post to #positions

### `order-engine.ts` — Fill Simulation
Pure functions. No DB, no API calls.
- `simulateBuy(asks[], { amount?, shares? })` → FillResult
- `simulateSell(bids[], sharesToSell)` → FillResult
- `simulateSellByAmount(bids[], targetAmount)` → FillResult

Walks the order book level by level. Calculates slippage, levels consumed, avg fill price.

### `indexer.ts` — MarketIndexer
Pulls assets from all platforms, embeds titles with OpenAI, finds cross-market links.

```typescript
const indexer = new MarketIndexer(db, openaiKey, { linkModel: 'gpt-4o' });
await indexer.runIndex();          // Pull + embed all assets
await indexer.generateLLMLinks();  // Ask LLM for correlations
```

**Tables:** market_index (id, platform, asset_id, title, embedding), market_links (market_a_id, market_b_id, similarity, reasoning)

**Known issues:**
- Polymarket should use events endpoint for indexing, not markets endpoint
- Embedding similarity threshold (0.82) rarely matches cross-platform — LLM links are more useful
- LLM link quality depends on prompt — too strict = 0 links, too loose = noise
- Clean market titles before sending to LLM (strip "before GTA VI?" etc.)

### `scanner.ts` — MarketScanner
Reads pre-computed signals from market_index/market_links tables. Fast, no API calls.

```typescript
const scanner = new MarketScanner(db);
scanner.scan(minSpread?)  → SpreadSignal[]
scanner.getLinks(platform, assetId)  → linked instruments
scanner.stats()  → { total_indexed, total_links, by_platform }
```

### `settlement.ts` — Market Resolution
Settles positions when a prediction market resolves. Calculates final P&L, pays out winners.

### `types.ts` — OrderBook, OrderBookLevel, FillResult
Shared types used by order engine and platform adapters.

## Common Mistakes
- Putting trade logic in tool handlers — always go through TradingService
- Forgetting to register platforms before calling buy/sell
- Not calling updatePositionPrice after buy — dashboard shows null current_price
- The scanner reads from DB (pre-computed), the indexer writes to DB — don't confuse them
