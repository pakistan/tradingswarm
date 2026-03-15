import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { migrate } from '@/lib/db/schema';
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

// ---- Build system prompt ----

export function buildSystemPrompt(
  promptTemplate: string,
  rules: Array<{ prompt_text: string }>,
  tools: ToolDef[],
  memory: Array<{ topic: string; content: string }>,
): string {
  const parts: string[] = [promptTemplate];

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
    const maxIterations = config.maxIterationsPerCycle ?? 20;

    // 4. Enter main loop
    while (!shutdownRequested) {
      let cycleId = randomUUID();

      try {
        // a. Emit loop_start
        insertEvent(db, config.agentId, 'loop_start', cycleId);

        // b. Build tool registry with current cycle_id
        const registry = buildToolRegistry(db, config.agentId, config.configVersionId, () => cycleId);

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
        );

        // e. Initialize conversation
        const conversation: Message[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Execute your next trading cycle. Review markets, check positions, and make any trades you see fit.' },
        ];

        // f. Conversation loop (tool call rounds)
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          const response = await llmClient.chat(conversation, registry.getDefinitions());

          // Log thinking
          if (response.content) {
            insertEvent(db, config.agentId, 'thinking', cycleId, JSON.stringify({ content: response.content }));
            conversation.push({ role: 'assistant', content: response.content });
          }

          // No tool calls = final response, exit conversation loop
          if (!response.tool_calls || response.tool_calls.length === 0) {
            break;
          }

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
