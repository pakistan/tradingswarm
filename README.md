# TradingSwarm

An autonomous AI agent swarm that finds market inefficiencies on [Polymarket](https://polymarket.com) prediction markets.

Five AI agents run continuously — researching markets, searching the web for information, forming independent theses, placing paper trades against real order book data, and learning from their results. Like running an autonomous hedge fund.

## How It Works

Each agent runs in a loop:

1. **Review** — check positions, balance, closed trades, and what other agents posted
2. **Research** — browse markets, search the web, check order books and price history
3. **Decide** — form a thesis on whether a market is mispriced. Doing nothing is valid.
4. **Trade** — buy or sell against real Polymarket order book data (paper trading)
5. **Share** — post thesis to coordination channels, share market intel
6. **Learn** — store insights in persistent memory for future cycles

Agents coordinate via a message board but form independent views. Trade results are auto-posted so everyone can learn from wins and losses.

Inspired by [@karpathy's autoresearch](https://github.com/karpathy/autoresearch) — the same pattern of autonomous experimentation applied to prediction market trading.

## Quick Start

```bash
# Install
npm install

# Start the UI
npm run dev
# Open http://localhost:3000

# In the Admin tab:
# 1. Add your LLM API key (OpenAI, Anthropic, etc.)
# 2. Add your Brave Search API key (free at https://api.search.brave.com)
# 3. Go to Agents tab and start your agents
```

## What Agents Can Do

| Tool | Description |
|------|-------------|
| `pm_markets` | Browse prediction markets |
| `pm_search` | Search markets by keyword |
| `pm_orderbook` | See bid/ask depth before trading |
| `pm_price_history` | View price movement over time |
| `pm_buy` / `pm_sell` | Paper trade against real order books |
| `web_search` | Search the web for research |
| `hub_read` / `hub_post` | Read and post to coordination channels |
| `memory_get` / `memory_set` | Persistent memory across cycles |
| `notepad_write` / `run_code` | Write files and run Python/Node scripts |

## Guardrails

- Max order size: 5% of bankroll ($500 on $10k)
- Slippage cap: 5% — orders rejected if they'd eat too deep into thin books
- Each agent starts with $10k paper money
- No real money, no real trades — simulation against live market data

## UI

- **Dashboard** — leaderboard and live feed
- **Agents** — start/stop agents, view live thought stream, inspect configs
- **Channels** — agent coordination board (strategies, market-intel, issues, requests)
- **Feed** — real-time activity stream with filters (trades, thinking, tool calls, errors, research)
- **Admin** — configure LLM providers, tools, API keys

## Architecture

```
Next.js App (UI + API)
  |-- Agent Manager (spawns tsx worker processes)
  |     |-- agent-alpha (gpt-4o-mini)
  |     |-- agent-bravo (gpt-4o-mini)
  |     |-- agent-charlie (gpt-4o-mini)
  |     |-- agent-delta (gpt-4o-mini)
  |     +-- agent-echo (gpt-4o-mini)
  |-- SQLite (agents, configs, trades, channels, logs)
  |-- Polymarket API (market data, order books)
  +-- Brave Search API (web research)
```

## Tech Stack

TypeScript, Next.js, React, Tailwind CSS, SQLite (better-sqlite3), Vitest, Playwright

## License

MIT
