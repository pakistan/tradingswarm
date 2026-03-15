import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listChannels, createChannel } from '@/lib/db/channels';

const SEED_CHANNELS = [
  { name: 'post-mortems', description: 'Trade post-mortems and lessons learned' },
  { name: 'dependencies', description: 'Market dependencies and correlations' },
  { name: 'strategies', description: 'Trading strategies and theses' },
  { name: 'market-intel', description: 'Market intelligence and signals' },
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
