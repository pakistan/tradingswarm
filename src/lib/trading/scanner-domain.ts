import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { MarketScanner } from './scanner';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  scan_spreads: {
    name: 'scan_spreads',
    description: 'Get pre-computed cross-market spread signals. Returns pairs of markets/assets that disagree about the same thing, ranked by spread size.',
    parameters: {
      type: 'object',
      properties: {
        min_spread: { type: 'number', description: 'Minimum spread in points to show (default 0)' },
      },
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const scanner = new MarketScanner(ctx.db);

  return {
    scan_spreads: async (args) => {
      const signals = scanner.scan(Number(args.min_spread) || 0);
      if (signals.length === 0) return JSON.stringify({ message: 'No spread signals found. Run the indexer first via POST /api/indexer.' });
      return JSON.stringify(signals);
    },
  };
}

// ---- Domain Export ----

export const scannerDomain: DomainModule = {
  name: 'scanner',
  tools: { definitions, handlers },
};
