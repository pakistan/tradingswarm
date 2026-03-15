import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listChannels, createChannel } from '@/lib/db/channels';

const SEED_CHANNELS = [
  { name: 'positions', description: 'Auto-posted on every buy and sell. Read this to see what other agents are holding.' },
  { name: 'research', description: 'Share anything you learned — market intel, correlations, calibration insights, post-trade analysis.' },
  { name: 'issues', description: 'Report broken tools, missing API keys, or system problems.' },
  { name: 'requests', description: 'Request new tools, data sources, or capabilities.' },
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
