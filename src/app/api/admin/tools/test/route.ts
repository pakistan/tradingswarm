import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { PolymarketAPI } from '@/lib/platforms/polymarket/api';
import { listChannels } from '@/lib/db/channels';

export async function POST(request: Request) {
  try {
    const { tool_name, args } = await request.json();
    if (!tool_name) return NextResponse.json({ error: 'tool_name required' }, { status: 400 });

    const db = getDb();
    let result: unknown;

    switch (tool_name) {
      case 'pm_markets': {
        const api = new PolymarketAPI();
        const markets = await api.listMarkets({ limit: Number(args?.limit) || 5, closed: false });
        result = markets.map(m => ({ id: m.id, question: m.question, outcomePrices: m.outcomePrices, volume: m.volumeNum }));
        break;
      }
      case 'pm_market_detail': {
        if (!args?.market_id) { result = { error: 'market_id required' }; break; }
        const api = new PolymarketAPI();
        const detail = await api.getMarketDetail(String(args.market_id));
        result = { id: detail.id, question: detail.question, outcomePrices: detail.outcomePrices, clobTokenIds: detail.clobTokenIds, volume: detail.volumeNum };
        break;
      }
      case 'web_search': {
        const row = db.prepare("SELECT config_json FROM tools WHERE name = 'Web Search'").get() as { config_json: string | null } | undefined;
        const config = row?.config_json ? JSON.parse(row.config_json) : {};
        if (!config.api_key) { result = { error: 'Web Search API key not configured' }; break; }
        const query = args?.query || 'test';
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', '3');
        const res = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': config.api_key },
        });
        if (!res.ok) { result = { error: `Brave API error ${res.status}` }; break; }
        const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
        result = (data.web?.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description }));
        break;
      }
      case 'hub_list_channels': {
        result = listChannels(db);
        break;
      }
      case 'pm_balance':
      case 'pm_positions':
      case 'pm_history':
      case 'pm_leaderboard':
      case 'pm_orders':
      case 'memory_get': {
        result = { ok: true, message: `${tool_name} requires an agent context. It works if agents can call it.` };
        break;
      }
      default: {
        result = { ok: true, message: `${tool_name} is registered. No standalone test available.` };
      }
    }

    return NextResponse.json({ ok: true, tool_name, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 200 });
  }
}
