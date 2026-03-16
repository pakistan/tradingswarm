import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import * as channels from '@/lib/db/channels';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  hub_create_channel: {
    name: 'hub_create_channel',
    description: 'Create a new coordination channel.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name' },
        description: { type: 'string', description: 'Channel description (optional)' },
      },
      required: ['name'],
    },
  },
  hub_list_channels: {
    name: 'hub_list_channels',
    description: 'List all coordination channels.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  hub_read: {
    name: 'hub_read',
    description: 'Read recent posts from a coordination channel.',
    parameters: {
      type: 'object',
      properties: {
        channel_id: { type: 'number', description: 'Channel ID to read' },
        limit: { type: 'number', description: 'Max posts (default 50)' },
      },
      required: ['channel_id'],
    },
  },
  hub_post: {
    name: 'hub_post',
    description: 'Post a message to a coordination channel.',
    parameters: {
      type: 'object',
      properties: {
        channel_id: { type: 'number', description: 'Channel ID' },
        content: { type: 'string', description: 'Message content' },
        parent_id: { type: 'number', description: 'Reply to post ID (optional)' },
      },
      required: ['channel_id', 'content'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const { db, agentId } = ctx;

  return {
    hub_create_channel: async (args) => {
      const channel = channels.createChannel(
        db,
        String(args.name),
        args.description ? String(args.description) : undefined,
        agentId,
      );
      return JSON.stringify(channel);
    },
    hub_list_channels: async () => {
      return JSON.stringify(channels.listChannels(db));
    },
    hub_read: async (args) => {
      const posts = channels.getPosts(db, Number(args.channel_id), Number(args.limit) || 50);
      return JSON.stringify(posts);
    },
    hub_post: async (args) => {
      const post = channels.createPost(
        db,
        Number(args.channel_id),
        agentId,
        String(args.content),
        args.parent_id ? Number(args.parent_id) : undefined,
      );
      return JSON.stringify(post);
    },
  };
}

// ---- Domain Export ----

export const channelsDomain: DomainModule = {
  name: 'channels',
  tools: { definitions, handlers },
};
