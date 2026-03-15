import type Database from 'better-sqlite3';
import type { ConfigRow, ConfigVersionRow, RuleRow, ToolRow, ToolCapabilityRow, ModelProviderRow } from '../types.js';

// ---- Configs ----

export function createConfig(
  db: Database.Database,
  name: string,
  description?: string
): ConfigRow {
  const result = db.prepare(
    `INSERT INTO configs (name, description) VALUES (?, ?)`
  ).run(name, description ?? null);
  return db.prepare(`SELECT * FROM configs WHERE config_id = ?`).get(result.lastInsertRowid) as ConfigRow;
}

export function getConfig(db: Database.Database, configId: number): ConfigRow | undefined {
  return db.prepare(`SELECT * FROM configs WHERE config_id = ?`).get(configId) as ConfigRow | undefined;
}

export function listConfigs(db: Database.Database): ConfigRow[] {
  return db.prepare(`SELECT * FROM configs ORDER BY created_at DESC`).all() as ConfigRow[];
}

// ---- Config Versions ----

export function createVersion(
  db: Database.Database,
  configId: number,
  data: {
    model_provider: string;
    model_name: string;
    bankroll?: number;
    prompt_template: string;
    mechanics_file?: string;
    schedule_interval?: string;
    diff_summary?: string;
  }
): ConfigVersionRow {
  const maxRow = db.prepare(
    `SELECT COALESCE(MAX(version_num), 0) AS max_ver FROM config_versions WHERE config_id = ?`
  ).get(configId) as { max_ver: number };
  const nextVersion = maxRow.max_ver + 1;

  const result = db.prepare(`
    INSERT INTO config_versions
      (config_id, version_num, model_provider, model_name, bankroll, prompt_template, mechanics_file, schedule_interval, diff_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    configId,
    nextVersion,
    data.model_provider,
    data.model_name,
    data.bankroll ?? 10000.0,
    data.prompt_template,
    data.mechanics_file ?? null,
    data.schedule_interval ?? '1h',
    data.diff_summary ?? null
  );
  return db.prepare(`SELECT * FROM config_versions WHERE version_id = ?`).get(result.lastInsertRowid) as ConfigVersionRow;
}

export function getVersion(db: Database.Database, versionId: number): ConfigVersionRow | undefined {
  return db.prepare(`SELECT * FROM config_versions WHERE version_id = ?`).get(versionId) as ConfigVersionRow | undefined;
}

export function getLatestVersion(db: Database.Database, configId: number): ConfigVersionRow | undefined {
  return db.prepare(
    `SELECT * FROM config_versions WHERE config_id = ? ORDER BY version_num DESC LIMIT 1`
  ).get(configId) as ConfigVersionRow | undefined;
}

export function listVersions(db: Database.Database, configId: number): ConfigVersionRow[] {
  return db.prepare(
    `SELECT * FROM config_versions WHERE config_id = ? ORDER BY version_num ASC`
  ).all(configId) as ConfigVersionRow[];
}

// ---- Version Rules / Capabilities ----

export function setVersionRules(
  db: Database.Database,
  versionId: number,
  rules: { rule_id: number; enabled: boolean }[]
): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM config_version_rules WHERE version_id = ?`).run(versionId);
    const insert = db.prepare(
      `INSERT INTO config_version_rules (version_id, rule_id, enabled) VALUES (?, ?, ?)`
    );
    for (const r of rules) {
      insert.run(versionId, r.rule_id, r.enabled ? 1 : 0);
    }
  })();
}

export function setVersionCapabilities(
  db: Database.Database,
  versionId: number,
  caps: { capability_id: number; enabled: boolean }[]
): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM config_version_capabilities WHERE version_id = ?`).run(versionId);
    const insert = db.prepare(
      `INSERT INTO config_version_capabilities (version_id, capability_id, enabled) VALUES (?, ?, ?)`
    );
    for (const c of caps) {
      insert.run(versionId, c.capability_id, c.enabled ? 1 : 0);
    }
  })();
}

export function getVersionRules(
  db: Database.Database,
  versionId: number
): (RuleRow & { enabled: number })[] {
  return db.prepare(`
    SELECT r.*, cvr.enabled
    FROM rules r
    JOIN config_version_rules cvr ON cvr.rule_id = r.rule_id
    WHERE cvr.version_id = ?
    ORDER BY r.rule_id
  `).all(versionId) as (RuleRow & { enabled: number })[];
}

export function getVersionCapabilities(
  db: Database.Database,
  versionId: number
): (ToolCapabilityRow & { enabled: number })[] {
  return db.prepare(`
    SELECT tc.*, cvc.enabled
    FROM tool_capabilities tc
    JOIN config_version_capabilities cvc ON cvc.capability_id = tc.capability_id
    WHERE cvc.version_id = ?
    ORDER BY tc.capability_id
  `).all(versionId) as (ToolCapabilityRow & { enabled: number })[];
}

// ---- Rules ----

export function createRule(
  db: Database.Database,
  name: string,
  prompt_text: string,
  description?: string,
  category?: string
): RuleRow {
  const result = db.prepare(
    `INSERT INTO rules (name, prompt_text, description, category) VALUES (?, ?, ?, ?)`
  ).run(name, prompt_text, description ?? null, category ?? null);
  return db.prepare(`SELECT * FROM rules WHERE rule_id = ?`).get(result.lastInsertRowid) as RuleRow;
}

export function listRules(db: Database.Database): RuleRow[] {
  return db.prepare(`SELECT * FROM rules ORDER BY rule_id`).all() as RuleRow[];
}

// ---- Tools ----

export function createTool(
  db: Database.Database,
  name: string,
  platform: string,
  description?: string
): ToolRow {
  const result = db.prepare(
    `INSERT INTO tools (name, platform, description) VALUES (?, ?, ?)`
  ).run(name, platform, description ?? null);
  return db.prepare(`SELECT * FROM tools WHERE tool_id = ?`).get(result.lastInsertRowid) as ToolRow;
}

export function createCapability(
  db: Database.Database,
  toolId: number,
  name: string,
  handler: string,
  description?: string
): ToolCapabilityRow {
  const result = db.prepare(
    `INSERT INTO tool_capabilities (tool_id, name, handler, description) VALUES (?, ?, ?, ?)`
  ).run(toolId, name, handler, description ?? null);
  return db.prepare(`SELECT * FROM tool_capabilities WHERE capability_id = ?`).get(result.lastInsertRowid) as ToolCapabilityRow;
}

export function listTools(db: Database.Database): (ToolRow & { capabilities: ToolCapabilityRow[] })[] {
  const tools = db.prepare(`SELECT * FROM tools ORDER BY tool_id`).all() as ToolRow[];
  const allCaps = db.prepare(`SELECT * FROM tool_capabilities ORDER BY capability_id`).all() as ToolCapabilityRow[];
  return tools.map(tool => ({
    ...tool,
    capabilities: allCaps.filter(c => c.tool_id === tool.tool_id),
  }));
}

// ---- Model Providers ----

export function createModelProvider(
  db: Database.Database,
  name: string,
  display_name: string,
  api_base?: string,
  api_key?: string,
  default_model?: string
): ModelProviderRow {
  const result = db.prepare(
    `INSERT INTO model_providers (name, display_name, api_base, api_key, default_model) VALUES (?, ?, ?, ?, ?)`
  ).run(name, display_name, api_base ?? null, api_key ?? null, default_model ?? null);
  return db.prepare(`SELECT * FROM model_providers WHERE provider_id = ?`).get(result.lastInsertRowid) as ModelProviderRow;
}

export function listModelProviders(db: Database.Database): ModelProviderRow[] {
  return db.prepare(`SELECT * FROM model_providers ORDER BY provider_id`).all() as ModelProviderRow[];
}

export function updateModelProvider(
  db: Database.Database,
  providerId: number,
  data: { api_key?: string; default_model?: string; enabled?: boolean }
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.api_key !== undefined) { sets.push('api_key = ?'); params.push(data.api_key); }
  if (data.default_model !== undefined) { sets.push('default_model = ?'); params.push(data.default_model); }
  if (data.enabled !== undefined) { sets.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
  if (sets.length === 0) return;
  params.push(providerId);
  db.prepare(`UPDATE model_providers SET ${sets.join(', ')} WHERE provider_id = ?`).run(...params);
}

export function deleteRule(db: Database.Database, ruleId: number): void {
  db.prepare(`DELETE FROM config_version_rules WHERE rule_id = ?`).run(ruleId);
  db.prepare(`DELETE FROM rules WHERE rule_id = ?`).run(ruleId);
}
