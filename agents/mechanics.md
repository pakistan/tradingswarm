# Trading Mechanics

How the paper trading system works. Read this before placing any trades.

## Order Book Basics

Every outcome has an order book with **bids** (buy offers) and **asks** (sell offers). Use `pm_orderbook({ outcome_id })` to see it.

```
ASKS (sellers offering shares)     BIDS (buyers wanting shares)
$0.45  x  200 shares               $0.40  x  500 shares
$0.46  x  150 shares               $0.39  x  300 shares
$0.48  x   80 shares               $0.38  x  100 shares
$0.55  x 1000 shares               $0.35  x  800 shares
```

- **Best ask** = cheapest price someone will sell at ($0.45)
- **Best bid** = highest price someone will buy at ($0.40)
- **Spread** = best ask - best bid ($0.05)
- **Mid price** = (best ask + best bid) / 2 ($0.425)

## How Market Orders Fill (pm_buy / pm_sell)

`pm_buy` walks the ask side from cheapest to most expensive, consuming shares at each level until your order is filled.

**Example:** You buy $100 worth of shares on the book above:
```
Level 1:  200 shares @ $0.45 = spend $90.00 → get 200 shares (total: $90)
Level 2:  150 shares @ $0.46 = spend $10.00 → get 21.7 shares (total: $100)
```
Result: 221.7 shares at avg price $0.451. Slippage: $0.001.

**Same book, but you buy $500:**
```
Level 1:  200 shares @ $0.45 = $90.00  (total: $90)
Level 2:  150 shares @ $0.46 = $69.00  (total: $159)
Level 3:   80 shares @ $0.48 = $38.40  (total: $197.40)
Level 4: 1000 shares @ $0.55 = $302.60 (total: $500)
```
Result: 980 shares at avg price $0.510. Slippage: $0.060.

The $500 order paid **6 cents more per share** than the $100 order because it ate through the cheap levels into expensive ones.

## Slippage Rule of Thumb

Before placing a market order, look at the order book and ask:

> "How many shares are available within 2-3 cents of the best ask?"

Multiply those shares by their prices. That's the dollar amount you can trade with minimal slippage. If your order is bigger than that, you'll overpay.

**If your order exceeds the cheap liquidity, use a limit order instead.**

## Market Orders vs Limit Orders

| | Market Order (pm_buy/pm_sell) | Limit Order (pm_limit_order) |
|---|---|---|
| **Fills** | Immediately at whatever price is available | Only when market reaches your price |
| **Price control** | None — you get what the book gives you | Full — you set the price |
| **Risk** | Slippage on thin books | May never fill |
| **Use when** | Deep book, tight spread (<$0.03), small order | Thin book, wide spread, or large order |

**General rule:** If the spread is wider than $0.05, use a limit order. If you're spending more than the visible depth at the best 2-3 levels, use a limit order.

## Position Sizing

- Never risk more than 10% of your bankroll ($1,000) on a single position
- Size relative to available liquidity — don't be the biggest order on a thin book
- A $500 order on a book with $50,000 of depth = fine
- A $500 order on a book with $200 of depth = you'll move the market against yourself

## Spread as Cost

The spread is the minimum cost of a round trip. If you buy at the ask ($0.45) and immediately sell at the bid ($0.40), you lose $0.05/share regardless of your thesis. Wide spread markets need a stronger thesis to overcome this entry cost.

```
Spread $0.01 → need 1% move to break even
Spread $0.05 → need 5% move to break even
Spread $0.20 → need 20% move to break even (probably not worth it)
```

## Mark-to-Market

`pm_positions` values your holdings at the current **mid price** — the midpoint between best bid and best ask. This is what you'd theoretically get if you could trade at the midpoint (you can't — you'd actually get the bid price if selling).

Unrealized P&L = (current mid price - your avg entry price) x shares

This number changes every time the market moves. It's not real until you sell or the market resolves.

## Resolution

Prediction markets resolve to $1.00 (YES happened) or $0.00 (NO happened). If you hold shares when a market resolves:
- Winning outcome: each share pays $1.00
- Losing outcome: each share pays $0.00

Your actual P&L is only final when you sell or the market resolves. Everything before that is mark-to-market.
