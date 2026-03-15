import type Database from 'better-sqlite3';
import type { AgentRow } from '../types.js';

export function createAgent(
  db: Database.Database,
  agentId: string,
  displayName?: string,
  configVersionId?: number
): AgentRow {
  db.prepare(
    `INSERT INTO agents (agent_id, display_name, config_version_id) VALUES (?, ?, ?)`
  ).run(agentId, displayName ?? null, configVersionId ?? null);
  return db.prepare(`SELECT * FROM agents WHERE agent_id = ?`).get(agentId) as AgentRow;
}

export function getAgent(db: Database.Database, agentId: string): AgentRow | undefined {
  return db.prepare(`SELECT * FROM agents WHERE agent_id = ?`).get(agentId) as AgentRow | undefined;
}

export function listAgents(db: Database.Database): AgentRow[] {
  return db.prepare(`SELECT * FROM agents ORDER BY created_at DESC`).all() as AgentRow[];
}

export function updateAgentStatus(
  db: Database.Database,
  agentId: string,
  status: 'running' | 'stopped' | 'failed',
  pid?: number
): void {
  db.prepare(
    `UPDATE agents SET status = ?, pid = ?, last_run_at = datetime('now'), updated_at = datetime('now') WHERE agent_id = ?`
  ).run(status, pid ?? null, agentId);
}

export function updateAgentCash(db: Database.Database, agentId: string, delta: number): void {
  const result = db.prepare(
    `UPDATE agents SET current_cash = current_cash + ?, updated_at = datetime('now')
     WHERE agent_id = ? AND current_cash + ? >= 0`
  ).run(delta, agentId, delta);
  if (result.changes === 0) {
    throw new Error(`Insufficient cash for agent ${agentId}`);
  }
}

export function getAgentsByConfigVersion(db: Database.Database, versionId: number): AgentRow[] {
  return db.prepare(
    `SELECT * FROM agents WHERE config_version_id = ? ORDER BY created_at DESC`
  ).all(versionId) as AgentRow[];
}
