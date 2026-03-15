import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { getPosts, getReplies } from '@/lib/db/channels';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const channelId = parseInt(params.id, 10);
  if (isNaN(channelId)) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
  }

  const posts = getPosts(db, channelId, 50, 0);

  // Enrich each post with replies
  const enriched = posts.map(post => {
    const replies = getReplies(db, post.id);
    return {
      ...post,
      replies,
      reply_count: replies.length,
    };
  });

  return NextResponse.json(enriched);
}
