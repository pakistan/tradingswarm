import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  web_search: {
    name: 'web_search',
    description: 'Search the web for information. Returns titles, URLs, and snippets from top results.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Number of results (default 5, max 20)' },
      },
      required: ['query'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const apiKey = ctx.getToolConfig('Web Search').api_key ?? '';

  return {
    web_search: async (args) => {
      if (!apiKey) return JSON.stringify({ error: 'Web Search API key not configured. Set it in Admin > Tools > Web Search.' });
      const query = String(args.query);
      const count = Math.min(Number(args.count) || 5, 20);
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(count));
      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
      });
      if (!res.ok) throw new Error(`Brave Search API error ${res.status}`);
      const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
      const results = (data.web?.results ?? []).map(r => ({ title: r.title, url: r.url, snippet: r.description }));
      return JSON.stringify(results);
    },
  };
}

// ---- Domain Export ----

export const webDomain: DomainModule = {
  name: 'web',
  tools: { definitions, handlers },
};
