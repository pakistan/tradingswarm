import type { ToolDef } from '@/lib/agent/llm-client';
import type { Platform } from './types';
import type Database from 'better-sqlite3';

// Every domain exports this shape
export interface DomainModule {
  name: string;
  platform?: Platform | ((config: Record<string, string>) => Platform); // For TradingService registration
  tools: {
    definitions: Record<string, ToolDef>;
    handlers: (ctx: ToolContext) => Record<string, ToolHandler>;
  };
  config?: {
    needsApiKey?: boolean;
    toolName?: string; // Name in tools table to read config_json from
  };
}

export interface ToolContext {
  db: Database.Database;
  agentId: string;
  cycleIdFn: () => string;
  tradingService: any; // TradingService — avoid circular import
  getToolConfig: (toolName: string) => Record<string, string>;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

// Auto-discover all platform domains
export function discoverDomains(): DomainModule[] {
  // We can't do true filesystem auto-discovery in Next.js (bundled).
  // Instead, each domain registers itself here. This is the ONE file
  // that needs editing when adding a new domain — but it's just one import + one line.
  return [
    ...platformDomains,
    ...toolDomains,
  ];
}

// Platform domains (have API clients + adapters + tools)
import { polymarketDomain } from './polymarket';
import { kalshiDomain } from './kalshi';
import { binanceDomain } from './binance';
import { stocksDomain } from './stocks';
import { fredDomain } from './fred';
import { forexDomain } from './forex';

const platformDomains: DomainModule[] = [
  polymarketDomain,
  kalshiDomain,
  binanceDomain,
  stocksDomain,
  fredDomain,
  forexDomain,
];

// Tool-only domains (no platform adapter, just tools)
import { webDomain } from '@/lib/agent/tools/web';
import { workspaceDomain } from '@/lib/agent/tools/workspace';
import { memoryDomain } from '@/lib/agent/tools/memory';
import { channelsDomain } from '@/lib/agent/tools/channels';
import { scannerDomain } from '@/lib/trading/scanner-domain';

const toolDomains: DomainModule[] = [
  webDomain,
  workspaceDomain,
  memoryDomain,
  channelsDomain,
  scannerDomain,
];
