import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { getMemory, upsertMemory } from '@/lib/db/observability';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  memory_get: {
    name: 'memory_get',
    description: 'Get all your stored memory entries.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  memory_set: {
    name: 'memory_set',
    description: 'Store or update a memory entry by topic. Persists across loops.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic/key for this memory' },
        content: { type: 'string', description: 'Content to remember' },
      },
      required: ['topic', 'content'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const { db, agentId } = ctx;

  return {
    memory_get: async () => {
      const memories = getMemory(db, agentId);
      return JSON.stringify(memories);
    },
    memory_set: async (args) => {
      upsertMemory(db, agentId, String(args.topic), String(args.content));
      return JSON.stringify({ success: true, topic: args.topic });
    },
  };
}

// ---- Domain Export ----

export const memoryDomain: DomainModule = {
  name: 'memory',
  tools: { definitions, handlers },
};
