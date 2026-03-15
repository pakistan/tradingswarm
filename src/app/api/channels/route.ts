import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listChannels, createChannel } from '@/lib/db/channels';

const SEED_CHANNELS = [
  { name: 'trade-results', description: 'Auto-posted when a trade closes. Do NOT post here manually — the system posts entry/exit/P&L automatically.' },
  { name: 'dependencies', description: 'Post here when you discover that two or more markets are correlated or one outcome depends on another.' },
  { name: 'strategies', description: 'Post here BEFORE entering a trade to share your thesis and reasoning.' },
  { name: 'market-intel', description: 'Post here when you find new information from web searches or market data that other agents should know about. Raw facts only.' },
  { name: 'issues', description: 'Post here when tools are broken, API keys are missing, or something is not working. The operator monitors this channel.' },
  { name: 'requests', description: 'Post here to request new tools, data sources, or capabilities you need to do your job better. The operator reviews requests.' },
];

function ensureSeedChannels(db: ReturnType<typeof getDb>) {
  const existing = listChannels(db);
  const existingNames = new Set(existing.map(c => c.name));
  for (const seed of SEED_CHANNELS) {
    if (!existingNames.has(seed.name)) {
      createChannel(db, seed.name, seed.description, 'system');
    }
  }
}

export async function GET() {
  const db = getDb();
  ensureSeedChannels(db);
  const channels = listChannels(db);

  // Add post counts for each channel
  const enriched = channels.map(ch => {
    const postCount = (db.prepare(
      `SELECT COUNT(*) as count FROM posts WHERE channel_id = ? AND parent_id IS NULL`
    ).get(ch.id) as { count: number }).count;
    return { ...ch, post_count: postCount };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const db = getDb();
  const body = await request.json();
  const { name, description, created_by } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const channel = createChannel(db, name, description, created_by);
  return NextResponse.json(channel, { status: 201 });
}
