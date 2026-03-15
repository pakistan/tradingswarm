import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { migrate } from '@/lib/db/schema';
import { createAgent } from '@/lib/db/agents';
import { createConfig, createVersion, createModelProvider } from '@/lib/db/configs';
import { runAgentLoop, buildSystemPrompt, requestShutdown, resetShutdown } from './agent-loop';
import type { LLMResponse } from './llm-client';

// Mock LLM client module
vi.mock('./llm-client', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  const chatMock = vi.fn();
  return {
    ...original,
    createLLMClient: vi.fn().mockReturnValue({
      chat: chatMock,
    }),
    __mockChat: chatMock,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getChatMock(): Promise<any> {
  const mod = await import('./llm-client');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).__mockChat;
}

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  resetShutdown();
  dbPath = path.join(os.tmpdir(), `ts-loop-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

function setupAgent(agentId = 'loop-agent') {
  const cfg = createConfig(db, `config-${agentId}`);
  const ver = createVersion(db, cfg.config_id, {
    model_provider: 'anthropic',
    model_name: 'claude-3-5-sonnet',
    prompt_template: 'You are a trading agent.',
    schedule_interval: '5m',
  });
  createModelProvider(db, 'anthropic', 'Anthropic', undefined, 'test-api-key', 'claude-3-5-sonnet');
  createAgent(db, agentId, 'Loop Agent', ver.version_id);
  return ver;
}

describe('buildSystemPrompt', () => {
  it('includes prompt template', () => {
    const result = buildSystemPrompt('You are a trader.', [], [], []);
    expect(result).toBe('You are a trader.');
  });

  it('includes rules', () => {
    const result = buildSystemPrompt('Base prompt', [
      { prompt_text: 'Never risk more than 5%' },
      { prompt_text: 'Always use stop losses' },
    ], [], []);
    expect(result).toContain('Trading Rules');
    expect(result).toContain('Never risk more than 5%');
    expect(result).toContain('Always use stop losses');
  });

  it('includes tool descriptions', () => {
    const result = buildSystemPrompt('Base', [], [
      { name: 'pm_buy', description: 'Buy shares', parameters: {} },
    ], []);
    expect(result).toContain('Available Tools');
    expect(result).toContain('pm_buy');
    expect(result).toContain('Buy shares');
  });

  it('includes memory', () => {
    const result = buildSystemPrompt('Base', [], [], [
      { topic: 'thesis', content: 'BTC will hit 200k' },
    ]);
    expect(result).toContain('Your Memory');
    expect(result).toContain('thesis');
    expect(result).toContain('BTC will hit 200k');
  });
});

describe('runAgentLoop', () => {
  it('runs a single cycle with no tool calls', async () => {
    const ver = setupAgent('simple-agent');
    const chatMock = await getChatMock();

    // LLM returns text only (no tool calls)
    chatMock.mockResolvedValueOnce({
      content: 'Markets look quiet today. No trades needed.',
      tool_calls: undefined,
    } as LLMResponse);

    let cycleCompleted = false;

    // Request shutdown after one cycle
    const loopPromise = runAgentLoop({
      agentId: 'simple-agent',
      configVersionId: ver.version_id,
      dbPath,
      onCycleComplete: () => {
        cycleCompleted = true;
        requestShutdown();
      },
    });

    await loopPromise;
    expect(cycleCompleted).toBe(true);

    // Verify events were recorded
    const events = db.prepare(`SELECT * FROM agent_events WHERE agent_id = ? ORDER BY id`).all('simple-agent') as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThanOrEqual(2); // loop_start + thinking + loop_end
    expect(events[0].event_type).toBe('loop_start');
    expect(events[events.length - 1].event_type).toBe('loop_end');
  });

  it('runs a cycle with tool calls', async () => {
    const ver = setupAgent('tool-agent');
    const chatMock = await getChatMock();

    // First LLM call: returns a tool call
    chatMock.mockResolvedValueOnce({
      content: 'Let me check my balance.',
      tool_calls: [{
        id: 'tc_1',
        name: 'pm_balance',
        arguments: {},
      }],
    } as LLMResponse);

    // Second LLM call: no more tool calls (final response)
    chatMock.mockResolvedValueOnce({
      content: 'I have $10000. No trades needed right now.',
      tool_calls: undefined,
    } as LLMResponse);

    const loopPromise = runAgentLoop({
      agentId: 'tool-agent',
      configVersionId: ver.version_id,
      dbPath,
      onCycleComplete: () => requestShutdown(),
    });

    await loopPromise;

    // Verify tool_call and tool_result events
    const events = db.prepare(
      `SELECT * FROM agent_events WHERE agent_id = ? ORDER BY id`
    ).all('tool-agent') as Array<Record<string, unknown>>;

    const eventTypes = events.map(e => e.event_type);
    expect(eventTypes).toContain('loop_start');
    expect(eventTypes).toContain('thinking');
    expect(eventTypes).toContain('tool_call');
    expect(eventTypes).toContain('tool_result');
    expect(eventTypes).toContain('loop_end');

    // Verify tool_log was written
    const toolLogs = db.prepare(
      `SELECT * FROM tool_log WHERE agent_id = ?`
    ).all('tool-agent') as Array<Record<string, unknown>>;
    expect(toolLogs.length).toBeGreaterThanOrEqual(1);
    expect(toolLogs[0].tool_name).toBe('pm_balance');
  });

  it('handles LLM errors gracefully', async () => {
    const ver = setupAgent('error-agent');
    const chatMock = await getChatMock();

    // LLM throws an error
    chatMock.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const loopPromise = runAgentLoop({
      agentId: 'error-agent',
      configVersionId: ver.version_id,
      dbPath,
      onCycleComplete: () => requestShutdown(),
    });

    await loopPromise;

    // Verify error event was logged
    const events = db.prepare(
      `SELECT * FROM agent_events WHERE agent_id = ? AND event_type = 'error'`
    ).all('error-agent') as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    const errorData = JSON.parse(events[0].data_json as string);
    expect(errorData.error).toContain('API rate limit exceeded');
  });

  it('respects maxIterationsPerCycle safety limit', async () => {
    const ver = setupAgent('runaway-agent');
    const chatMock = await getChatMock();

    // Always return tool calls to test iteration limit
    chatMock.mockResolvedValue({
      content: 'Let me check again...',
      tool_calls: [{
        id: 'tc_loop',
        name: 'pm_balance',
        arguments: {},
      }],
    } as LLMResponse);

    const loopPromise = runAgentLoop({
      agentId: 'runaway-agent',
      configVersionId: ver.version_id,
      dbPath,
      maxIterationsPerCycle: 3,
      onCycleComplete: () => requestShutdown(),
    });

    await loopPromise;

    // Should have stopped after 3 iterations
    const toolCalls = db.prepare(
      `SELECT * FROM agent_events WHERE agent_id = ? AND event_type = 'tool_call'`
    ).all('runaway-agent') as Array<Record<string, unknown>>;
    expect(toolCalls).toHaveLength(3);
  });

  it('throws on missing agent', async () => {
    const ver = setupAgent('exists-agent');
    await expect(runAgentLoop({
      agentId: 'nonexistent-agent',
      configVersionId: ver.version_id,
      dbPath,
    })).rejects.toThrow('Agent not found');
  });

  it('throws on missing provider', async () => {
    const cfg = createConfig(db, 'no-provider-config');
    const ver = createVersion(db, cfg.config_id, {
      model_provider: 'missing_provider',
      model_name: 'some-model',
      prompt_template: 'test',
    });
    createAgent(db, 'no-provider-agent', 'Test', ver.version_id);

    await expect(runAgentLoop({
      agentId: 'no-provider-agent',
      configVersionId: ver.version_id,
      dbPath,
    })).rejects.toThrow('not configured');
  });
});
