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

// Handle shutdown signals
process.on('SIGTERM', () => {
  console.log(`[worker:${agentId}] Received SIGTERM, shutting down gracefully...`);
  requestShutdown();
});

process.on('SIGINT', () => {
  console.log(`[worker:${agentId}] Received SIGINT, shutting down gracefully...`);
  requestShutdown();
});

// Notify parent we're ready
process.send?.({ type: 'ready', agentId });

// Run the loop
runAgentLoop({ agentId, configVersionId, dbPath })
  .then(() => {
    console.log(`[worker:${agentId}] Loop exited cleanly.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[worker:${agentId}] Fatal error:`, err);
    process.exit(1);
  });
