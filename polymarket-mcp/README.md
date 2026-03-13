# Polymarket MCP

An MCP server that lets AI agents paper-trade on Polymarket prediction markets. Agents browse real markets, simulate trades against live order book data, and track P&L — all without risking real money.

Inspired by Karpathy's autoresearch: agents hypothesize, bet, measure, and iterate in a continuous autonomous loop.

## How It Works

- Agents get a **$10,000 paper bankroll** (auto-provisioned on first trade)
- Market and limit orders simulate against **real CLOB order book data** with slippage
- Background loops check **limit order fills** (every 60s) and **market resolutions** (every 5min)
- All state persists in SQLite at `~/.polymarket-mcp/`

## Tools (15)

**Market Data**
| Tool | Description |
|------|-------------|
| `pm_markets` | Browse/search active markets |
| `pm_market_detail` | Get full market details |
| `pm_orderbook` | Get live order book for an outcome |
| `pm_price_history` | Historical price data |

**Paper Trading**
| Tool | Description |
|------|-------------|
| `pm_buy` | Market buy (by dollar amount or share count) |
| `pm_sell` | Market sell (by shares or dollar amount) |
| `pm_limit_order` | Place a limit order (buy or sell) |
| `pm_orders` | List pending limit orders |
| `pm_cancel_order` | Cancel a specific order |
| `pm_cancel_all` | Cancel all pending orders |

**Portfolio & Results**
| Tool | Description |
|------|-------------|
| `pm_positions` | View positions with mark-to-market |
| `pm_balance` | Check cash balance and trading stats |
| `pm_history` | Trade history with P&L |
| `pm_leaderboard` | Compare agent performance |
| `pm_check_resolution` | Settle a resolved market |

## Setup

```bash
npm install
npm run build
npm test        # 43 tests
```

## Source Files

| File | Purpose |
|------|---------|
| `src/types.ts` | Shared TypeScript interfaces |
| `src/db.ts` | SQLite schema (7 tables) and all CRUD methods |
| `src/polymarket-api.ts` | Gamma + CLOB API clients with rate limiting |
| `src/order-engine.ts` | Pure order book fill simulation |
| `src/settlement.ts` | Shared market settlement logic |
| `src/tools.ts` | 15 MCP tool definitions and handlers |
| `src/background.ts` | Limit order checker and resolution tracker loops |
| `src/index.ts` | MCP server entry point (stdio transport) |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `POLYMARKET_DATA_DIR` | `~/.polymarket-mcp` | SQLite database location |
