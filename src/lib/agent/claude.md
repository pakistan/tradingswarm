# Agent Module

Agent runtime: the loop that wakes up, thinks, trades, and sleeps.

## Files

### `agent-loop.ts` — Main Agent Cycle
The core loop. Called by worker.ts in a spawned process.

```typescript
runAgentLoop({ agentId, configVersionId, dbPath }) → Promise<void>
```

Each cycle:
1. Opens own DB connection (not shared with Next.js)
2. Loads config version, model provider, creates LLM client
3. Builds system prompt (template + mechanics + rules + tools + memory)
4. Sends user message with today's date
5. Tool call loop (max 12 iterations):
   - LLM responds with tool calls
   - Execute tools, add results to conversation
   - Compact old tool results to save context
   - Hard cap: 20 messages max, then trim
6. Sleeps for schedule_interval
7. Repeat forever until SIGTERM

**Context management:**
- Old tool results (beyond last 6 messages) get compacted via `compactToolResult()`
- If conversation exceeds 20 messages, keep system + user + last 8
- Tool results truncated to 2000 chars... wait no, that was removed. Full results kept, compacted later.

**Prompt assembly:**
`buildSystemPrompt(template, rules, tools, memory, mechanicsFile)`
- Template from config version
- Rules from config_version_rules
- Tools from registry.getDefinitions()
- Memory from agent_memory table
- Mechanics from config version mechanics_file

### `agent-manager.ts` — Process Lifecycle
Spawns agents as separate tsx processes. NOT forked from Next.js (to avoid fetch patching).

```typescript
const manager = new AgentManager(db, dbPath, workerPath);
manager.spawn(agentId)     // Start agent
manager.stop(agentId)      // SIGTERM
manager.restart(agentId)   // Stop + spawn
manager.recoverRunningAgents()  // Re-spawn on server restart
```

Uses `child_process.spawn` with tsx binary. Worker gets env vars: AGENT_ID, CONFIG_VERSION_ID, DATABASE_PATH.

Retry logic: max 5 retries in 30-minute window, exponential backoff (1s, 2s, 4s, 8s).

### `worker.ts` — Worker Entry Point
Spawned by AgentManager. Reads env vars, calls runAgentLoop, handles SIGTERM.

### `llm-client.ts` — LLM Abstraction
Generic interface for any LLM provider.

```typescript
interface LLMClient {
  chat(messages: Message[], tools?: ToolDef[]): Promise<LLMResponse>;
}
```

Implementations:
- `AnthropicClient` — uses separate `system` param, `tool_use` blocks
- `OpenAICompatibleClient` — works with OpenAI, DeepSeek, Moonshot, Google. Has retry logic for 429/5xx.

**Critical:** Assistant messages with tool calls MUST include the `tool_calls` array. Without it, the API returns 400 on the next request. The `Message` type has an optional `tool_calls` field for this.

### `tool-registry.ts` — Tool Definitions and Handlers
~1000 lines. Defines all 39 tools and builds handlers.

```typescript
buildToolRegistry(db, agentId, configVersionId, cycleIdFn) → ToolRegistry
```

Pattern: each platform has a handler builder function. Trading tools delegate to TradingService. Data tools call APIs directly. All handlers wrapped with `wrapWithLogging` for observability.

**Tool config:** API keys read from tools table `config_json` via `getToolConfig(db, toolName)`.

### `mechanics.md` — System Mechanics
Injected into the agent's system prompt. Documents all tools equally. No strategy prescription.

### `singleton.ts` — AgentManager Singleton
Used by API routes. Worker path hardcoded to `src/lib/agent/worker.ts`.

## Common Mistakes
- Using `fork()` instead of `spawn()` — fork inherits Next.js's patched fetch which breaks external API calls
- Forgetting to include tool_calls on assistant messages → 400 from OpenAI
- Letting conversation grow unbounded → context overflow (128k limit)
- Not setting max_tokens on LLM calls → verbose responses waste tokens
- Worker path resolution — uses `process.cwd()` not `import.meta.url`
