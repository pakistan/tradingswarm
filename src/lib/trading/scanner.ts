import type Database from 'better-sqlite3';
import { MarketIndexer } from './indexer';

export interface SpreadSignal {
  type: string;
  market_a: string;
  market_b: string;
  platform_a: string;
  platform_b: string;
  price_a: number | null;
  price_b: number | null;
  spread_points: number;
  similarity: number;
  link_type: string;
}

export class MarketScanner {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // Read pre-computed signals from the index
  scan(minSpread = 0): SpreadSignal[] {
    const rows = this.db.prepare(`
      SELECT
        a.title as market_a, b.title as market_b,
        a.platform as platform_a, b.platform as platform_b,
        a.price as price_a, b.price as price_b,
        ml.similarity, ml.spread_points, ml.link_type
      FROM market_links ml
      JOIN market_index a ON a.id = ml.market_a_id
      JOIN market_index b ON b.id = ml.market_b_id
      WHERE (ml.spread_points >= ? OR ml.link_type = 'llm')
        AND a.price IS NOT NULL AND a.price > 0
        AND b.price IS NOT NULL AND b.price > 0
      ORDER BY ml.spread_points DESC
      LIMIT 20
    `).all(minSpread) as any[];

    return rows.map((r: any) => ({
      type: r.link_type === 'llm' ? 'correlated' : r.platform_a === r.platform_b ? 'same_question' : 'cross_platform',
      market_a: r.market_a,
      market_b: r.market_b,
      platform_a: r.platform_a,
      platform_b: r.platform_b,
      price_a: r.price_a,
      price_b: r.price_b,
      spread_points: r.spread_points ?? 0,
      similarity: r.similarity ?? 0,
      link_type: r.link_type,
    }));
  }

  // Get correlated instruments for a specific market
  getLinks(platform: string, assetId: string): Array<{ platform: string; asset_id: string; title: string; price: number | null; link_type: string }> {
    const row = this.db.prepare('SELECT id FROM market_index WHERE platform = ? AND asset_id = ?').get(platform, assetId) as { id: number } | undefined;
    if (!row) return [];
    return this.db.prepare(`
      SELECT b.platform, b.asset_id, b.title, b.price, ml.link_type
      FROM market_links ml JOIN market_index b ON b.id = ml.market_b_id
      WHERE ml.market_a_id = ?
      UNION
      SELECT a.platform, a.asset_id, a.title, a.price, ml.link_type
      FROM market_links ml JOIN market_index a ON a.id = ml.market_a_id
      WHERE ml.market_b_id = ?
    `).all(row.id, row.id) as any[];
  }

  // Index stats
  stats(): { total_indexed: number; total_links: number; by_platform: Record<string, number> } {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM market_index').get() as any).c;
    const links = (this.db.prepare('SELECT COUNT(*) as c FROM market_links').get() as any).c;
    const platforms = this.db.prepare('SELECT platform, COUNT(*) as c FROM market_index GROUP BY platform').all() as any[];
    const byPlatform: Record<string, number> = {};
    for (const p of platforms) byPlatform[p.platform] = p.c;
    return { total_indexed: total, total_links: links, by_platform: byPlatform };
  }
}
