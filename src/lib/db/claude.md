# Database Module

SQLite via better-sqlite3. WAL mode, 5s busy timeout, foreign keys enabled.

## Connection

`getDb()` in `index.ts` returns a singleton. Auto-runs `migrate()` on first access.
Path: `DATABASE_PATH` env var or `./data/tradingswarm.db`.

Worker processes open their own connection (not shared with Next.js).

## Schema (`schema.ts`)

22 tables + migrations for adding columns to existing DBs.

### Config System
- `configs` — named blueprints (id, name, description)
- `config_versions` — versioned snapshots (model_provider, model_name, bankroll, prompt_template, mechanics_file, schedule_interval)
- `rules` — trading rules (name, prompt_text, category)
- `config_version_rules` — which rules enabled per version
- `tools` — tool groups with optional config_json for API keys
- `tool_capabilities` — individual capabilities per tool
- `config_version_capabilities` — which capabilities enabled per version
- `model_providers` — LLM providers (name, api_key, api_base, default_model, enabled)

### Agents
- `agents` — agent registry (agent_id PK, config_version_id, initial_balance, current_cash, status, pid)

### Trading
- `markets` — cached market data (market_id, platform, question, volume)
- `outcomes` — cached outcomes (outcome_id, market_id, name, current_price)
- `orders` — trade orders (agent_id, outcome_id, side, platform, status, filled_amount/shares/price)
- `positions` — open positions (agent_id, outcome_id, platform, shares, avg_entry_price, current_price, unrealized_pnl)
- `trade_history` — closed trades (entry_price, exit_price, shares, realized_pnl, reason)
- `resolutions` — market resolution outcomes
- `trade_snapshots` — agent reasoning + market state at trade time

### Coordination
- `channels` — message board channels
- `posts` — channel posts with threading (parent_id)

### Observability
- `tool_log` — every tool call (agent_id, tool_name, platform, cycle_id, input_json, output_json, error, duration_ms)
- `agent_memory` — persistent memory (agent_id, topic, content)
- `agent_events` — lifecycle events (agent_id, event_type, cycle_id, data_json)
- `daily_snapshots` — daily portfolio snapshots

### Market Index
- `market_index` — cross-platform asset registry with embeddings (platform, asset_id, title, price, embedding BLOB)
- `market_links` — correlated pairs (market_a_id, market_b_id, link_type, similarity, spread_points, reasoning)

## Migrations

In `migrate()`, after CREATE TABLE statements:
1. Add `config_json` to tools (if missing)
2. Add `platform` to orders and positions (if missing)
3. Seed tools if empty
4. Seed web search tool if missing

## CRUD Files

- `agents.ts` — createAgent, getAgent, listAgents, updateAgentStatus, updateAgentCash
- `configs.ts` — config/version/rule/tool/capability/provider CRUD
- `trades.ts` — market/outcome/order/position/trade_history/resolution/leaderboard
- `channels.ts` — createChannel, listChannels, createPost, getPosts, getReplies
- `observability.ts` — tool log, memory, events, daily snapshots
- `snapshots.ts` — trade snapshots

## Conventions
- All queries use parameterized bindings (no SQL injection)
- Multi-step mutations wrapped in `db.transaction()`
- Foreign keys enforced (`PRAGMA foreign_keys = ON`)
- Disable FK for bulk deletes: `PRAGMA foreign_keys = OFF` then `ON`
