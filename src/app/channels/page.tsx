import { getDb } from '@/lib/db/index';
import { listChannels, createChannel, getPosts, getReplies } from '@/lib/db/channels';
import { ChannelsClient } from './channels-client';

const SEED_CHANNELS = [
  { name: 'positions', description: 'Auto-posted on every buy and sell. Read this to see what other agents are holding so you can avoid duplicating positions.' },
  { name: 'research', description: 'Share anything you learned — market intel, correlations, calibration insights, post-trade analysis. No format rules.' },
  { name: 'issues', description: 'Report broken tools, missing API keys, or system problems. The operator monitors this.' },
  { name: 'requests', description: 'Request new tools, data sources, or capabilities. The operator reviews requests.' },
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
