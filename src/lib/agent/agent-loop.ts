import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from '@/lib/db/schema';

function logError(agentId: string, cycleId: string, error: string) {
  try {
    const logDir = join(process.cwd(), 'data', 'logs');
    mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const line = `${timestamp} [${agentId}] [${cycleId}] ${error}\n`;
    appendFileSync(join(logDir, 'errors.log'), line);
    appendFileSync(join(logDir, `${agentId}.log`), line);
  } catch { /* don't fail on log failure */ }
}
import { getAgent } from '@/lib/db/agents';
import { getVersion, getVersionRules } from '@/lib/db/configs';
import { getMemory, insertEvent } from '@/lib/db/observability';
import { createLLMClient } from './llm-client';
import { buildToolRegistry } from './tool-registry';
import type { LLMClient, Message, ToolDef } from './llm-client';

// ---- Schedule interval parsing ----

const INTERVAL_MS: Record<string, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '8h': 8 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

// ---- Config types ----

export interface AgentLoopConfig {
  agentId: string;
  configVersionId: number;
  dbPath: string;
  maxIterationsPerCycle?: number; // safety limit on tool call rounds (default 20)
  onCycleComplete?: () => void;  // hook for testing
}

// ---- Shutdown signal ----

let shutdownRequested = false;

export function requestShutdown(): void {
  shutdownRequested = true;
}

export function resetShutdown(): void {
  shutdownRequested = false;
}

// ---- Compact old tool results to save context ----

function compactToolResult(content: string): string {
  try {
    const data = JSON.parse(content);

    // Array of markets → just questions
    if (Array.isArray(data) && data.length > 0 && data[0]?.question) {
      return `[${data.length} markets: ${data.slice(0, 5).map((m: { question?: string }) => m.question).join('; ')}${data.length > 5 ? '; ...' : ''}]`;
    }

    // Array of positions
    if (Array.isArray(data) && data.length > 0 && data[0]?.shares !== undefined) {
      return `[${data.length} positions]`;
    }

    // Array of web results
    if (Array.isArray(data) && data.length > 0 && data[0]?.title && data[0]?.url) {
      return `[${data.length} results: ${data.slice(0, 3).map((r: { title?: string }) => r.title).join('; ')}]`;
    }

    // Array of channel posts
    if (Array.isArray(data) && data.length > 0 && data[0]?.content && data[0]?.agent_id) {
      return `[${data.length} posts]`;
    }

    // Empty array
    if (Array.isArray(data) && data.length === 0) return '[]';

    // Balance object
    if (data.cash !== undefined && data.total_portfolio_value !== undefined) {
      return `[balance: $${Number(data.cash).toFixed(0)}, portfolio: $${Number(data.total_portfolio_value).toFixed(0)}]`;
    }

    // Orderbook
    if (data.mid_price !== undefined && data.spread !== undefined) {
      return `[orderbook: mid=$${Number(data.mid_price).toFixed(3)}, spread=$${Number(data.spread).toFixed(3)}]`;
    }

    // Trade fill
    if (data.filled_shares !== undefined && data.avg_fill_price !== undefined) {
      return `[filled ${Number(data.filled_shares).toFixed(1)} shares @ $${Number(data.avg_fill_price).toFixed(3)}]`;
    }

    // Generic object — keep first 150 chars
    const str = JSON.stringify(data);
    return str.length > 150 ? str.slice(0, 150) + '...]' : str;
  } catch {
    // Not JSON — just truncate
    return content.length > 150 ? content.slice(0, 150) + '...' : content;
  }
}

// ---- Build system prompt ----

export function buildSystemPrompt(
  promptTemplate: string,
  rules: Array<{ prompt_text: string }>,
  tools: ToolDef[],
  memory: Array<{ topic: string; content: string }>,
  mechanicsFile?: string | null,
): string {
  const parts: string[] = [promptTemplate];

  if (mechanicsFile) {
    parts.push('\n\n' + mechanicsFile);
  }

  if (rules.length > 0) {
    parts.push('\n\n## Trading Rules\n' + rules.map(r => `- ${r.prompt_text}`).join('\n'));
  }

  if (tools.length > 0) {
    parts.push(
      '\n\n## Available Tools\nYou have the following tools available:\n' +
      tools.map(t => `- **${t.name}**: ${t.description}`).join('\n')
    );
  }

  if (memory.length > 0) {
    parts.push(
      '\n\n## Your Memory (from previous cycles)\n' +
      memory.map(m => `### ${m.topic}\n${m.content}`).join('\n\n')
    );
  }

  return parts.join('');
}

// ---- Main loop ----

export async function runAgentLoop(config: AgentLoopConfig): Promise<void> {
  // 1. Open DB connection and load config
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  migrate(db);

  try {
    const agent = getAgent(db, config.agentId);
    if (!agent) throw new Error(`Agent not found: ${config.agentId}`);

    const version = getVersion(db, config.configVersionId);
    if (!version) throw new Error(`Config version not found: ${config.configVersionId}`);

    // Load model provider from DB
    const provider = db.prepare(
      `SELECT * FROM model_providers WHERE name = ?`
    ).get(version.model_provider) as { name: string; api_key: string | null; api_base: string | null } | undefined;

    if (!provider || !provider.api_key) {
      throw new Error(`Model provider "${version.model_provider}" not configured or missing API key`);
    }

    // Create LLM client
    const llmClient: LLMClient = createLLMClient(
      version.model_provider,
      provider.api_key,
      version.model_name,
      provider.api_base ?? undefined,
    );

    // Calculate sleep interval
    const sleepMs = INTERVAL_MS[version.schedule_interval] ?? INTERVAL_MS['1h'];
    const maxIterations = config.maxIterationsPerCycle ?? 15;

    // 4. Stagger startup to avoid rate limit storms
    const startupDelay = Math.random() * 10000; // 0-10s random delay
    await new Promise(r => setTimeout(r, startupDelay));

    // 5. Enter main loop
    while (!shutdownRequested) {
      let cycleId = randomUUID();

      try {
        // a. Emit loop_start
        insertEvent(db, config.agentId, 'loop_start', cycleId);

        // b. Build tool registry with current cycle_id
        const registry = buildToolRegistry(db, config.agentId, config.configVersionId, () => cycleId);

        // b2. Generate SDK file so agent scripts can call tools directly
        try {
          const { generateAgentSDK } = await import('./sdk-generator');
          generateAgentSDK(config.agentId, registry.listNames());
        } catch { /* non-critical */ }

        // c. Load rules and memory
        const rules = getVersionRules(db, config.configVersionId)
          .filter(r => r.enabled === 1);
        const memory = getMemory(db, config.agentId);

        // d. Build system prompt
        const systemPrompt = buildSystemPrompt(
          version.prompt_template,
          rules,
          registry.getDefinitions(),
          memory,
          version.mechanics_file,
        );

        // e. Initialize conversation
        const conversation: Message[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Today is ${new Date().toISOString().split('T')[0]}. New cycle. Write a .mjs script to scan for pricing discrepancies, then analyze the output.` },
        ];

        // f. Conversation loop (tool call rounds)
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          // Hard cap: if conversation is too long, keep system + user + recent messages
          // Must start the slice at an assistant message to avoid orphaned tool responses
          if (conversation.length > 20) {
            const system = conversation[0];
            const user = conversation[1];
            let sliceStart = conversation.length - 8;
            // Walk forward to find an assistant message (not a tool response)
            while (sliceStart < conversation.length && conversation[sliceStart].role === 'tool') {
              sliceStart++;
            }
            const recent = conversation.slice(sliceStart);
            conversation.length = 0;
            conversation.push(system, user, ...recent);
          }

          // Compact old tool results — the agent already processed them, shrink to summaries
          // Keep the most recent 6 messages at full fidelity, compact everything before that
          if (conversation.length > 8) {
            const cutoff = conversation.length - 6;
            for (let i = 2; i < cutoff; i++) {
              if (conversation[i].role === 'tool' && conversation[i].content.length > 200) {
                conversation[i] = {
                  ...conversation[i],
                  content: compactToolResult(conversation[i].content),
                };
              }
            }
          }

          const response = await llmClient.chat(conversation, registry.getDefinitions());

          // Log thinking
          if (response.content) {
            insertEvent(db, config.agentId, 'thinking', cycleId, JSON.stringify({ content: response.content }));
          }

          // No tool calls = final response, exit conversation loop
          if (!response.tool_calls || response.tool_calls.length === 0) {
            conversation.push({ role: 'assistant', content: response.content });
            break;
          }

          // Push assistant message WITH tool_calls so the API can match tool results
          conversation.push({
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls,
          });

          // Process tool calls
          for (const toolCall of response.tool_calls) {
            insertEvent(db, config.agentId, 'tool_call', cycleId, JSON.stringify({
              tool_name: toolCall.name,
              arguments: toolCall.arguments,
            }));

            const handler = registry.getHandler(toolCall.name);
            let result: string;
            if (handler) {
              result = await handler(toolCall.arguments);
            } else {
              result = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
            }

            insertEvent(db, config.agentId, 'tool_result', cycleId, JSON.stringify({
              tool_name: toolCall.name,
              result: result.substring(0, 5000),
            }));

            conversation.push({
              role: 'tool',
              content: result,
              tool_call_id: toolCall.id,
            });
          }
        }

        // g. Emit loop_end
        insertEvent(db, config.agentId, 'loop_end', cycleId);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        insertEvent(db, config.agentId, 'error', cycleId, JSON.stringify({ error: errorMsg }));
        logError(config.agentId, cycleId, errorMsg);
      }

      // Notify cycle complete (for testing)
      config.onCycleComplete?.();

      // h. Sleep for schedule_interval (unless shutting down)
      if (!shutdownRequested) {
        await new Promise(resolve => setTimeout(resolve, sleepMs));
      }
    }
  } finally {
    db.close();
  }
}
