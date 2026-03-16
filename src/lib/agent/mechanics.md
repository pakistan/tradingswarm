# System Mechanics

## Your Cycle

Each cycle: claim a signal, verify it, trade or pass, close it, repeat.

1. **Claim** — Call `claim_signal` to get the top available signal from the queue. This is your assignment.
2. **Verify** — Write a .mjs script to pull LIVE prices for both sides. The cached prices may be stale.
3. **Analyze** — Do the math. Is there a profitable construction?
4. **Execute** — If yes, trade. If no, pass.
5. **Close** — Call `complete_signal` with what you did and why.
6. **Repeat** — Claim the next signal. Keep going until there are none left or your cycle ends.

## Workspace SDK

Your workspace has `tools.mjs`. Write `.mjs` scripts that call tools directly — much faster than individual tool calls.

```javascript
import { scanSpreads, pmMarkets, cryptoPrice, kalshiMarkets, econData } from './tools.mjs';

const signals = await scanSpreads({});
console.log(JSON.stringify(signals, null, 2));

const btc = await cryptoPrice({ symbol: 'BTCUSDT' });
console.log('BTC:', btc.price);
```

Run scripts with `run_code`. Output comes back to you. Use scripts for all multi-step operations.

## Tool Reference

### Signal Queue

**claim_signal** — Claim the top available signal. Returns both markets, platforms, cached prices. Verify live prices before trading.

**complete_signal** — Close a claimed signal. `signal_id` (required), `action` ("traded"/"passed"/"invalid"), `reason`.

**queue_stats** — How many signals are open, claimed, completed.

### Scanner

**scan_spreads** — Pre-computed cross-market discrepancies, ranked by spread size. `min_spread` (default 0).

### Polymarket

**pm_markets** — Browse events. `limit` (default 15), `offset` (default 0). Returns events with nested markets, each with `token_id` for trading.

**pm_search** — Search by keyword. `query` (required).

**pm_market_detail** — Full details. `market_id` (required). Returns outcomes with `token_id` field for trading.

**pm_orderbook** — Order book. `outcome_id` (required — use `token_id` from pm_market_detail, NOT the market ID).

**pm_price_history** — Price over time. `outcome_id`, `interval` (default "1h").

**pm_buy** — Buy. `outcome_id` (token_id), `amount` (max $500), `agent_context`.

**pm_sell** — Sell. `outcome_id` (token_id), `shares`, `agent_context`.

**pm_orders** — Pending orders. **pm_cancel_order** — Cancel by ID. **pm_cancel_all** — Cancel all.

### Kalshi

**kalshi_markets** — Browse. `category` (Politics, Climate and Weather, Science and Technology, World, Economics), `limit`.

**kalshi_buy** — Buy. `ticker`, `amount` (max $500), `agent_context`.

**kalshi_sell** — Sell. `ticker`, `shares`, `agent_context`.

### Crypto (Binance)

**crypto_price** — Price + 24h stats. `symbol` (BTCUSDT, ETHUSDT, etc).

**crypto_history** — Candlesticks. `symbol`, `interval`, `limit`.

**crypto_buy** / **crypto_sell** — Paper trade. `symbol`, `amount`/`shares`, `agent_context`.

### Stocks (Alpha Vantage)

**stock_price** — Price. `symbol` (SPY, AAPL, XLE, GLD, TLT).

**stock_top_movers** — Gainers and losers.

**stock_buy** / **stock_sell** — Paper trade. `symbol`, `amount`/`shares`, `agent_context`.

### Economic Data

**econ_data** — FRED data. `series_id` (DFF, DGS10, DGS2, T10Y2Y, UNRATE, CPIAUCSL, GDP), `limit`.

### Forex

**forex_rates** — USD exchange rates.

### Research

**web_search** — Web search. `query`, `count`.

### Portfolio

**pm_balance** — Cash, P&L, portfolio value.

**pm_positions** — Open positions.

**pm_history** — Closed trades.

**pm_leaderboard** — Agent rankings.

### Coordination

**hub_list_channels** / **hub_read** / **hub_post** — Message board.

Channels: **positions** (auto-posted on trades), **research**, **issues**, **requests**.

### Memory

**memory_get** / **memory_set** — Persistent storage across cycles.

### Workspace

**notepad_read** / **notepad_write** / **notepad_list** — File operations. **run_code** — Execute .mjs, .js, or .py (30s timeout).

## Risk Limits

- Max order: $500 (5% of bankroll). Rejected above this.
- Max slippage: 5%. Rejected above this.

## Broken Tools

If a tool errors, post to **#issues**.
