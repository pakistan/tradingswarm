import { NaanDB } from './db.js';

export function handleTool(db: NaanDB, name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'hub_set_goal': {
      const goal = args.goal as string;
      db.setGoal(goal);
      return `Goal set: ${goal}`;
    }
    case 'hub_get_goal': {
      const goal = db.getGoal();
      return goal ? `Current goal: ${goal}` : 'No goal set.';
    }
    case 'hub_register_agent': {
      const id = args.agent_id as string;
      db.registerAgent(id);
      return `Agent "${id}" registered.`;
    }
    case 'hub_update_agent_status': {
      const id = args.agent_id as string;
      const status = args.status as string;
      db.updateAgentStatus(id, status);
      return `Agent "${id}" status updated to "${status}".`;
    }
    case 'hub_list_agents': {
      const agents = db.listAgents();
      if (agents.length === 0) return 'No agents registered.';
      return JSON.stringify(agents, null, 2);
    }
    case 'hub_create_channel': {
      const name = args.name as string;
      const description = (args.description as string) ?? '';
      const channel = db.createChannel(name, description);
      return `Channel "#${channel.name}" created.`;
    }
    case 'hub_list_channels': {
      const channels = db.listChannels();
      if (channels.length === 0) return 'No channels.';
      return JSON.stringify(channels, null, 2);
    }
    case 'hub_post': {
      const channel = args.channel as string;
      const agentId = args.agent_id as string;
      const content = args.content as string;
      const parentId = args.parent_id as number | undefined;
      const post = db.createPost(channel, agentId, content, parentId);
      return JSON.stringify(post, null, 2);
    }
    case 'hub_read': {
      const channel = args.channel as string;
      const limit = (args.limit as number) ?? 50;
      const offset = (args.offset as number) ?? 0;
      const posts = db.listPosts(channel, limit, offset);
      if (posts.length === 0) return `#${channel} is empty.`;
      return posts.map(p => {
        const prefix = p.parent_id ? `  ↳ reply to #${p.parent_id} | ` : '';
        return `[#${p.id}] ${prefix}${p.agent_id}: ${p.content}`;
      }).join('\n');
    }
    case 'hub_get_post': {
      const postId = args.post_id as number;
      const post = db.getPost(postId);
      if (!post) return `Post #${postId} not found.`;
      return JSON.stringify(post, null, 2);
    }
    case 'hub_get_replies': {
      const postId = args.post_id as number;
      const replies = db.getReplies(postId);
      if (replies.length === 0) return 'No replies.';
      return JSON.stringify(replies, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const TOOL_DEFINITIONS = [
  {
    name: 'hub_set_goal',
    description: 'Set the shared goal for all WorkerAgents. All agents work toward this goal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        goal: { type: 'string', description: 'The shared goal/objective' }
      },
      required: ['goal']
    }
  },
  {
    name: 'hub_get_goal',
    description: 'Get the current shared goal.',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'hub_register_agent',
    description: 'Register a WorkerAgent with the hub. Call this when spawning a new agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Unique agent identifier (e.g., "worker-1")' }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'hub_update_agent_status',
    description: 'Update an agent\'s status (idle, active, completed, failed).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Agent identifier' },
        status: { type: 'string', description: 'New status: idle, active, completed, failed' }
      },
      required: ['agent_id', 'status']
    }
  },
  {
    name: 'hub_list_agents',
    description: 'List all registered agents and their current status.',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'hub_create_channel',
    description: 'Create a message board channel for agent coordination.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Channel name (lowercase, alphanumeric, dashes, underscores)' },
        description: { type: 'string', description: 'Channel description' }
      },
      required: ['name']
    }
  },
  {
    name: 'hub_list_channels',
    description: 'List all message board channels.',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'hub_post',
    description: 'Post a message to a channel. Agents use this to share findings, coordinate, and discuss.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name' },
        agent_id: { type: 'string', description: 'ID of the posting agent' },
        content: { type: 'string', description: 'Message content' },
        parent_id: { type: 'number', description: 'Optional parent post ID for threaded replies' }
      },
      required: ['channel', 'agent_id', 'content']
    }
  },
  {
    name: 'hub_read',
    description: 'Read messages from a channel. Returns posts in reverse chronological order (newest first).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Channel name' },
        limit: { type: 'number', description: 'Max posts to return (default 50)' },
        offset: { type: 'number', description: 'Number of posts to skip for pagination (default 0)' }
      },
      required: ['channel']
    }
  },
  {
    name: 'hub_get_post',
    description: 'Get a single post by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'Post ID' }
      },
      required: ['post_id']
    }
  },
  {
    name: 'hub_get_replies',
    description: 'Get replies to a specific post.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'Post ID to get replies for' }
      },
      required: ['post_id']
    }
  }
];
