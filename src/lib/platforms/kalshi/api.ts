const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string | null;
  yes_ask_dollars: string | null;
  no_ask_dollars: string | null;
  last_price_dollars: string | null;
  volume_24h_fp: string | null;
  status: string;
  close_time: string | null;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  markets: KalshiMarket[];
}

export class KalshiAPI {
  async getEvents(params: { limit?: number; status?: string; category?: string } = {}): Promise<KalshiEvent[]> {
    const url = new URL(`${KALSHI_BASE}/events`);
    url.searchParams.set('limit', String(params.limit ?? 20));
    url.searchParams.set('status', params.status ?? 'open');
    url.searchParams.set('with_nested_markets', 'true');
    if (params.category) url.searchParams.set('category', params.category);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Kalshi error ${res.status}`);
    const d = await res.json() as { events: KalshiEvent[] };
    return d.events ?? [];
  }

  async getMarket(ticker: string): Promise<KalshiMarket> {
    const res = await fetch(`${KALSHI_BASE}/markets/${ticker}`);
    if (!res.ok) throw new Error(`Kalshi error ${res.status}`);
    const d = await res.json() as { market: KalshiMarket };
    return d.market;
  }

  async searchMarkets(query: string, limit = 10): Promise<KalshiMarket[]> {
    const url = new URL(`${KALSHI_BASE}/markets`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('status', 'open');
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Kalshi error ${res.status}`);
    const d = await res.json() as { markets: KalshiMarket[] };
    // Filter client-side since Kalshi doesn't have text search
    const q = query.toLowerCase();
    return (d.markets ?? []).filter(m => m.title.toLowerCase().includes(q));
  }
}
