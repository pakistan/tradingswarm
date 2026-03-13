# Polymarket Agent Ecosystem Design

## Overview

An autonomous agent swarm that paper-trades on Polymarket, inspired by Karpathy's autoresearch prompt. Each agent runs a continuous loop: scan markets, research, build models, trade, monitor positions, and share post-mortems. Agents never stop, never ask — they are fully autonomous.

The system extends the existing NaanHub infrastructure with a new Polymarket MCP server for market data and paper trading.

## System Architecture

```
Orchestrator (Claude Code)
  |
  +-- spawns Agent 1, 2, ... N (each with own $10k bankroll)
  |
  +-- MCP: NaanHub --------- post-mortems, dependency requests, tool sharing via DAG
  |
  +-- MCP: Polymarket ------- market data (Gamma + CLOB APIs), paper trading, portfolio
  |
  +-- Workspaces ------------ agents/<agent_id>/ for code, models, scripts
```

### Component Responsibilities

| Component | Role |
|---|---|
| **NaanHub MCP** (existing) | Coordination: post-mortem channel, dependency request channel, DAG for sharing proven tools/models |
| **Polymarket MCP** (new) | Market data from both Gamma and CLOB APIs, order book simulation, paper trading engine, portfolio tracking |
| **Agent workspaces** | Each agent gets `agents/<agent_id>/` to write/run Python code — models, scrapers, backtests |
| **Orchestrator** | Spawn agents, monitor leaderboard, approve dependency requests, respawn failed agents |

### Design Principles

- **Agent autonomy** — Agents decide what to trade, how to research, what tools to build. Orchestrator never assigns markets or strategies.
- **Private theses, public post-mortems** — Active positions and reasoning are private. Only closed trades get shared on the board. This prevents groupthink and front-running.
- **Code as a first-class tool** — Agents can write and run Python to build models, backtest, analyze data. Proven tools get committed to the DAG for others to discover.
- **Order book realism** — Paper trades simulate against real order book depth. Slippage and liquidity matter.

---

## Polymarket MCP Server

### Technology

- TypeScript + Node.js (same stack as NaanHub)
- MCP SDK (`@modelcontextprotocol/sdk`)
- SQLite via `better-sqlite3` for paper trading state
- Polymarket Gamma API (public, no auth) for market metadata
- Polymarket CLOB API (authenticated) for order book depth

### Tools — Market Data (4 tools)

#### `pm_markets`
Search and browse active prediction markets.

- **Input:** `{ query?: string, category?: string, min_volume?: number, max_end_date?: string, limit?: number, offset?: number }`
- **Output:** Array of markets: `{ market_id, question, category, outcomes: [{ name, price }], volume, end_date, active }`
- **Source:** Gamma API
- **Caching:** Results cached in SQLite `markets` table, refreshed if older than 5 minutes

#### `pm_market_detail`
Full detail on a single market.

- **Input:** `{ market_id: string }`
- **Output:** `{ market_id, question, description, category, resolution_source, rules, outcomes: [{ name, price, price_history_24h }], volume, end_date, created_at }`
- **Source:** Gamma API

#### `pm_orderbook`
Live order book depth for a specific outcome.

- **Input:** `{ outcome_id: string }`
- **Output:** `{ outcome_id, bids: [{ price, size }], asks: [{ price, size }], spread, mid_price, timestamp }`
- **Source:** CLOB API
- **Purpose:** Agents check liquidity before trading. Paper trading engine uses this for fill simulation.

#### `pm_price_history`
Historical price movement for an outcome.

- **Input:** `{ outcome_id: string, interval?: "1h" | "6h" | "1d", limit?: number }`
- **Output:** Array of `{ timestamp, price, volume }`
- **Source:** Gamma API or CLOB API depending on granularity

### Tools — Paper Trading (4 tools)

All paper trading tools are isolated by `agent_id`. No agent can see or affect another's account.

#### `pm_buy`
Place a simulated market buy order.

- **Input:** `{ agent_id: string, outcome_id: string, amount: number }`
- **Output:** `{ order_id, outcome_id, side: "buy", filled_amount, avg_fill_price, slippage, shares_acquired, new_cash_balance }`
- **Logic:**
  1. Fetch live order book via CLOB API
  2. Walk the ask side, filling against resting orders at each price level
  3. Calculate average fill price and slippage
  4. Deduct cash, create/update position record
- **Constraints:** Cannot exceed available cash balance. Amount must be > 0.

#### `pm_sell`
Sell/exit a position.

- **Input:** `{ agent_id: string, outcome_id: string, shares: number }`
- **Output:** `{ order_id, outcome_id, side: "sell", filled_shares, avg_fill_price, slippage, proceeds, realized_pnl, new_cash_balance }`
- **Logic:** Same as buy but walks the bid side. Updates position, records realized P&L.
- **Constraints:** Cannot sell more shares than held.

#### `pm_limit_order`
Place a resting limit order.

- **Input:** `{ agent_id: string, outcome_id: string, side: "buy" | "sell", shares: number, price: number }`
- **Output:** `{ order_id, status: "pending", outcome_id, side, shares, price }`
- **Logic:** Order rests until market price crosses the limit. Checked on each `pm_positions` or `pm_orderbook` call for that outcome.
- **Constraints:** Buy limit orders escrow cash. Sell limit orders escrow shares.

#### `pm_cancel_order`
Cancel a pending limit order.

- **Input:** `{ agent_id: string, order_id: string }`
- **Output:** `{ order_id, status: "cancelled", released_amount }`
- **Logic:** Release escrowed cash or shares.

### Tools — Portfolio & Results (4 tools)

#### `pm_positions`
Current open positions with mark-to-market P&L.

- **Input:** `{ agent_id: string }`
- **Output:** Array of `{ outcome_id, market_question, outcome_name, shares, avg_entry_price, current_price, unrealized_pnl, unrealized_pnl_pct }`
- **Side effect:** Checks pending limit orders for fills against current prices.

#### `pm_balance`
Account summary.

- **Input:** `{ agent_id: string }`
- **Output:** `{ agent_id, cash, positions_value, total_portfolio_value, total_realized_pnl, total_unrealized_pnl, num_open_positions, num_closed_trades }`

#### `pm_history`
Closed/resolved trade history. Raw material for post-mortems.

- **Input:** `{ agent_id: string, limit?: number }`
- **Output:** Array of `{ outcome_id, market_question, outcome_name, side, entry_price, exit_price, shares, realized_pnl, reason: "sold" | "resolved_win" | "resolved_loss", opened_at, closed_at }`

#### `pm_leaderboard`
Cross-agent performance comparison. Visible to orchestrator and all agents.

- **Input:** `{ }`
- **Output:** Array of `{ agent_id, total_return_pct, realized_pnl, unrealized_pnl, win_rate, num_trades, best_trade, worst_trade }`

---

## Database Schema

### SQLite file: `~/.polymarket-mcp/polymarket.db`

```sql
-- Market data cache
CREATE TABLE markets (
    market_id   TEXT PRIMARY KEY,
    question    TEXT NOT NULL,
    category    TEXT,
    description TEXT,
    resolution_source TEXT,
    volume      REAL,
    end_date    TEXT,
    active      INTEGER DEFAULT 1,
    raw_json    TEXT,
    last_synced TEXT NOT NULL
);

CREATE TABLE outcomes (
    outcome_id  TEXT PRIMARY KEY,
    market_id   TEXT NOT NULL REFERENCES markets(market_id),
    name        TEXT NOT NULL,
    current_price REAL,
    last_synced TEXT NOT NULL
);

-- Paper trading
CREATE TABLE agents (
    agent_id      TEXT PRIMARY KEY,
    initial_balance REAL NOT NULL DEFAULT 10000.0,
    current_cash  REAL NOT NULL DEFAULT 10000.0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orders (
    order_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
    outcome_id    TEXT NOT NULL,
    side          TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type    TEXT NOT NULL CHECK (order_type IN ('market', 'limit')),
    requested_amount REAL,
    limit_price   REAL,
    filled_amount REAL DEFAULT 0,
    filled_shares REAL DEFAULT 0,
    avg_fill_price REAL,
    slippage      REAL,
    status        TEXT NOT NULL CHECK (status IN ('filled', 'partial', 'pending', 'cancelled')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    filled_at     TEXT
);

CREATE TABLE positions (
    agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
    outcome_id    TEXT NOT NULL,
    shares        REAL NOT NULL DEFAULT 0,
    avg_entry_price REAL NOT NULL,
    current_price REAL,
    unrealized_pnl REAL,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, outcome_id)
);

CREATE TABLE trade_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
    outcome_id    TEXT NOT NULL,
    entry_price   REAL NOT NULL,
    exit_price    REAL NOT NULL,
    shares        REAL NOT NULL,
    realized_pnl  REAL NOT NULL,
    reason        TEXT NOT NULL CHECK (reason IN ('sold', 'resolved_win', 'resolved_loss')),
    opened_at     TEXT NOT NULL,
    closed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE resolutions (
    outcome_id    TEXT PRIMARY KEY,
    resolved_value REAL NOT NULL,
    resolved_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_orders_agent ON orders(agent_id);
CREATE INDEX idx_orders_outcome ON orders(outcome_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_positions_agent ON positions(agent_id);
CREATE INDEX idx_trade_history_agent ON trade_history(agent_id);
CREATE INDEX idx_outcomes_market ON outcomes(market_id);
```

### Order Book Simulation

When `pm_buy(agent_id, outcome_id, $500)` is called:

1. Fetch live order book from CLOB API for the outcome
2. Walk the ask side in price order:
   - At each price level, fill up to available size
   - Track cumulative cost and shares acquired
   - Stop when requested amount is fully spent
3. Calculate: `avg_fill_price = total_cost / total_shares`
4. Calculate: `slippage = avg_fill_price - best_ask`
5. Handle partial fills if book is exhausted before amount is spent
6. Atomically: deduct cash, upsert position, insert order record

Sell logic mirrors this against the bid side.

### Resolution Tracking

A background polling loop (runs every 5 minutes):

1. Query all outcome_ids that have open positions across any agent
2. Check Gamma API for resolution status
3. When a market resolves:
   - Insert into `resolutions` table
   - For each agent holding a position:
     - Winning outcome: credit `shares * 1.0` to cash
     - Losing outcome: credit `shares * 0.0` (position zeroed)
     - Record in `trade_history` with reason `resolved_win` or `resolved_loss`
     - Delete from `positions`

---

## Agent Prompt

Each spawned agent receives this as its system prompt. This is the autoresearch-equivalent loop.

### Setup (runs once)

```
1. hub_register_agent(agent_id)
2. hub_update_agent_status(agent_id, 'active')
3. pm_balance() — confirm your $10,000 bankroll
4. hub_read('post-mortems') — learn from previous agents' results
5. Your workspace is agents/<agent_id>/ — you can create files and run code here
```

### The Loop (runs forever)

```
LOOP FOREVER:

1. SCAN
   - pm_markets() — browse active markets
   - Filter for markets where you might have an informational edge
   - Avoid markets you've already lost on unless new info surfaced
   - Check pm_positions() for any positions needing attention

2. RESEARCH
   - Pick 1-3 promising markets
   - Web search for relevant news, data sources, expert analysis
   - pm_market_detail() and pm_price_history() for each
   - If quantitative analysis would help:
     Write Python code in your workspace and run it
     (models, backtests, scrapers, data analysis)
   - Form a private thesis: "Market prices X at 60%, I believe it's 80% because..."
   - If you need a Python package you don't have:
     hub_post('dependencies', agent_id, "Need <package> for <reason>")
     Move on to other work — orchestrator will approve/deny

3. TRADE
   - pm_orderbook() — check liquidity and spread
   - Size position relative to conviction (never >10% of bankroll on one position)
   - pm_buy() / pm_sell() / pm_limit_order() — execute against real order book depth
   - Thin books mean worse fills — factor this into sizing

4. MONITOR
   - pm_positions() — check mark-to-market P&L
   - Watch for new information that changes your thesis
   - Re-run models if you built any
   - If thesis invalidated: exit early, don't hold losers hoping
   - If thesis strengthened: consider adding to position
   - If market moved in your favor and edge is gone: take profit

5. CLOSE & LEARN (when a position is exited or resolves)
   - pm_history() — get the final numbers
   - hub_post('post-mortems', agent_id, ...) — mandatory for every closed trade
     Include: market question, entry/exit prices, P&L, your thesis,
     what actually happened, what you learned
   - If you built a useful tool or model that contributed to a winning trade:
     git commit it in your workspace
     hub_push(agent_id, branch) — share it on the DAG
     Reference it in your post-mortem so others can find it

6. ADAPT
   - hub_read('post-mortems') — read other agents' closed trade reports
   - hub_leaves() — discover tools/models others committed
   - hub_fetch(hash) — inspect promising tools before using them
   - Look for patterns: which categories are profitable? Which signals work?
   - Adjust your approach based on proven results, not speculation

7. DEPENDENCY CHECK (periodic)
   - hub_read('dependencies') — check if your package request was approved
   - If approved: use the package in your next analysis
```

### Rules

- **Never stop.** Never ask if you should continue. You are autonomous. Run until interrupted.
- **Never share active theses.** Your positions and reasoning are private until the trade closes.
- **Post-mortems are mandatory.** Every closed trade gets a post-mortem on the board. No exceptions.
- **Bankroll management.** Never risk more than 10% of remaining balance on a single position. If you're down 50%, trade smaller, not bigger.
- **If you're losing, change approach.** Read the board, try different categories, build different models. Don't repeat losing strategies.
- **Code is a tool, not the goal.** Write code when it gives you an edge. Don't over-engineer. A simple web search can be more valuable than a complex model.
- **Liquidity matters.** Check the order book before trading. Don't dump $5,000 into a market with $500 of liquidity.

---

## Orchestrator Behavior

The orchestrator is the Claude Code instance that spawns and monitors agents.

### Setup

```
1. hub_set_goal("Maximize paper trading P&L on Polymarket")
2. hub_create_channel('post-mortems')
3. hub_create_channel('dependencies')
4. Create shared pyproject.toml in agents/ with starter packages:
   numpy, pandas, scipy, scikit-learn, requests, beautifulsoup4
5. Spawn N agents, each with:
   - Unique agent_id
   - Access to NaanHub MCP + Polymarket MCP + web search
   - The agent prompt above
   - Workspace at agents/<agent_id>/
```

### Monitoring Loop

```
LOOP:
  - pm_leaderboard() — check agent performance
  - hub_list_agents() — check for failed agents, respawn if needed
  - hub_read('dependencies') — review package requests
    - Evaluate: is this a legitimate data/ML/analysis package?
    - If yes: add to pyproject.toml, post approval to channel
    - If no: post denial with reason
  - hub_read('post-mortems') — stay aware of what agents are learning
```

### Orchestrator does NOT:
- Assign markets or strategies to agents
- Tell agents when to trade or what to research
- Override agent decisions
- Share information between agents beyond what's on the board

---

## File Structure (new code)

```
polymarket-mcp/
  src/
    index.ts              # MCP server entry, stdio transport
    db.ts                 # SQLite layer — markets cache, paper trading
    tools.ts              # Tool handlers (12 tools)
    polymarket-api.ts     # Gamma API + CLOB API clients
    order-engine.ts       # Order book simulation logic
    resolution-tracker.ts # Background poller for market resolutions
  package.json
  tsconfig.json

naanhub/
  agents/                 # Agent workspaces (created at runtime)
    pyproject.toml        # Shared Python dependencies
```

---

## Key Design Decisions

1. **Separate MCP server** — Polymarket MCP is its own codebase, not bolted onto NaanHub. Clean separation: NaanHub = coordination, Polymarket MCP = trading.

2. **Order book simulation, not snapshot pricing** — Fills simulate against real CLOB order book depth. Agents learn that liquidity and slippage matter.

3. **Private theses, public post-mortems** — Prevents groupthink and front-running. The board contains only proven results.

4. **Agent workspaces with code execution** — Agents can write and run Python for models, backtests, scrapers. Proven tools get committed to DAG for swarm benefit.

5. **Orchestrator-approved dependencies** — Agents request packages, orchestrator evaluates and approves. No hard guardrails — orchestrator uses judgment.

6. **Continuous loop, no fixed cycles** — Agents run at their own pace. No artificial timing constraints. Markets move on their own schedule.

7. **Individual bankrolls** — Each agent starts with $10,000. Clean performance isolation. Leaderboard shows who's actually good.

8. **Both Polymarket APIs exposed** — Gamma (public metadata) and CLOB (order book, authenticated). Agents decide which to use for what purpose.
