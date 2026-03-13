import { NaanDB } from './db.js';
import { validateHash, validateBranch, gitExec } from './git.js';

export async function handleTool(db: NaanDB, repoDir: string, name: string, args: Record<string, unknown>): Promise<string> {
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
      const channelName = args.name as string;
      const description = (args.description as string) ?? '';
      const channel = db.createChannel(channelName, description);
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
    case 'hub_leaves': {
      const limit = (args.limit as number) ?? 20;
      const leaves = db.getLeaves(limit);
      if (leaves.length === 0) return 'No commits indexed yet.';
      return JSON.stringify(leaves, null, 2);
    }
    case 'hub_log': {
      const limit = (args.limit as number) ?? 50;
      const agentId = args.agent_id as string | undefined;
      const log = db.getLog(limit, agentId);
      if (log.length === 0) return 'No commits indexed yet.';
      return JSON.stringify(log, null, 2);
    }
    case 'hub_lineage': {
      const hash = args.hash as string;
      try { validateHash(hash); } catch (e) { return (e as Error).message; }
      const depth = (args.depth as number) ?? 50;
      const lineage = db.getLineage(hash, depth);
      if (lineage.length === 0) return `Commit ${hash} not found in index.`;
      return JSON.stringify(lineage, null, 2);
    }
    case 'hub_fetch': {
      const hash = args.hash as string;
      try { validateHash(hash); } catch (e) { return (e as Error).message; }
      const commit = db.getCommit(hash);
      if (!commit) return `Commit ${hash} not found in index.`;

      let stat = '';
      try {
        stat = await gitExec(repoDir, ['show', '--stat', '--no-patch', hash]);
      } catch {
        stat = '(git show failed — commit may not exist in local repo)';
      }

      return JSON.stringify({ ...commit, stat: stat.trim() }, null, 2);
    }
    case 'hub_diff': {
      const a = args.a as string;
      const b = args.b as string;
      try { validateHash(a); } catch (e) { return (e as Error).message; }
      try { validateHash(b); } catch (e) { return (e as Error).message; }

      try {
        let diff = await gitExec(repoDir, ['diff', a, b]);
        const MAX_BYTES = 32 * 1024;
        if (diff.length > MAX_BYTES) {
          const truncated = diff.slice(0, MAX_BYTES);
          const lastNewline = truncated.lastIndexOf('\n');
          diff = truncated.slice(0, lastNewline >= 0 ? lastNewline : MAX_BYTES) + '\n... (truncated)';
        }
        return diff || '(no differences)';
      } catch (err) {
        return `git diff failed: ${(err as Error).message}`;
      }
    }
    case 'hub_push': {
      const agentId = args.agent_id as string;
      const branch = args.branch as string;
      try { validateBranch(branch); } catch (e) { return (e as Error).message; }

      // Fetch latest from origin
      try {
        await gitExec(repoDir, ['fetch', 'origin', branch]);
      } catch (err) {
        return `git fetch failed: ${(err as Error).message}`;
      }

      // Get commit log with null-byte separators
      let logOutput: string;
      try {
        logOutput = await gitExec(repoDir, [
          'log', `origin/${branch}`, '--max-count=100',
          '--format=%H%x00%P%x00%s%x00%aI'
        ]);
      } catch (err) {
        return `git log failed: ${(err as Error).message}`;
      }

      const indexed = db.getAllIndexedHashes();
      let count = 0;
      let headHash = '';

      const lines = logOutput.trim().split('\n').filter(l => l.length > 0);
      for (const line of lines) {
        const parts = line.split('\0');
        if (parts.length < 4) continue;

        const [hash, parentsStr, message, authoredAt] = parts;
        if (!headHash) headHash = hash;
        if (indexed.has(hash)) continue;

        const parents = parentsStr.trim() === '' ? [] : parentsStr.trim().split(' ');
        db.indexCommit(hash, agentId, message, branch, authoredAt || null, parents);
        count++;
      }

      if (count === 0 && !headHash) {
        return `No commits found on origin/${branch}.`;
      }
      return `Indexed ${count} new commit(s) on ${branch}. HEAD: ${headHash}`;
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
  },
  {
    name: 'hub_leaves',
    description: 'Get frontier commits (leaves) — commits no agent has built on yet. Use this to find work to extend.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max leaves to return (default 20)' }
      }
    }
  },
  {
    name: 'hub_log',
    description: 'List recent commits across all branches. Optionally filter by agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max commits to return (default 50)' },
        agent_id: { type: 'string', description: 'Filter commits by agent ID' }
      }
    }
  },
  {
    name: 'hub_lineage',
    description: 'Walk the first-parent chain from a commit back to root. Shows linear history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'Starting commit hash (7-40 hex chars)' },
        depth: { type: 'number', description: 'Max ancestors to return (default 50)' }
      },
      required: ['hash']
    }
  },
  {
    name: 'hub_fetch',
    description: 'Get metadata and diff summary for a specific commit. Use to inspect a leaf before building on it.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'Commit hash (7-40 hex chars)' }
      },
      required: ['hash']
    }
  },
  {
    name: 'hub_diff',
    description: 'Compare any two commits. Shows the diff between them (truncated at 32KB).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'string', description: 'Base commit hash' },
        b: { type: 'string', description: 'Target commit hash' }
      },
      required: ['a', 'b']
    }
  },
  {
    name: 'hub_push',
    description: 'Index commits after git push. Call this AFTER pushing your branch to register your work in the DAG.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        branch: { type: 'string', description: 'Branch name you pushed to' }
      },
      required: ['agent_id', 'branch']
    }
  },
];
