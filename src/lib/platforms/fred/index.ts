import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import { FredAPI } from './api';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  econ_data: {
    name: 'econ_data',
    description: 'Get economic data from FRED (Federal Reserve). Series include: DFF (fed funds rate), DGS10 (10yr treasury), DGS2 (2yr treasury), UNRATE (unemployment), CPIAUCSL (CPI), GDP, T10Y2Y (yield curve).',
    parameters: {
      type: 'object',
      properties: {
        series_id: { type: 'string', description: 'FRED series ID, e.g. DFF, DGS10, UNRATE, CPIAUCSL, GDP, T10Y2Y' },
        limit: { type: 'number', description: 'Number of observations (default 10, most recent first)' },
      },
      required: ['series_id'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const fredKey = ctx.getToolConfig('FRED').api_key ?? '';
  const fredApi = fredKey ? new FredAPI(fredKey) : null;

  return {
    econ_data: async (args) => {
      if (!fredApi) return JSON.stringify({ error: 'FRED API key not configured' });
      const obs = await fredApi.getObservations(String(args.series_id), Number(args.limit) || 10);
      return JSON.stringify(obs);
    },
  };
}

// ---- Domain Export ----

export const fredDomain: DomainModule = {
  name: 'fred',
  tools: { definitions, handlers },
};
