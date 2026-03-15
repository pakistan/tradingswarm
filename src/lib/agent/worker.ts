/**
 * Worker process script — spawned via child_process.fork() from AgentManager.
 * Expects environment variables:
 *   AGENT_ID            — the agent's ID
 *   CONFIG_VERSION_ID   — the config version to run
 *   DATABASE_PATH       — path to the SQLite database
 */

import { runAgentLoop, requestShutdown } from './agent-loop';

const agentId = process.env.AGENT_ID;
const configVersionId = process.env.CONFIG_VERSION_ID ? parseInt(process.env.CONFIG_VERSION_ID, 10) : undefined;
const dbPath = process.env.DATABASE_PATH;

if (!agentId || !configVersionId || !dbPath) {
  console.error('Worker missing required env vars: AGENT_ID, CONFIG_VERSION_ID, DATABASE_PATH');
  process.exit(1);
}

process.on('SIGTERM', () => { requestShutdown(); });
process.on('SIGINT', () => { requestShutdown(); });

runAgentLoop({ agentId, configVersionId, dbPath })
  .then(() => process.exit(0))
  .catch((err) => { console.error(`[worker:${agentId}]`, err); process.exit(1); });
