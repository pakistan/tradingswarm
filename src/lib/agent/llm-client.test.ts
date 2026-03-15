import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicClient, OpenAICompatibleClient, createLLMClient } from './llm-client';
import type { Message, ToolDef } from './llm-client';

// Mock @anthropic-ai/sdk
vi.mock('@anthropic-ai/sdk', () => {
  const createMock = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: createMock },
    })),
    __mockCreate: createMock,
  };
});

// Mock openai
vi.mock('openai', () => {
  const completionsCreateMock = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: completionsCreateMock } },
    })),
    __mockCompletionsCreate: completionsCreateMock,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAnthropicMock(): Promise<any> {
  const mod = await import('@anthropic-ai/sdk');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).__mockCreate;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOpenAIMock(): Promise<any> {
  const mod = await import('openai');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).__mockCompletionsCreate;
}

describe('AnthropicClient', () => {
  let client: AnthropicClient;

  beforeEach(() => {
    client = new AnthropicClient('test-key', 'claude-3-5-sonnet');
  });

  it('sends a basic text chat and returns content', async () => {
    const mockCreate = await getAnthropicMock();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello! I can help with trading.' }],
    });

    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
    ];
    const result = await client.chat(messages);

    expect(result.content).toBe('Hello! I can help with trading.');
    expect(result.tool_calls).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('extracts system messages into system param', async () => {
    const mockCreate = await getAnthropicMock();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response' }],
    });

    const messages: Message[] = [
      { role: 'system', content: 'You are a trader.' },
      { role: 'user', content: 'Trade for me' },
    ];
    await client.chat(messages);

    const callArgs = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    expect(callArgs.system).toBe('You are a trader.');
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
  });

  it('passes tool definitions in Anthropic format', async () => {
    const mockCreate = await getAnthropicMock();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '' }, {
        type: 'tool_use',
        id: 'tool_123',
        name: 'pm_markets',
        input: { limit: 5 },
      }],
    });

    const tools: ToolDef[] = [{
      name: 'pm_markets',
      description: 'List prediction markets',
      parameters: { properties: { limit: { type: 'number' } } },
    }];
    const result = await client.chat([{ role: 'user', content: 'show markets' }], tools);

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].id).toBe('tool_123');
    expect(result.tool_calls![0].name).toBe('pm_markets');
    expect(result.tool_calls![0].arguments).toEqual({ limit: 5 });
  });

  it('converts tool result messages to Anthropic format', async () => {
    const mockCreate = await getAnthropicMock();
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done.' }],
    });

    const messages: Message[] = [
      { role: 'user', content: 'do it' },
      { role: 'assistant', content: 'calling tool' },
      { role: 'tool', content: '{"result":"ok"}', tool_call_id: 'tc_1' },
    ];
    await client.chat(messages);

    const callArgs = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const toolMsg = callArgs.messages[2];
    expect(toolMsg.role).toBe('user');
    expect(toolMsg.content[0].type).toBe('tool_result');
    expect(toolMsg.content[0].tool_use_id).toBe('tc_1');
  });
});

describe('OpenAICompatibleClient', () => {
  let client: OpenAICompatibleClient;

  beforeEach(() => {
    client = new OpenAICompatibleClient('test-key', 'deepseek-chat', 'https://api.deepseek.com/v1');
  });

  it('sends a basic text chat and returns content', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: 'I am DeepSeek.', tool_calls: null },
      }],
    });

    const result = await client.chat([{ role: 'user', content: 'Who are you?' }]);
    expect(result.content).toBe('I am DeepSeek.');
    expect(result.tool_calls).toBeUndefined();
  });

  it('returns tool calls from OpenAI format', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_abc',
            type: 'function',
            function: { name: 'pm_buy', arguments: '{"outcome_id":"abc","amount":50}' },
          }],
        },
      }],
    });

    const tools: ToolDef[] = [{
      name: 'pm_buy',
      description: 'Buy shares',
      parameters: {
        properties: {
          outcome_id: { type: 'string' },
          amount: { type: 'number' },
        },
      },
    }];

    const result = await client.chat([{ role: 'user', content: 'buy it' }], tools);
    expect(result.content).toBe('');
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].name).toBe('pm_buy');
    expect(result.tool_calls![0].arguments).toEqual({ outcome_id: 'abc', amount: 50 });
  });

  it('preserves system messages in OpenAI format', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok', tool_calls: null } }],
    });

    const messages: Message[] = [
      { role: 'system', content: 'You are a trader' },
      { role: 'user', content: 'Go' },
    ];
    await client.chat(messages);

    const callArgs = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].role).toBe('user');
  });
});

describe('createLLMClient factory', () => {
  it('creates AnthropicClient for provider "anthropic"', () => {
    const client = createLLMClient('anthropic', 'key', 'claude-3-5-sonnet');
    expect(client).toBeInstanceOf(AnthropicClient);
  });

  it('creates OpenAICompatibleClient for provider "deepseek"', () => {
    const client = createLLMClient('deepseek', 'key', 'deepseek-chat', 'https://api.deepseek.com/v1');
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
  });

  it('creates OpenAICompatibleClient for provider "openai"', () => {
    const client = createLLMClient('openai', 'key', 'gpt-4o');
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
  });
});
