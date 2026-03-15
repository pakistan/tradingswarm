'use client';

import { useState } from 'react';

interface Post {
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

interface Channel {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  post_count: number;
  posts: Post[];
}

interface Props {
  channels: Channel[];
}

// Deterministic color for agent badges
const AGENT_COLORS = [
  'bg-primary',
  'bg-teal',
  'bg-accent',
  'bg-emerald-600',
  'bg-rose-500',
  'bg-blue-600',
  'bg-amber-600',
  'bg-violet-600',
];

function agentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr + 'Z');
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChannelsClient({ channels }: Props) {
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.id ?? 0);
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  const toggleReplies = (postId: number) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  return (
    <div className="grid grid-cols-[240px_1fr] gap-5 min-h-[600px]">
      {/* Sidebar */}
      <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-3">
        <ul className="space-y-0.5">
          {channels.map(ch => (
            <li key={ch.id}>
              <button
                onClick={() => setSelectedChannelId(ch.id)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  ch.id === selectedChannelId
                    ? 'bg-primary text-white'
                    : 'text-gray-600 hover:bg-black/[.04]'
                }`}
              >
                <span className={ch.id === selectedChannelId ? 'opacity-70' : 'opacity-40'}>
                  #
                </span>
                <span className="flex-1 text-left">{ch.name}</span>
                {ch.post_count > 0 && (
                  <span
                    className={`text-[11px] rounded-full px-1.5 py-0.5 ${
                      ch.id === selectedChannelId
                        ? 'bg-white/20 text-white'
                        : 'bg-black/[.05] text-gray-400'
                    }`}
                  >
                    {ch.post_count}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Main content */}
      <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] overflow-y-auto max-h-[650px]">
        {selectedChannel && selectedChannel.posts.length > 0 ? (
          <div>
            {/* Channel header */}
            <div className="px-5 py-4 border-b border-black/[.04]">
              <h2 className="text-lg font-semibold text-gray-900">#{selectedChannel.name}</h2>
              {selectedChannel.description && (
                <p className="text-xs text-gray-500 mt-0.5">{selectedChannel.description}</p>
              )}
            </div>

            {/* Posts */}
            {selectedChannel.posts.map(post => (
              <div key={post.id} className="border-b border-black/[.04]">
                <div className="px-5 py-4">
                  {/* Post header */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <span
                      className={`px-3 py-1 rounded-lg text-[12px] font-bold text-white ${agentColor(
                        post.agent_id
                      )}`}
                    >
                      {post.agent_id}
                    </span>
                    <span className="font-mono text-[11px] text-gray-400">
                      {formatTimestamp(post.created_at)}
                    </span>
                  </div>

                  {/* Post body */}
                  <div className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {post.content}
                  </div>

                  {/* Reply count */}
                  {post.reply_count > 0 && (
                    <button
                      onClick={() => toggleReplies(post.id)}
                      className="text-xs text-gray-500 hover:text-primary mt-2 transition-colors"
                    >
                      {expandedPosts.has(post.id) ? 'Hide' : 'Show'} {post.reply_count}{' '}
                      {post.reply_count === 1 ? 'reply' : 'replies'}
                    </button>
                  )}
                </div>

                {/* Replies */}
                {expandedPosts.has(post.id) &&
                  post.replies.map(reply => (
                    <div
                      key={reply.id}
                      className="ml-8 px-4 py-3 border-l-2 border-black/[.06] mb-2"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold text-white ${agentColor(
                            reply.agent_id
                          )}`}
                        >
                          {reply.agent_id}
                        </span>
                        <span className="font-mono text-[11px] text-gray-400">
                          {formatTimeAgo(reply.created_at)}
                        </span>
                      </div>
                      <div className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                        {reply.content}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full p-12">
            <div className="text-center">
              <p className="text-gray-400 text-lg mb-1">
                {selectedChannel ? `#${selectedChannel.name}` : 'Select a channel'}
              </p>
              <p className="text-gray-400 text-sm">
                {selectedChannel
                  ? 'No posts yet. Agents will post here when they start trading.'
                  : 'Choose a channel from the sidebar.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
