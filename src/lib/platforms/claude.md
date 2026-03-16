# Platforms Module

External market API clients and platform adapters for trading.

## Architecture

Each platform has two files:
- `api.ts` — Raw API client. Handles HTTP calls, rate limiting, retries, response parsing.
- `adapter.ts` — Implements the `Platform` interface from `types.ts`. Used by TradingService for order book and price lookups.

The `Platform` interface has two methods:
```typescript
interface Platform {
  name: string;
  getOrderBook(assetId: string): Promise<OrderBook>;
  getCurrentPrice(assetId: string): Promise<number>;
}
```

## Platforms

### Polymarket (`polymarket/`)
- **Gamma API** (`https://gamma-api.polymarket.com`) — Market/event discovery. Public, no auth.
  - Use `/events` endpoint for discovery (NOT `/markets` — markets returns sub-outcomes)
  - Events contain nested markets. Each market has clobTokenIds for trading.
  - Docs: https://docs.polymarket.com/market-data/overview
  - Key params: `active=true&closed=false&limit=100`
  - Sort by: `order=volume` (NOT `volume_24hr` — that errors on events endpoint)
- **CLOB API** (`https://clob.polymarket.com`) — Order book, prices, history. Public, no auth.
  - `/book?token_id=X` — order book (use clobTokenId, NOT market ID)
  - `/midpoint?token_id=X` — midpoint price (singular, not `/midpoints`)
  - `/prices-history?market=X` — price history
  - Docs: https://docs.polymarket.com/api-reference/market-data/get-order-book

### Kalshi (`kalshi/`)
- **REST API** (`https://api.elections.kalshi.com/trade-api/v2`) — Public for reads.
  - `/events?limit=N&status=open&with_nested_markets=true` — event discovery
  - `/markets/{ticker}` — single market
  - `/markets/{ticker}/orderbook` — order book (public, no auth needed)
  - Order book format: `yes_dollars` = yes bids, `no_dollars` = no bids. A no bid at price X = yes ask at price (1-X).
  - Many markets are sports parlays with concatenated titles — filter out titles containing `,yes `.
  - Docs: https://docs.kalshi.com/api-reference/market/get-markets

### Binance (`binance/`)
- **Public API** (`https://data-api.binance.vision/api/v3`) — No auth needed for market data.
  - `/ticker/price?symbol=X` — current price
  - `/ticker/24hr?symbol=X` — 24h stats
  - `/depth?symbol=X&limit=20` — order book
  - `/klines?symbol=X&interval=1d&limit=30` — candlesticks
  - Symbols: BTCUSDT, ETHUSDT, SOLUSDT, etc.
  - Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api

### Stocks (`stocks/`)
- **Alpha Vantage** (`https://www.alphavantage.co/query`) — Needs API key.
  - `?function=GLOBAL_QUOTE&symbol=X&apikey=KEY` — current price
  - `?function=TOP_GAINERS_LOSERS&apikey=KEY` — movers
  - Free tier: 25 requests/day. Add 250ms delay between calls.
  - Order book is SYNTHETIC — generated from price with 0.1% spread and decreasing depth.
  - API key stored in tools table: `config_json` on "Alpha Vantage" tool.
  - Docs: https://www.alphavantage.co/documentation/

### FRED (in `trading/indexer.ts`, should be extracted)
- **FRED API** (`https://api.stlouisfed.org/fred/series/observations`)
  - `?series_id=DFF&api_key=KEY&file_type=json&sort_order=desc&limit=10`
  - Key series: DFF (fed funds), DGS10 (10yr yield), DGS2 (2yr), T10Y2Y (yield curve), UNRATE, CPIAUCSL
  - API key stored in tools table: `config_json` on "FRED" tool.
  - Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html

### Forex (inline in `agent/tool-registry.ts`, should be extracted)
- **Frankfurter** (`https://api.frankfurter.dev/v1/latest`) — No auth, no rate limit.
  - `?base=USD&symbols=EUR,GBP,JPY,CNY,RUB,MXN,BRL`
  - Docs: https://frankfurter.dev/

## Common Mistakes
- Using `/markets` instead of `/events` for Polymarket discovery — markets returns sub-outcomes, events returns the actual questions
- Using market ID instead of clobTokenId for Polymarket CLOB calls
- Using `/midpoints` (plural) instead of `/midpoint` (singular) for Polymarket
- Kalshi order book: no_dollars at price X = yes ask at (1-X), not a direct ask
- Alpha Vantage 25 req/day limit — easy to hit when indexing
