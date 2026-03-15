import { PolymarketAPI } from '@/lib/platforms/polymarket/api';
import { KalshiAPI } from '@/lib/platforms/kalshi/api';

const BINANCE = 'https://data-api.binance.vision/api/v3';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';

export interface SpreadSignal {
  type: 'complement' | 'cross_platform' | 'cross_market';
  description: string;
  spread_points: number;
  details: Record<string, unknown>;
}

export class MarketScanner {
  private pm = new PolymarketAPI();
  private kalshi = new KalshiAPI();

  // Scan for YES+NO != $1.00 on Polymarket
  async scanComplements(limit = 20): Promise<SpreadSignal[]> {
    const signals: SpreadSignal[] = [];
    const markets = await this.pm.listMarkets({ limit, closed: false });

    for (const m of markets) {
      if (!m.outcomePrices) continue;
      try {
        const prices = JSON.parse(m.outcomePrices) as string[];
        const sum = prices.reduce((s, p) => s + parseFloat(p), 0);
        const deviation = Math.abs(sum - 1.0);
        if (deviation > 0.02) { // More than 2 cents off
          signals.push({
            type: 'complement',
            description: `${m.question} — prices sum to $${sum.toFixed(3)} (should be $1.00). ${deviation > 0 ? 'Underpriced' : 'Overpriced'} by $${deviation.toFixed(3)}.`,
            spread_points: Math.round(deviation * 100),
            details: { market_id: m.id, question: m.question, prices, sum, clobTokenIds: m.clobTokenIds },
          });
        }
      } catch { /* skip parse errors */ }
    }

    return signals.sort((a, b) => b.spread_points - a.spread_points);
  }

  // Compare similar markets between Polymarket and Kalshi
  async scanCrossPlatform(): Promise<SpreadSignal[]> {
    const signals: SpreadSignal[] = [];

    // Get active Kalshi events in interesting categories
    const kalshiEvents = await this.kalshi.getEvents({ limit: 50, status: 'open' });

    // Get Polymarket markets
    const pmMarkets = await this.pm.listMarkets({ limit: 50, closed: false });

    // Simple keyword matching between platforms
    for (const ke of kalshiEvents) {
      for (const pm of pmMarkets) {
        if (!pm.outcomePrices || !pm.question) continue;

        // Check if titles share significant keywords
        const kalshiWords = new Set(ke.title.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const pmWords = new Set(pm.question.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const overlap = [...kalshiWords].filter(w => pmWords.has(w));

        if (overlap.length >= 2) {
          // Found a potential match — compare prices
          const pmPrices = JSON.parse(pm.outcomePrices) as string[];
          const pmYes = parseFloat(pmPrices[0] ?? '0');

          for (const km of ke.markets) {
            const kalshiYes = parseFloat(km.yes_ask_dollars ?? '0');
            if (kalshiYes === 0) continue;

            const spread = Math.abs(pmYes - kalshiYes);
            if (spread > 0.05) { // More than 5 point spread
              signals.push({
                type: 'cross_platform',
                description: `"${pm.question}" vs Kalshi "${km.title}" — Polymarket: ${(pmYes * 100).toFixed(0)}% vs Kalshi: ${(kalshiYes * 100).toFixed(0)}%. Spread: ${(spread * 100).toFixed(0)} points.`,
                spread_points: Math.round(spread * 100),
                details: {
                  polymarket: { id: pm.id, question: pm.question, yes_price: pmYes, clobTokenIds: pm.clobTokenIds },
                  kalshi: { ticker: km.ticker, title: km.title, yes_price: kalshiYes },
                  overlap_keywords: overlap,
                },
              });
            }
          }
        }
      }
    }

    return signals.sort((a, b) => b.spread_points - a.spread_points);
  }

  // Compare Polymarket crypto markets against actual crypto prices
  async scanCryptoSpreads(): Promise<SpreadSignal[]> {
    const signals: SpreadSignal[] = [];

    // Search for crypto-related prediction markets
    const markets = await this.pm.listMarkets({ limit: 50, closed: false });
    const cryptoMarkets = markets.filter(m =>
      m.question && /bitcoin|btc|ethereum|eth|crypto|solana|sol/i.test(m.question)
    );

    if (cryptoMarkets.length === 0) return signals;

    // Get current crypto prices
    const btcRes = await fetch(`${BINANCE}/ticker/24hr?symbol=BTCUSDT`);
    const ethRes = await fetch(`${BINANCE}/ticker/24hr?symbol=ETHUSDT`);
    const btcData = btcRes.ok ? await btcRes.json() as Record<string, string> : null;
    const ethData = ethRes.ok ? await ethRes.json() as Record<string, string> : null;

    const cryptoPrices = {
      BTC: btcData ? parseFloat(btcData.lastPrice) : null,
      BTC_change_24h: btcData ? parseFloat(btcData.priceChangePercent) : null,
      ETH: ethData ? parseFloat(ethData.lastPrice) : null,
      ETH_change_24h: ethData ? parseFloat(ethData.priceChangePercent) : null,
    };

    for (const m of cryptoMarkets) {
      if (!m.outcomePrices) continue;
      const prices = JSON.parse(m.outcomePrices) as string[];
      const yesPrice = parseFloat(prices[0] ?? '0');

      signals.push({
        type: 'cross_market',
        description: `${m.question} — Polymarket Yes: ${(yesPrice * 100).toFixed(0)}%. BTC: $${cryptoPrices.BTC?.toLocaleString() ?? '?'} (${cryptoPrices.BTC_change_24h?.toFixed(1) ?? '?'}% 24h). ETH: $${cryptoPrices.ETH?.toLocaleString() ?? '?'}.`,
        spread_points: 0, // Agent needs to assess the spread
        details: {
          market: { id: m.id, question: m.question, yes_price: yesPrice, clobTokenIds: m.clobTokenIds },
          crypto: cryptoPrices,
        },
      });
    }

    return signals;
  }

  // Get forex data for geopolitical market context
  async getForexSnapshot(): Promise<Record<string, number>> {
    const res = await fetch(`${FRANKFURTER}/latest?base=USD&symbols=EUR,GBP,JPY,CNY,RUB,MXN,BRL`);
    if (!res.ok) return {};
    const d = await res.json() as { rates: Record<string, number> };
    return d.rates ?? {};
  }
}
