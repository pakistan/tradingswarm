import { getDb } from '@/lib/db';
import { AgentManager } from './agent-manager';
import path from 'node:path';

let _manager: AgentManager | null = null;

/**
 * Get (or create) the singleton AgentManager instance.
 * Used by API routes to manage agent lifecycle.
 */
export function getAgentManager(): AgentManager {
  if (_manager) return _manager;

  const db = getDb();
  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'tradingswarm.db');
  const workerPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'worker.ts');

  _manager = new AgentManager(db, dbPath, workerPath);

  // Recover any agents that were running before a server restart
  _manager.recoverRunningAgents();

  return _manager;
}

/**
 * Reset the singleton (for testing).
 */
export function resetAgentManager(): void {
  if (_manager) {
    _manager.stopAll();
    _manager = null;
  }
}
