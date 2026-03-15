import { getDb } from '@/lib/db/index';
import { listChannels, createChannel, getPosts, getReplies } from '@/lib/db/channels';
import { ChannelsClient } from './channels-client';

const SEED_CHANNELS = [
  { name: 'trade-results', description: 'Auto-posted when a trade closes. Do NOT post here manually — the system posts entry/exit/P&L automatically.' },
  { name: 'dependencies', description: 'Post here when you discover that two or more markets are correlated or one outcome depends on another. Example: "If X wins, Y becomes more likely."' },
  { name: 'strategies', description: 'Post here BEFORE entering a trade to share your thesis. Explain what you are buying, why the market is mispriced, and what would change your mind.' },
  { name: 'market-intel', description: 'Post here when you find new information from web searches or market data that other agents should know about. Raw facts only — no trade recommendations.' },
  { name: 'issues', description: 'Post here when tools are broken, API keys are missing, or something is not working. The operator monitors this channel.' },
  { name: 'requests', description: 'Post here to request new tools, data sources, or capabilities you need to do your job better. The operator reviews requests.' },
];

interface PostWithReplies {
  id: number;
  channel_id: number;
  agent_id: string;
  content: string;
  parent_id: number | null;
  created_at: string;
  replies: {
    id: number;
    channel_id: number;
    agent_id: string;
    content: string;
    parent_id: number | null;
    created_at: string;
  }[];
  reply_count: number;
}

interface ChannelWithPosts {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  post_count: number;
  posts: PostWithReplies[];
}

function getChannelsWithPosts(): ChannelWithPosts[] {
  const db = getDb();

  // Ensure seed channels exist
  const existing = listChannels(db);
  const existingNames = new Set(existing.map(c => c.name));
  for (const seed of SEED_CHANNELS) {
    if (!existingNames.has(seed.name)) {
      createChannel(db, seed.name, seed.description, 'system');
    }
  }

  const channels = listChannels(db);

  return channels.map(ch => {
    const posts = getPosts(db, ch.id, 50, 0);
    const postsWithReplies: PostWithReplies[] = posts.map(post => {
      const replies = getReplies(db, post.id);
      return {
        ...post,
        replies,
        reply_count: replies.length,
      };
    });

    const postCount = (db.prepare(
      `SELECT COUNT(*) as count FROM posts WHERE channel_id = ? AND parent_id IS NULL`
    ).get(ch.id) as { count: number }).count;

    return {
      ...ch,
      post_count: postCount,
      posts: postsWithReplies,
    };
  });
}

export default function ChannelsPage() {
  const channels = getChannelsWithPosts();

  return (
    <main className="p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-gray-900">Channels</h1>
        <p className="text-sm text-gray-500 mt-0.5">Agent coordination message board</p>
      </div>
      <ChannelsClient channels={channels} />
    </main>
  );
}
