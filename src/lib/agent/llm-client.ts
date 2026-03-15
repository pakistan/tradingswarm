import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// ---- Generic LLM interface ----

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  tool_calls?: ToolCall[];
}

export interface LLMClient {
  chat(messages: Message[], tools?: ToolDef[]): Promise<LLMResponse>;
}

// ---- Anthropic Client ----

export class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages: Message[], tools?: ToolDef[]): Promise<LLMResponse> {
    // Extract system message — Anthropic uses a separate `system` param
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;

    // Convert our generic messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = nonSystemMessages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: m.tool_call_id ?? '',
            content: m.content,
          }],
        };
      }
      if (m.role === 'assistant') {
        return { role: 'assistant' as const, content: m.content };
      }
      return { role: 'user' as const, content: m.content };
    });

    // Convert tool definitions to Anthropic format
    const anthropicTools: Anthropic.Tool[] | undefined = tools?.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        ...t.parameters,
      },
    }));

    const params: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: 4096,
      messages: anthropicMessages,
    };
    if (systemPrompt) params.system = systemPrompt;
    if (anthropicTools && anthropicTools.length > 0) params.tools = anthropicTools;

    const response = await this.client.messages.create(params);

    // Extract text content and tool calls from Anthropic response
    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

// ---- OpenAI-Compatible Client (DeepSeek, Kimi, etc.) ----

export class OpenAICompatibleClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    this.model = model;
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const is429 = message.includes('429') || message.includes('rate');
        const is5xx = /5\d{2}/.test(message);
        if ((is429 || is5xx) && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }

  async chat(messages: Message[], tools?: ToolDef[]): Promise<LLMResponse> {
    // Convert our generic messages to OpenAI format
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          content: m.content,
          tool_call_id: m.tool_call_id ?? '',
        };
      }
      if (m.role === 'system') {
        return { role: 'system' as const, content: m.content };
      }
      if (m.role === 'assistant') {
        const msg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant' as const,
          content: m.content || null,
        };
        if (m.tool_calls && m.tool_calls.length > 0) {
          msg.tool_calls = m.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }));
        }
        return msg;
      }
      return { role: 'user' as const, content: m.content };
    });

    // Convert tool definitions to OpenAI format
    const openaiTools: OpenAI.ChatCompletionTool[] | undefined = tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const params: OpenAI.ChatCompletionCreateParams = {
      model: this.model,
      messages: openaiMessages,
      max_tokens: 4096,
    };
    if (openaiTools && openaiTools.length > 0) params.tools = openaiTools;

    const response = await this.withRetry(() => this.client.chat.completions.create(params));
    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content: message.content ?? '',
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

// ---- Factory ----

export function createLLMClient(
  provider: string,
  apiKey: string,
  model: string,
  apiBase?: string,
): LLMClient {
  if (provider === 'anthropic') {
    return new AnthropicClient(apiKey, model);
  }
  // OpenAI-compatible providers: openai, deepseek, kimi, etc.
  return new OpenAICompatibleClient(apiKey, model, apiBase ?? undefined);
}
