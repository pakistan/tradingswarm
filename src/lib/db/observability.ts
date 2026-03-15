import type Database from 'better-sqlite3';
import type { ToolLogRow, AgentMemoryRow, AgentEventRow, DailySnapshotRow } from '../types.js';

// ---- Tool Log ----

export function insertToolLog(
  db: Database.Database,
  params: {
    agent_id: string;
    tool_name: string;
    platform: string;
    cycle_id?: string;
    input_json?: string;
    output_json?: string;
    duration_ms?: number;
    error?: string;
  }
): number {
  const result = db.prepare(`
    INSERT INTO tool_log (agent_id, tool_name, platform, cycle_id, input_json, output_json, duration_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.agent_id,
    params.tool_name,
    params.platform,
    params.cycle_id ?? null,
    params.input_json ?? null,
    params.output_json ?? null,
    params.duration_ms ?? null,
    params.error ?? null
  );
  return Number(result.lastInsertRowid);
}

export function getToolLog(
  db: Database.Database,
  filters: { agent_id?: string; tool_name?: string; limit?: number; after?: string }
): ToolLogRow[] {
  let sql = `SELECT * FROM tool_log WHERE 1=1`;
  const params: unknown[] = [];
  if (filters.agent_id) { sql += ` AND agent_id = ?`; params.push(filters.agent_id); }
  if (filters.tool_name) { sql += ` AND tool_name = ?`; params.push(filters.tool_name); }
  if (filters.after) { sql += ` AND created_at >= ?`; params.push(filters.after); }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(filters.limit ?? 100);
  return db.prepare(sql).all(...params) as ToolLogRow[];
}

export function getToolLogAgents(db: Database.Database): string[] {
  return (db.prepare(
    `SELECT DISTINCT agent_id FROM tool_log ORDER BY agent_id`
  ).all() as { agent_id: string }[]).map(r => r.agent_id);
}

export function getToolLogToolNames(db: Database.Database): string[] {
  return (db.prepare(
    `SELECT DISTINCT tool_name FROM tool_log ORDER BY tool_name`
  ).all() as { tool_name: string }[]).map(r => r.tool_name);
}

// ---- Agent Memory ----

export function upsertMemory(
  db: Database.Database,
  agentId: string,
  topic: string,
  content: string
): void {
  db.prepare(`
    INSERT INTO agent_memory (agent_id, topic, content, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(agent_id, topic) DO UPDATE SET
      content = excluded.content,
      updated_at = datetime('now')
  `).run(agentId, topic, content);
}

export function getMemory(db: Database.Database, agentId: string): AgentMemoryRow[] {
  return db.prepare(
    `SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY topic`
  ).all(agentId) as AgentMemoryRow[];
}

export function deleteMemory(db: Database.Database, agentId: string, topic?: string): void {
  if (topic !== undefined) {
    db.prepare(`DELETE FROM agent_memory WHERE agent_id = ? AND topic = ?`).run(agentId, topic);
  } else {
    db.prepare(`DELETE FROM agent_memory WHERE agent_id = ?`).run(agentId);
  }
}

// ---- Agent Events ----

export function insertEvent(
  db: Database.Database,
  agentId: string,
  eventType: string,
  cycleId?: string,
  dataJson?: string
): number {
  const result = db.prepare(`
    INSERT INTO agent_events (agent_id, event_type, cycle_id, data_json)
    VALUES (?, ?, ?, ?)
  `).run(agentId, eventType, cycleId ?? null, dataJson ?? null);
  return Number(result.lastInsertRowid);
}

export function getEvents(
  db: Database.Database,
  agentId: string,
  afterId?: number,
  limit = 100
): AgentEventRow[] {
  if (afterId !== undefined) {
    return db.prepare(
      `SELECT * FROM agent_events WHERE agent_id = ? AND id > ? ORDER BY id ASC LIMIT ?`
    ).all(agentId, afterId, limit) as AgentEventRow[];
  }
  return db.prepare(
    `SELECT * FROM agent_events WHERE agent_id = ? ORDER BY id ASC LIMIT ?`
  ).all(agentId, limit) as AgentEventRow[];
}

export function getRecentEvents(
  db: Database.Database,
  limit = 20
): AgentEventRow[] {
  return db.prepare(
    `SELECT * FROM agent_events ORDER BY id DESC LIMIT ?`
  ).all(limit) as AgentEventRow[];
}

// ---- Daily Snapshots ----

export function insertDailySnapshot(
  db: Database.Database,
  agentId: string,
  date: string,
  data: {
    cash: number;
    positions_value: number;
    realized_pnl_cumulative: number;
    unrealized_pnl: number;
    total_portfolio_value: number;
  }
): void {
  db.prepare(`
    INSERT INTO daily_snapshots (agent_id, date, cash, positions_value, realized_pnl_cumulative, unrealized_pnl, total_portfolio_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, date) DO UPDATE SET
      cash = excluded.cash,
      positions_value = excluded.positions_value,
      realized_pnl_cumulative = excluded.realized_pnl_cumulative,
      unrealized_pnl = excluded.unrealized_pnl,
      total_portfolio_value = excluded.total_portfolio_value,
      created_at = datetime('now')
  `).run(
    agentId,
    date,
    data.cash,
    data.positions_value,
    data.realized_pnl_cumulative,
    data.unrealized_pnl,
    data.total_portfolio_value
  );
}

export function getDailySnapshots(
  db: Database.Database,
  agentId: string,
  days?: number
): DailySnapshotRow[] {
  if (days !== undefined) {
    return db.prepare(
      `SELECT * FROM daily_snapshots WHERE agent_id = ? ORDER BY date DESC LIMIT ?`
    ).all(agentId, days) as DailySnapshotRow[];
  }
  return db.prepare(
    `SELECT * FROM daily_snapshots WHERE agent_id = ? ORDER BY date DESC`
  ).all(agentId) as DailySnapshotRow[];
}
