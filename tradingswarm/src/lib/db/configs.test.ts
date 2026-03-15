import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  createConfig, getConfig, listConfigs,
  createVersion, getVersion, getLatestVersion, listVersions,
  setVersionRules, setVersionCapabilities, getVersionRules, getVersionCapabilities,
  createRule, listRules,
  createTool, createCapability, listTools,
  createModelProvider, listModelProviders,
} from './configs';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('configs', () => {
  it('creates and retrieves a config', () => {
    const cfg = createConfig(db, 'alpha', 'test config');
    expect(cfg.config_id).toBeGreaterThan(0);
    expect(cfg.name).toBe('alpha');
    expect(cfg.description).toBe('test config');

    const fetched = getConfig(db, cfg.config_id);
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe('alpha');
  });

  it('creates config without description', () => {
    const cfg = createConfig(db, 'no-desc');
    expect(cfg.description).toBeNull();
  });

  it('lists configs', () => {
    createConfig(db, 'a');
    createConfig(db, 'b');
    const list = listConfigs(db);
    expect(list).toHaveLength(2);
  });

  it('returns undefined for missing config', () => {
    expect(getConfig(db, 9999)).toBeUndefined();
  });

  it('rejects duplicate config names', () => {
    createConfig(db, 'unique');
    expect(() => createConfig(db, 'unique')).toThrow();
  });
});

describe('config versions', () => {
  it('creates version with auto-incrementing version_num', () => {
    const cfg = createConfig(db, 'cfg1');
    const v1 = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'You are a trader.',
    });
    expect(v1.version_num).toBe(1);

    const v2 = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'Updated.',
    });
    expect(v2.version_num).toBe(2);
  });

  it('version_num resets per config', () => {
    const c1 = createConfig(db, 'c1');
    const c2 = createConfig(db, 'c2');
    createVersion(db, c1.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    createVersion(db, c1.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    const v = createVersion(db, c2.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    expect(v.version_num).toBe(1);
  });

  it('getLatestVersion returns highest version_num', () => {
    const cfg = createConfig(db, 'cfg2');
    createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p1' });
    createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p2' });
    const latest = getLatestVersion(db, cfg.config_id);
    expect(latest?.version_num).toBe(2);
    expect(latest?.prompt_template).toBe('p2');
  });

  it('listVersions returns all versions in order', () => {
    const cfg = createConfig(db, 'cfg3');
    createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'q' });
    createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'r' });
    const versions = listVersions(db, cfg.config_id);
    expect(versions).toHaveLength(3);
    expect(versions[0].version_num).toBe(1);
    expect(versions[2].version_num).toBe(3);
  });

  it('uses defaults for optional fields', () => {
    const cfg = createConfig(db, 'cfg-defaults');
    const v = createVersion(db, cfg.config_id, {
      model_provider: 'anthropic',
      model_name: 'claude-3-5-sonnet',
      prompt_template: 'test',
    });
    expect(v.bankroll).toBe(10000.0);
    expect(v.schedule_interval).toBe('1h');
    expect(v.mechanics_file).toBeNull();
    expect(v.diff_summary).toBeNull();
  });
});

describe('version rules and capabilities', () => {
  it('setVersionRules and getVersionRules', () => {
    const cfg = createConfig(db, 'rules-cfg');
    const v = createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    const rule1 = createRule(db, 'rule1', 'Do X');
    const rule2 = createRule(db, 'rule2', 'Do Y');

    setVersionRules(db, v.version_id, [
      { rule_id: rule1.rule_id, enabled: true },
      { rule_id: rule2.rule_id, enabled: false },
    ]);

    const rules = getVersionRules(db, v.version_id);
    expect(rules).toHaveLength(2);
    const r1 = rules.find(r => r.rule_id === rule1.rule_id)!;
    expect(r1.enabled).toBe(1);
    const r2 = rules.find(r => r.rule_id === rule2.rule_id)!;
    expect(r2.enabled).toBe(0);
  });

  it('setVersionRules replaces existing rules', () => {
    const cfg = createConfig(db, 'replace-cfg');
    const v = createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    const rule1 = createRule(db, 'r-a', 'Prompt A');
    const rule2 = createRule(db, 'r-b', 'Prompt B');

    setVersionRules(db, v.version_id, [{ rule_id: rule1.rule_id, enabled: true }]);
    setVersionRules(db, v.version_id, [{ rule_id: rule2.rule_id, enabled: true }]);

    const rules = getVersionRules(db, v.version_id);
    expect(rules).toHaveLength(1);
    expect(rules[0].rule_id).toBe(rule2.rule_id);
  });

  it('setVersionCapabilities and getVersionCapabilities', () => {
    const cfg = createConfig(db, 'caps-cfg');
    const v = createVersion(db, cfg.config_id, { model_provider: 'a', model_name: 'm', prompt_template: 'p' });
    const tool = createTool(db, 'polymarket', 'polymarket');
    const cap = createCapability(db, tool.tool_id, 'pm_buy', 'handleBuy');

    setVersionCapabilities(db, v.version_id, [{ capability_id: cap.capability_id, enabled: true }]);
    const caps = getVersionCapabilities(db, v.version_id);
    expect(caps).toHaveLength(1);
    expect(caps[0].capability_id).toBe(cap.capability_id);
    expect(caps[0].enabled).toBe(1);
  });
});

describe('rules', () => {
  it('creates and lists rules', () => {
    createRule(db, 'never-yolo', 'Never bet more than 10%', 'risk management', 'risk');
    createRule(db, 'always-log', 'Always log decisions', undefined, 'ops');
    const rules = listRules(db);
    expect(rules).toHaveLength(2);
  });

  it('rule has correct fields', () => {
    const r = createRule(db, 'test-rule', 'Do this', 'desc', 'cat');
    expect(r.name).toBe('test-rule');
    expect(r.prompt_text).toBe('Do this');
    expect(r.description).toBe('desc');
    expect(r.category).toBe('cat');
    expect(r.rule_id).toBeGreaterThan(0);
  });
});

describe('tools and capabilities', () => {
  it('creates tool and lists it with capabilities', () => {
    const tool = createTool(db, 'pm-tool', 'polymarket', 'Polymarket tool');
    const cap1 = createCapability(db, tool.tool_id, 'pm_buy', 'handleBuy', 'Buy shares');
    const cap2 = createCapability(db, tool.tool_id, 'pm_sell', 'handleSell');

    const tools = listTools(db);
    expect(tools).toHaveLength(1);
    expect(tools[0].capabilities).toHaveLength(2);
    expect(tools[0].capabilities.map(c => c.name)).toContain('pm_buy');
    expect(tools[0].capabilities.map(c => c.name)).toContain('pm_sell');
  });

  it('capability has correct fields', () => {
    const tool = createTool(db, 'tool2', 'hub');
    const cap = createCapability(db, tool.tool_id, 'hub_post', 'handlePost', 'Post to hub');
    expect(cap.capability_id).toBeGreaterThan(0);
    expect(cap.tool_id).toBe(tool.tool_id);
    expect(cap.handler).toBe('handlePost');
    expect(cap.description).toBe('Post to hub');
  });
});

describe('model providers', () => {
  it('creates and lists model providers', () => {
    const p = createModelProvider(db, 'anthropic', 'Anthropic', 'https://api.anthropic.com', 'sk-key', 'claude-3-5-sonnet');
    expect(p.provider_id).toBeGreaterThan(0);
    expect(p.name).toBe('anthropic');
    expect(p.display_name).toBe('Anthropic');
    expect(p.api_base).toBe('https://api.anthropic.com');
    expect(p.default_model).toBe('claude-3-5-sonnet');
    expect(p.enabled).toBe(1);

    const providers = listModelProviders(db);
    expect(providers).toHaveLength(1);
  });

  it('creates provider without optional fields', () => {
    const p = createModelProvider(db, 'openai', 'OpenAI');
    expect(p.api_base).toBeNull();
    expect(p.api_key).toBeNull();
    expect(p.default_model).toBeNull();
  });
});
