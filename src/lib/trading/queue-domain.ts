import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { SignalQueue } from './queue';

const definitions: Record<string, ToolDef> = {
  claim_signal: {
    name: 'claim_signal',
    description: 'Claim the top available signal from the queue. Returns the signal with both markets, platforms, and cached prices. Verify live prices before trading.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  complete_signal: {
    name: 'complete_signal',
    description: 'Mark a claimed signal as done. Call this after you finish working a signal — whether you traded or passed.',
    parameters: {
      type: 'object',
      properties: {
        signal_id: { type: 'number', description: 'Signal ID from claim_signal' },
        action: { type: 'string', description: 'What you did: "traded", "passed", "invalid"' },
        reason: { type: 'string', description: 'Why you took this action' },
      },
      required: ['signal_id', 'action'],
    },
  },
  queue_stats: {
    name: 'queue_stats',
    description: 'Get signal queue stats: how many open, claimed, and completed signals.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const queue = new SignalQueue(ctx.db);

  return {
    claim_signal: async () => {
      const signal = queue.claim(ctx.agentId);
      if (!signal) return JSON.stringify({ message: 'No signals available in queue' });
      return JSON.stringify(signal);
    },
    complete_signal: async (args) => {
      const signalId = Number(args.signal_id);
      const action = String(args.action);
      const reason = args.reason ? String(args.reason) : '';
      if (action === 'traded') {
        queue.complete(signalId, { action, reason, agent: ctx.agentId });
      } else {
        queue.release(signalId, `${action}: ${reason}`);
      }
      return JSON.stringify({ ok: true, signal_id: signalId, action });
    },
    queue_stats: async () => {
      const stats = queue.stats();
      return JSON.stringify(stats);
    },
  };
}

export const queueDomain: DomainModule = {
  name: 'queue',
  tools: { definitions, handlers },
};
