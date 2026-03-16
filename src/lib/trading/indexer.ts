import type Database from 'better-sqlite3';
import OpenAI from 'openai';
import { PolymarketAPI } from '@/lib/platforms/polymarket/api';
import { KalshiAPI } from '@/lib/platforms/kalshi/api';

const BINANCE = 'https://data-api.binance.vision/api/v3';
const SIMILARITY_THRESHOLD = 0.82;
const TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'];
const TOP_ETFS = ['SPY', 'QQQ', 'TLT', 'GLD', 'XLE', 'XLF', 'ITA', 'EEM', 'HYG', 'VIX'];
const FRED_SERIES = [
  { id: 'DFF', title: 'Federal Funds Effective Rate' },
  { id: 'DGS10', title: '10-Year Treasury Yield' },
  { id: 'DGS2', title: '2-Year Treasury Yield' },
  { id: 'T10Y2Y', title: '10Y-2Y Treasury Yield Spread (Yield Curve)' },
  { id: 'UNRATE', title: 'US Unemployment Rate' },
  { id: 'CPIAUCSL', title: 'Consumer Price Index (CPI)' },
];

interface IndexRow {
  id: number;
  platform: string;
  asset_id: string;
  title: string;
  price: number | null;
  embedding: Buffer | null;
}

// Cosine similarity between two vectors
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export class MarketIndexer {
  private db: Database.Database;
  private openai: OpenAI;
  private embeddingModel: string;
  private linkModel: string;

  constructor(db: Database.Database, openaiKey: string, opts?: { embeddingModel?: string; linkModel?: string }) {
    this.db = db;
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.embeddingModel = opts?.embeddingModel ?? 'text-embedding-3-small';
    this.linkModel = opts?.linkModel ?? 'gpt-4o';
  }

  // --- Embedding ---

  private async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const res = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return res.data.map(d => new Float32Array(d.embedding));
  }

  // --- Upsert into index ---

  private upsert(platform: string, assetId: string, title: string, category: string | null, price: number | null, embedding: Float32Array | null, metadata?: Record<string, unknown>) {
    const embBuf = embedding ? float32ToBuffer(embedding) : null;
    this.db.prepare(`
      INSERT INTO market_index (platform, asset_id, title, category, price, embedding, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(platform, asset_id) DO UPDATE SET
        title = excluded.title, category = excluded.category, price = excluded.price,
        embedding = excluded.embedding, metadata_json = excluded.metadata_json, updated_at = datetime('now')
    `).run(platform, assetId, title, category, price, embBuf, metadata ? JSON.stringify(metadata) : null);
  }

  // --- Pull markets from all platforms ---

  async pullPolymarket(): Promise<{ id: string; title: string; price: number | null; metadata?: Record<string, unknown> }[]> {
    const api = new PolymarketAPI();
    const items: { id: string; title: string; price: number | null; metadata?: Record<string, unknown> }[] = [];
    const seen = new Set<string>();

    // Pull 500 events across 5 pages using the events endpoint
    for (let offset = 0; offset < 500; offset += 100) {
      const events = await api.listEvents({ limit: 100, offset, active: true, closed: false });
      if (events.length === 0) break;

      for (const event of events) {
        // Index the event itself (the top-level question)
        if (event.title && !seen.has(event.id)) {
          seen.add(event.id);

          // Get the best price from the first market
          const firstMarket = event.markets?.[0];
          let price: number | null = null;
          let clobTokenIds: string | null = null;
          if (firstMarket?.outcomePrices) {
            try {
              const prices = JSON.parse(firstMarket.outcomePrices) as string[];
              const parsed = parseFloat(prices[0] ?? '0');
              price = parsed > 0 && parsed < 1 ? parsed : null; // Filter out 0 and 1 (closed/invalid)
            } catch { /* skip */ }
          }
          if (firstMarket?.clobTokenIds) {
            clobTokenIds = firstMarket.clobTokenIds;
          }

          items.push({
            id: event.id,
            title: event.title,
            price,
            metadata: {
              slug: event.slug,
              description: event.description?.slice(0, 200),
              num_markets: event.markets?.length ?? 0,
              clobTokenIds,
            },
          });
        }
      }
    }

    console.log(`[indexer] Pulled ${items.length} Polymarket events`);
    return items;
  }

  async pullKalshi(): Promise<{ id: string; title: string; price: number | null }[]> {
    const api = new KalshiAPI();
    const events = await api.getEvents({ limit: 100, status: 'open' });
    const items: { id: string; title: string; price: number | null }[] = [];
    for (const e of events) {
      for (const m of e.markets) {
        if (m.title && !m.title.includes(',yes ')) { // Skip multi-leg parlays
          items.push({ id: m.ticker, title: m.title, price: parseFloat(m.yes_ask_dollars ?? '0') });
        }
      }
    }
    return items;
  }

  async pullCrypto(): Promise<{ id: string; title: string; price: number | null }[]> {
    const items: { id: string; title: string; price: number | null }[] = [];
    for (const symbol of TOP_CRYPTO) {
      try {
        const res = await fetch(`${BINANCE}/ticker/price?symbol=${symbol}`);
        if (!res.ok) continue;
        const d = await res.json() as { price: string };
        const name = symbol.replace('USDT', '');
        items.push({ id: symbol, title: `${name} crypto price`, price: parseFloat(d.price) });
      } catch { continue; }
    }
    return items;
  }

  async pullStocks(avKey: string): Promise<{ id: string; title: string; price: number | null }[]> {
    const items: { id: string; title: string; price: number | null }[] = [];
    for (const symbol of TOP_ETFS) {
      try {
        const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${avKey}`);
        if (!res.ok) continue;
        const d = await res.json() as { 'Global Quote'?: Record<string, string> };
        const price = d['Global Quote']?.['05. price'];
        if (!price) continue;
        items.push({ id: symbol, title: `${symbol} stock/ETF price`, price: parseFloat(price) });
        await new Promise(r => setTimeout(r, 250)); // Alpha Vantage rate limit
      } catch { continue; }
    }
    return items;
  }

  pullFred(): { id: string; title: string; price: number | null }[] {
    return FRED_SERIES.map(s => ({ id: s.id, title: s.title, price: null }));
  }

  // --- Full index run ---

  async runIndex(): Promise<{ indexed: number; links: number }> {
    console.log('[indexer] Starting index run...');

    // 1. Pull all markets
    const pm = await this.pullPolymarket();
    const kalshi = await this.pullKalshi();
    const crypto = await this.pullCrypto();
    const avKey = (this.db.prepare("SELECT config_json FROM tools WHERE name = 'Alpha Vantage'").get() as { config_json: string } | undefined);
    const stocks = avKey ? await this.pullStocks(JSON.parse(avKey.config_json).api_key ?? '') : [];
    const fred = this.pullFred();

    const allItems: { platform: string; id: string; title: string; price: number | null; metadata?: Record<string, unknown> }[] = [
      ...pm.map(m => ({ platform: 'polymarket', ...m })),
      ...kalshi.map(m => ({ platform: 'kalshi', ...m })),
      ...crypto.map(m => ({ platform: 'binance', ...m })),
      ...stocks.map(m => ({ platform: 'stocks', ...m })),
      ...fred.map(m => ({ platform: 'fred', ...m })),
    ];

    console.log(`[indexer] Pulled ${allItems.length} items (pm:${pm.length} kalshi:${kalshi.length} crypto:${crypto.length} stocks:${stocks.length} fred:${fred.length})`);

    // 2. Embed all titles in batches of 100
    const titles = allItems.map(m => m.title);
    const embeddings: Float32Array[] = [];
    for (let i = 0; i < titles.length; i += 100) {
      const batch = titles.slice(i, i + 100);
      const batchEmb = await this.embed(batch);
      embeddings.push(...batchEmb);
    }

    // 3. Upsert into DB
    const txn = this.db.transaction(() => {
      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        this.upsert(item.platform, item.id, item.title, null, item.price, embeddings[i] ?? null, item.metadata);
      }
    });
    txn();
    console.log(`[indexer] Indexed ${allItems.length} items`);

    // 4. Find cross-platform links via embedding similarity
    const rows = this.db.prepare('SELECT id, platform, asset_id, title, price, embedding FROM market_index WHERE embedding IS NOT NULL').all() as IndexRow[];
    const predictionRows = rows.filter(r => r.platform === 'polymarket' || r.platform === 'kalshi');
    const otherRows = rows.filter(r => r.platform !== 'polymarket' && r.platform !== 'kalshi');
    // Also cross-compare polymarket ↔ kalshi
    const polyRows = rows.filter(r => r.platform === 'polymarket');
    const kalshiRows = rows.filter(r => r.platform === 'kalshi');

    let linkCount = 0;
    const insertLink = this.db.prepare(`
      INSERT INTO market_links (market_a_id, market_b_id, link_type, similarity, spread_points, updated_at)
      VALUES (?, ?, 'embedding', ?, ?, datetime('now'))
      ON CONFLICT(market_a_id, market_b_id) DO UPDATE SET
        similarity = excluded.similarity, spread_points = excluded.spread_points, updated_at = datetime('now')
    `);

    const linkTxn = this.db.transaction(() => {
      // Polymarket ↔ Kalshi
      for (const a of polyRows) {
        if (!a.embedding) continue;
        const embA = bufferToFloat32(a.embedding);
        for (const b of kalshiRows) {
          if (!b.embedding) continue;
          const sim = cosineSim(embA, bufferToFloat32(b.embedding));
          if (sim >= SIMILARITY_THRESHOLD) {
            const spread = a.price != null && b.price != null ? Math.abs(a.price - b.price) * 100 : 0;
            insertLink.run(a.id, b.id, sim, spread);
            linkCount++;
          }
        }
      }
      // Prediction markets ↔ financial instruments
      for (const a of predictionRows) {
        if (!a.embedding) continue;
        const embA = bufferToFloat32(a.embedding);
        for (const b of otherRows) {
          if (!b.embedding) continue;
          const sim = cosineSim(embA, bufferToFloat32(b.embedding));
          if (sim >= SIMILARITY_THRESHOLD) {
            insertLink.run(a.id, b.id, sim, 0);
            linkCount++;
          }
        }
      }
    });
    linkTxn();
    console.log(`[indexer] Found ${linkCount} links`);

    // 5. Push actionable signals to the queue
    const { SignalQueue } = await import('./queue');
    const queue = new SignalQueue(this.db);
    queue.expireStale(30); // Clean up crashed claims

    const actionableLinks = this.db.prepare(`
      SELECT ml.id, ml.market_a_id, ml.market_b_id, ml.spread_points, ml.link_type,
        a.title as title_a, a.price as price_a, a.platform as platform_a,
        b.title as title_b, b.price as price_b, b.platform as platform_b
      FROM market_links ml
      JOIN market_index a ON a.id = ml.market_a_id
      JOIN market_index b ON b.id = ml.market_b_id
      WHERE a.price IS NOT NULL AND a.price > 0
        AND (ml.spread_points > 5 OR ml.link_type = 'llm')
    `).all() as any[];

    let signalCount = 0;
    for (const link of actionableLinks) {
      queue.enqueue(link.link_type, link.market_a_id, link.market_b_id, link.spread_points, {
        title_a: link.title_a, title_b: link.title_b,
        platform_a: link.platform_a, platform_b: link.platform_b,
        price_a: link.price_a, price_b: link.price_b,
      });
      signalCount++;
    }
    console.log(`[indexer] Queued ${signalCount} signals`);

    return { indexed: allItems.length, links: linkCount, signals: signalCount };
  }

  // --- LLM-generated links for prediction markets ---

  async generateLLMLinks(limit = 20): Promise<number> {
    // Find prediction markets that have no links yet
    const unlinked = this.db.prepare(`
      SELECT mi.id, mi.platform, mi.asset_id, mi.title FROM market_index mi
      WHERE mi.platform IN ('polymarket', 'kalshi')
      AND mi.id NOT IN (SELECT market_a_id FROM market_links WHERE link_type = 'llm')
      ORDER BY mi.platform ASC, mi.price DESC
      LIMIT ?
    `).all(limit) as { id: number; platform: string; asset_id: string; title: string }[];

    if (unlinked.length === 0) return 0;

    // Clean titles — strip noise like "before GTA VI?" that confuses the model
    const cleanTitle = (t: string) => t.replace(/\s*before GTA VI\??/gi, '').replace(/\s*GTA VI\??/gi, '').trim();
    const titles = unlinked.map(m => `[${m.id}] ${cleanTitle(m.title)}`).join('\n');

    const res = await this.openai.chat.completions.create({
      model: this.linkModel,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a cross-market analyst. For each prediction market below, think about what financial instruments would be affected if this outcome happened. Think creatively — consider second-order effects:

- Geopolitical events affect defense stocks (ITA), oil (XLE), gold (GLD), currencies, emerging markets (EEM)
- Political outcomes affect broad indices (SPY, QQQ), sector ETFs, bonds (TLT)
- Crypto events affect crypto pairs directly, plus crypto-related stocks
- Economic predictions connect to Fed rates, treasury yields, unemployment data
- Even entertainment/cultural events can connect to parent company stocks
- War/conflict affects energy, defense, safe havens (GLD, TLT)

For each market, list 1-5 correlated instruments. Include the reasoning. Only skip markets that truly have zero financial relevance.

Reply in JSON: [{id: number, correlated: [{platform: "binance"|"stocks"|"fred", asset_id: string, reason: string}]}]

Available: crypto (BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, AVAXUSDT, DOTUSDT, LINKUSDT), stocks/ETFs (SPY, QQQ, TLT, GLD, XLE, XLF, ITA, EEM, HYG), FRED (DFF, DGS10, DGS2, T10Y2Y, UNRATE, CPIAUCSL).

Markets:\n${titles}`,
      }],
    });

    const content = res.choices[0]?.message?.content ?? '';
    console.log(`[indexer] LLM response (${content.length} chars): ${content.slice(0, 500)}`);
    let links: Array<{ id: number; correlated: Array<{ platform: string; asset_id: string }> }> = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        links = JSON.parse(jsonMatch[0]);
        console.log(`[indexer] Parsed ${links.length} items, ${links.reduce((s, l) => s + l.correlated.length, 0)} total correlations`);
      } else {
        console.log('[indexer] No JSON array found in response');
      }
    } catch (e) {
      console.log(`[indexer] JSON parse error: ${e}`);
      return 0;
    }

    const insertLink = this.db.prepare(`
      INSERT INTO market_links (market_a_id, market_b_id, link_type, similarity, reasoning, updated_at)
      VALUES (?, ?, 'llm', 1.0, ?, datetime('now'))
      ON CONFLICT(market_a_id, market_b_id) DO UPDATE SET
        reasoning = excluded.reasoning, updated_at = datetime('now')
    `);

    let count = 0;
    for (const link of links) {
      for (const corr of link.correlated) {
        const target = this.db.prepare('SELECT id FROM market_index WHERE platform = ? AND asset_id = ?').get(corr.platform, corr.asset_id) as { id: number } | undefined;
        if (target) {
          const reason = (corr as any).reason ?? `${corr.platform}/${corr.asset_id}`;
          insertLink.run(link.id, target.id, reason);
          count++;
        }
      }
    }

    console.log(`[indexer] Generated ${count} LLM links for ${unlinked.length} markets`);
    return count;
  }

  // --- Query the index ---

  getSpreadSignals(minSpread = 5): Array<{ market_a: string; market_b: string; platform_a: string; platform_b: string; price_a: number | null; price_b: number | null; similarity: number; spread_points: number; link_type: string }> {
    return this.db.prepare(`
      SELECT
        a.title as market_a, b.title as market_b,
        a.platform as platform_a, b.platform as platform_b,
        a.price as price_a, b.price as price_b,
        a.asset_id as asset_id_a, b.asset_id as asset_id_b,
        ml.similarity, ml.spread_points, ml.link_type
      FROM market_links ml
      JOIN market_index a ON a.id = ml.market_a_id
      JOIN market_index b ON b.id = ml.market_b_id
      WHERE ml.spread_points >= ? OR ml.link_type = 'llm'
      ORDER BY ml.spread_points DESC
      LIMIT 20
    `).all(minSpread) as any[];
  }

  getLinksForMarket(platform: string, assetId: string): Array<{ platform: string; asset_id: string; title: string; price: number | null; similarity: number; link_type: string }> {
    const row = this.db.prepare('SELECT id FROM market_index WHERE platform = ? AND asset_id = ?').get(platform, assetId) as { id: number } | undefined;
    if (!row) return [];
    return this.db.prepare(`
      SELECT b.platform, b.asset_id, b.title, b.price, ml.similarity, ml.link_type
      FROM market_links ml
      JOIN market_index b ON b.id = ml.market_b_id
      WHERE ml.market_a_id = ?
      UNION
      SELECT a.platform, a.asset_id, a.title, a.price, ml.similarity, ml.link_type
      FROM market_links ml
      JOIN market_index a ON a.id = ml.market_a_id
      WHERE ml.market_b_id = ?
    `).all(row.id, row.id) as any[];
  }
}
