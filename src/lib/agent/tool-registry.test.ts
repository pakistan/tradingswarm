import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { migrate } from '@/lib/db/schema';
import { createAgent } from '@/lib/db/agents';
import { createConfig, createVersion, createTool, createCapability, setVersionCapabilities } from '@/lib/db/configs';
import { createToolRegistry, buildToolRegistry } from './tool-registry';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-tool-reg-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('createToolRegistry', () => {
  it('registers and retrieves handlers', () => {
    const registry = createToolRegistry();
    const handler = async () => 'result';
    registry.register('test_tool', handler, {
      name: 'test_tool',
      description: 'Test',
      parameters: {},
    });

    expect(registry.getHandler('test_tool')).toBe(handler);
    expect(registry.listNames()).toEqual(['test_tool']);
    expect(registry.getDefinitions()).toHaveLength(1);
    expect(registry.getDefinitions()[0].name).toBe('test_tool');
  });

  it('returns undefined for missing handler', () => {
    const registry = createToolRegistry();
    expect(registry.getHandler('nonexistent')).toBeUndefined();
  });

  it('lists all registered names', () => {
    const registry = createToolRegistry();
    registry.register('a', async () => '', { name: 'a', description: '', parameters: {} });
    registry.register('b', async () => '', { name: 'b', description: '', parameters: {} });
    registry.register('c', async () => '', { name: 'c', description: '', parameters: {} });
    expect(registry.listNames()).toEqual(['a', 'b', 'c']);
  });
});

describe('buildToolRegistry', () => {
  it('builds registry with all tools when no capabilities configured', () => {
    const cfg = createConfig(db, 'test-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'You are a trader.',
    });
    createAgent(db, 'test-agent', 'Test Agent', ver.version_id);

    let currentCycleId = 'cycle-1';
    const registry = buildToolRegistry(db, 'test-agent', ver.version_id, () => currentCycleId);

    const names = registry.listNames();
    // Should include pm_* tools, hub_* tools, memory tools, and pm_snapshot
    expect(names.length).toBeGreaterThan(10);
    expect(names).toContain('pm_markets');
    expect(names).toContain('pm_buy');
    expect(names).toContain('pm_sell');
    expect(names).toContain('pm_positions');
    expect(names).toContain('pm_balance');
    expect(names).toContain('hub_read');
    expect(names).toContain('hub_post');
    expect(names).toContain('hub_create_channel');
    expect(names).toContain('memory_get');
    expect(names).toContain('memory_set');
    expect(names).toContain('pm_snapshot');
  });

  it('builds registry with only enabled capabilities', () => {
    const cfg = createConfig(db, 'selective-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'You are a trader.',
    });

    // Create a tool with capabilities
    const tool = createTool(db, 'polymarket', 'polymarket', 'Polymarket tools');
    const capMarkets = createCapability(db, tool.tool_id, 'pm_markets', 'pm_markets', 'List markets');
    const capBalance = createCapability(db, tool.tool_id, 'pm_balance', 'pm_balance', 'Get balance');
    createCapability(db, tool.tool_id, 'pm_buy', 'pm_buy', 'Buy shares');

    // Enable only pm_markets and pm_balance
    setVersionCapabilities(db, ver.version_id, [
      { capability_id: capMarkets.capability_id, enabled: true },
      { capability_id: capBalance.capability_id, enabled: true },
    ]);

    createAgent(db, 'selective-agent', 'Selective', ver.version_id);
    const registry = buildToolRegistry(db, 'selective-agent', ver.version_id, () => 'cycle-1');

    const names = registry.listNames();
    expect(names).toContain('pm_markets');
    expect(names).toContain('pm_balance');
    expect(names).not.toContain('pm_buy'); // not in enabled caps
    expect(names).not.toContain('hub_read'); // not in enabled caps
  });

  it('executes pm_balance handler and returns balance', async () => {
    const cfg = createConfig(db, 'balance-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'balance-agent', 'Balance Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'balance-agent', ver.version_id, () => 'cycle-bal');
    const handler = registry.getHandler('pm_balance');
    expect(handler).toBeDefined();

    const result = await handler!({});
    const parsed = JSON.parse(result);
    expect(parsed.cash).toBe(10000);
    expect(parsed.initial_balance).toBe(10000);
  });

  it('executes pm_positions handler', async () => {
    const cfg = createConfig(db, 'pos-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'pos-agent', 'Position Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'pos-agent', ver.version_id, () => 'cycle-pos');
    const handler = registry.getHandler('pm_positions');
    const result = await handler!({});
    expect(JSON.parse(result)).toEqual([]);
  });

  it('executes hub_create_channel and hub_read', async () => {
    const cfg = createConfig(db, 'chan-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'chan-agent', 'Channel Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'chan-agent', ver.version_id, () => 'cycle-ch');

    // Create a channel
    const createHandler = registry.getHandler('hub_create_channel')!;
    const createResult = JSON.parse(await createHandler({ name: 'test-channel', description: 'Testing' }));
    expect(createResult.name).toBe('test-channel');

    // Post to channel
    const postHandler = registry.getHandler('hub_post')!;
    const postResult = JSON.parse(await postHandler({ channel_id: createResult.id, content: 'Hello world' }));
    expect(postResult.content).toBe('Hello world');

    // Read channel
    const readHandler = registry.getHandler('hub_read')!;
    const readResult = JSON.parse(await readHandler({ channel_id: createResult.id }));
    expect(readResult).toHaveLength(1);
    expect(readResult[0].content).toBe('Hello world');
  });

  it('executes memory_set and memory_get', async () => {
    const cfg = createConfig(db, 'mem-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'mem-agent', 'Memory Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'mem-agent', ver.version_id, () => 'cycle-mem');

    // Set a memory
    const setHandler = registry.getHandler('memory_set')!;
    await setHandler({ topic: 'thesis', content: 'Trump will win' });

    // Get memories
    const getHandler = registry.getHandler('memory_get')!;
    const result = JSON.parse(await getHandler({}));
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe('thesis');
    expect(result[0].content).toBe('Trump will win');
  });

  it('logs tool calls to tool_log table', async () => {
    const cfg = createConfig(db, 'log-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'log-agent', 'Log Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'log-agent', ver.version_id, () => 'cycle-log');
    const handler = registry.getHandler('pm_balance')!;
    await handler({});

    const logs = db.prepare(`SELECT * FROM tool_log WHERE agent_id = ?`).all('log-agent') as Array<Record<string, unknown>>;
    expect(logs).toHaveLength(1);
    expect(logs[0].tool_name).toBe('pm_balance');
    expect(logs[0].cycle_id).toBe('cycle-log');
    expect(logs[0].error).toBeNull();
  });

  it('logs errors to tool_log table', async () => {
    const cfg = createConfig(db, 'err-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'err-agent', 'Err Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'err-agent', ver.version_id, () => 'cycle-err');
    const handler = registry.getHandler('pm_cancel_order')!;

    // Try to cancel a nonexistent order
    const result = await handler({ order_id: 99999 });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });

  it('executes pm_snapshot handler', async () => {
    const cfg = createConfig(db, 'snap-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'trade',
    });
    createAgent(db, 'snap-agent', 'Snapshot Agent', ver.version_id);

    const registry = buildToolRegistry(db, 'snap-agent', ver.version_id, () => 'cycle-snap');
    const handler = registry.getHandler('pm_snapshot')!;
    const result = JSON.parse(await handler({
      outcome_id: 'tok-123',
      agent_context: 'Bullish on crypto markets',
      market_snapshot: 'BTC at 100k, ETH at 5k',
    }));
    expect(result.snapshot_id).toBeGreaterThan(0);
  });
});
