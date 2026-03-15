# CLAUDE.md

## What This Project Is

TradingSwarm is an autonomous AI agent swarm that finds market inefficiencies on Polymarket prediction markets. Think of it as an autonomous hedge fund — agents research, trade, learn, and coordinate without human intervention.

Inspired by Karpathy's autoresearch: agents run in a continuous loop, form hypotheses, test them with real trades, keep what works, discard what doesn't, and get smarter over time.

## Commands

```bash
npm install            # Install dependencies
npm run dev            # Next.js dev server (http://localhost:3000)
npm run build          # Production build
npm test               # Vitest unit tests
npx playwright test    # E2E smoke tests (requires dev server running)
```

## Project Structure

```
src/
  app/                  # Next.js pages and API routes
    admin/              # Admin page (providers, tools, rules, settings)
    agents/             # Agent management (live, offline, configs)
    channels/           # Coordination message board
    feed/               # Real-time activity feed with filters
    api/                # REST API routes
  components/           # React components
  lib/
    agent/              # Agent runtime
      agent-loop.ts     # Main agent cycle (research → trade → learn)
      agent-manager.ts  # Process spawning and lifecycle
      worker.ts         # Worker entry point (spawned via tsx)
      llm-client.ts     # LLM abstraction (OpenAI, Anthropic, etc.)
      tool-registry.ts  # All tool definitions and handlers
      mechanics.md      # System mechanics injected into agent prompt
      singleton.ts      # AgentManager singleton
    db/                 # SQLite CRUD layer
      schema.ts         # 22-table schema with tool seeding
      agents.ts         # Agent CRUD
      configs.ts        # Config versioning, rules, tools, providers
      trades.ts         # Markets, orders, positions, trade history
      channels.ts       # Coordination channels and posts
      observability.ts  # Tool logs, events, memory, snapshots
    platforms/
      polymarket/       # Polymarket Gamma + CLOB API client
    trading/
      order-engine.ts   # Order book fill simulation
      settlement.ts     # Market resolution logic
  styles/
    globals.css         # Tailwind + fonts
```

## Tech Stack

- TypeScript, Next.js 14, React 18, Tailwind CSS
- SQLite (better-sqlite3, WAL mode)
- LLM: OpenAI, Anthropic, DeepSeek, Moonshot, Google (pluggable)
- Polymarket Gamma + CLOB APIs (public, no auth needed for reads)
- Brave Search API (web search for agents)
- Vitest + Playwright for testing

## Key Design Principles

- **Agents are autonomous** — they run indefinitely, never ask for instructions, and decide what to trade
- **No strategy prescription** — agents are smart LLMs; we give them tools and goals, not tactics
- **Learn over time** — agents use persistent memory to accumulate knowledge across cycles
- **Coordinate without groupthink** — agents share intel via channels but form independent views
- **Hard guardrails only** — max 5% bankroll per trade, 5% slippage cap (mechanical limits, not strategy advice)

## Agent Tools (25 capabilities)

**Polymarket:** pm_markets, pm_market_detail, pm_orderbook, pm_price_history, pm_search, pm_buy, pm_sell, pm_orders, pm_cancel_order, pm_cancel_all, pm_balance, pm_positions, pm_history, pm_leaderboard, pm_snapshot
**Coordination:** hub_list_channels, hub_read, hub_post
**Research:** web_search
**Memory:** memory_get, memory_set
**Workspace:** notepad_read, notepad_write, notepad_list, run_code

## Conventions

- Tool names: `pm_*` for polymarket, `hub_*` for channels, `web_*` for search
- Agents spawned as clean tsx processes (not forked from Next.js)
- Database: parameterized queries, transactions for multi-step mutations
- API rate limiting: 200ms intervals with exponential backoff
