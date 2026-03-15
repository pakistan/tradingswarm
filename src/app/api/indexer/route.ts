import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { MarketIndexer } from '@/lib/trading/indexer';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action ?? 'full'; // 'full', 'index', 'links'

    const db = getDb();

    // Get OpenAI key from the providers table
    const provider = db.prepare("SELECT api_key FROM model_providers WHERE name = 'openai'").get() as { api_key: string } | undefined;
    if (!provider?.api_key) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 400 });
    }

    // Get indexer model from config (default gpt-4o)
    const linkModel = body.model ?? 'gpt-4o';

    const indexer = new MarketIndexer(db, provider.api_key, { linkModel });

    let result: Record<string, unknown> = {};

    if (action === 'full' || action === 'index') {
      const indexResult = await indexer.runIndex();
      result = { ...result, ...indexResult };
    }

    if (action === 'full' || action === 'links') {
      const llmLinks = await indexer.generateLLMLinks(body.limit ?? 20);
      result.llm_links = llmLinks;
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET() {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM market_index').get() as { c: number }).c;
  const links = (db.prepare('SELECT COUNT(*) as c FROM market_links').get() as { c: number }).c;
  const platforms = db.prepare('SELECT platform, COUNT(*) as c FROM market_index GROUP BY platform').all();
  const topSpreads = db.prepare(`
    SELECT a.title as market_a, b.title as market_b, a.platform as platform_a, b.platform as platform_b,
           a.price as price_a, b.price as price_b, ml.spread_points, ml.link_type, ml.similarity
    FROM market_links ml
    JOIN market_index a ON a.id = ml.market_a_id
    JOIN market_index b ON b.id = ml.market_b_id
    ORDER BY ml.spread_points DESC LIMIT 10
  `).all();

  return NextResponse.json({ total_indexed: total, total_links: links, platforms, top_spreads: topSpreads });
}
