import type Database from 'better-sqlite3';
import type { ToolDef } from './llm-client';
import { insertToolLog } from '@/lib/db/observability';
import { getVersionCapabilities } from '@/lib/db/configs';
import { TradingService } from '@/lib/trading/service';
import { PolymarketPlatform } from '@/lib/platforms/polymarket/adapter';
import { BinancePlatform } from '@/lib/platforms/binance/adapter';
import { KalshiPlatform } from '@/lib/platforms/kalshi/adapter';
import { StocksPlatform } from '@/lib/platforms/stocks/adapter';
import { discoverDomains, type ToolContext } from '@/lib/platforms/registry';
import fs from 'node:fs';
import path from 'node:path';

// ---- Types ----

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export interface ToolRegistry {
  register(name: string, handler: ToolHandler, definition: ToolDef): void;
  getHandler(name: string): ToolHandler | undefined;
  getDefinitions(): ToolDef[];
  listNames(): string[];
}

// ---- Implementation ----

export function createToolRegistry(): ToolRegistry {
  const handlers = new Map<string, ToolHandler>();
  const definitions = new Map<string, ToolDef>();

  return {
    register(name: string, handler: ToolHandler, definition: ToolDef): void {
      handlers.set(name, handler);
      definitions.set(name, definition);
    },
    getHandler(name: string): ToolHandler | undefined {
      return handlers.get(name);
    },
    getDefinitions(): ToolDef[] {
      return Array.from(definitions.values());
    },
    listNames(): string[] {
      return Array.from(handlers.keys());
    },
  };
}

// ---- Cross-cutting: observability wrapper ----

function wrapWithLogging(
  db: Database.Database,
  agentId: string,
  cycleIdFn: () => string,
  toolName: string,
  platform: string,
  handler: ToolHandler,
): ToolHandler {
  return async (args: Record<string, unknown>): Promise<string> => {
    const start = Date.now();
    try {
      const result = await handler(args);
      insertToolLog(db, {
        agent_id: agentId,
        tool_name: toolName,
        platform,
        cycle_id: cycleIdFn(),
        input_json: JSON.stringify(args),
        output_json: result.substring(0, 10000), // cap log size
        duration_ms: Date.now() - start,
      });
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      insertToolLog(db, {
        agent_id: agentId,
        tool_name: toolName,
        platform,
        cycle_id: cycleIdFn(),
        input_json: JSON.stringify(args),
        error: errorMsg,
        duration_ms: Date.now() - start,
      });
      try {
        const logDir = path.join(process.cwd(), 'data', 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, 'errors.log'), `${new Date().toISOString()} [${agentId}] tool:${toolName} ${errorMsg}\n`);
      } catch { /* don't fail */ }
      return JSON.stringify({ error: errorMsg });
    }
  };
}

// ---- Helper ----

function getToolConfig(db: Database.Database, toolName: string): Record<string, string> {
  const row = db.prepare('SELECT config_json FROM tools WHERE name = ?').get(toolName) as { config_json: string | null } | undefined;
  if (!row?.config_json) return {};
  try { return JSON.parse(row.config_json); } catch { return {}; }
}

// ---- Build Registry ----

export function buildToolRegistry(
  db: Database.Database,
  agentId: string,
  configVersionId: number,
  cycleIdFn: () => string,
): ToolRegistry {
  const registry = createToolRegistry();

  // Create and configure the trading service
  const tradingService = new TradingService(db);
  tradingService.registerPlatform(new PolymarketPlatform());
  tradingService.registerPlatform(new BinancePlatform());
  tradingService.registerPlatform(new KalshiPlatform());
  const avKey = getToolConfig(db, 'Alpha Vantage').api_key ?? '';
  if (avKey) tradingService.registerPlatform(new StocksPlatform(avKey));

  // Get enabled capabilities for this config version
  const enabledCaps = getVersionCapabilities(db, configVersionId)
    .filter(c => c.enabled === 1)
    .map(c => c.name);
  const enableAll = enabledCaps.length === 0;

  // Build shared context for all domain handlers
  const ctx: ToolContext = {
    db,
    agentId,
    cycleIdFn,
    tradingService,
    getToolConfig: (name: string) => getToolConfig(db, name),
  };

  // Discover all domains and register their tools
  const domains = discoverDomains();
  for (const domain of domains) {
    const domainHandlers = domain.tools.handlers(ctx);
    const domainDefs = domain.tools.definitions;

    for (const [name, handler] of Object.entries(domainHandlers)) {
      const def = domainDefs[name];
      if (!def) continue;
      if (!enableAll && !enabledCaps.includes(name)) continue;

      const wrapped = wrapWithLogging(db, agentId, cycleIdFn, name, domain.name, handler);
      registry.register(name, wrapped, def);
    }
  }

  return registry;
}
