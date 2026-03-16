import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { ForexAPI } from './api';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  forex_rates: {
    name: 'forex_rates',
    description: 'Get current forex exchange rates (USD base). Useful for geopolitical market context.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ---- Handlers ----

function handlers(_ctx: ToolContext): Record<string, ToolHandler> {
  return {
    forex_rates: async () => {
      const rates = await new ForexAPI().getLatest();
      return JSON.stringify(rates);
    },
  };
}

// ---- Domain Export ----

export const forexDomain: DomainModule = {
  name: 'forex',
  tools: { definitions, handlers },
};
