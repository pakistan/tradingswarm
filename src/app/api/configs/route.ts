import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listConfigs, createConfig, getLatestVersion, createVersion, listRules, listTools, setVersionRules, setVersionCapabilities } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  const configs = listConfigs(db);

  const enriched = configs.map(config => {
    const latestVersion = getLatestVersion(db, config.config_id);
    const agentCount = (db.prepare(
      `SELECT COUNT(*) as count FROM agents WHERE config_version_id IN (SELECT version_id FROM config_versions WHERE config_id = ?)`
    ).get(config.config_id) as { count: number }).count;
    const runningCount = (db.prepare(
      `SELECT COUNT(*) as count FROM agents WHERE status = 'running' AND config_version_id IN (SELECT version_id FROM config_versions WHERE config_id = ?)`
    ).get(config.config_id) as { count: number }).count;

    let rulesCount = 0;
    let toolsCount = 0;
    let modelName = '';
    if (latestVersion) {
      const versionRules = db.prepare(
        `SELECT COUNT(*) as count FROM config_version_rules WHERE version_id = ? AND enabled = 1`
      ).get(latestVersion.version_id) as { count: number };
      rulesCount = versionRules.count;

      const versionTools = db.prepare(
        `SELECT COUNT(*) as count FROM config_version_capabilities WHERE version_id = ? AND enabled = 1`
      ).get(latestVersion.version_id) as { count: number };
      toolsCount = versionTools.count;
      modelName = latestVersion.model_name;
    }

    return {
      ...config,
      latest_version: latestVersion?.version_num ?? 0,
      model_name: modelName,
      active_rules: rulesCount,
      active_tools: toolsCount,
      agent_count: agentCount,
      running_agents: runningCount,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const db = getDb();
  const body = await request.json();
  const { name, description, prompt_template, model_provider, model_name, bankroll, schedule_interval } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const config = createConfig(db, name, description);

  // Create initial version if prompt is provided
  if (prompt_template) {
    const version = createVersion(db, config.config_id, {
      model_provider: model_provider ?? 'deepseek',
      model_name: model_name ?? 'deepseek-chat',
      bankroll: bankroll ?? 10000,
      prompt_template,
      schedule_interval: schedule_interval ?? '1h',
    });

    // Set all rules as enabled by default
    const allRules = listRules(db);
    if (allRules.length > 0) {
      setVersionRules(db, version.version_id, allRules.map(r => ({ rule_id: r.rule_id, enabled: true })));
    }

    // Set all tool capabilities as enabled by default
    const allTools = listTools(db);
    const allCaps = allTools.flatMap(t => t.capabilities);
    if (allCaps.length > 0) {
      setVersionCapabilities(db, version.version_id, allCaps.map(c => ({ capability_id: c.capability_id, enabled: true })));
    }
  }

  return NextResponse.json(config, { status: 201 });
}
