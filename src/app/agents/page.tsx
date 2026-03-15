import { getDb } from '@/lib/db/index';
import { listAgents } from '@/lib/db/agents';
import { getLeaderboard } from '@/lib/db/trades';
import { getVersion, getConfig, listConfigs, getLatestVersion } from '@/lib/db/configs';
import { AgentsClient, type AgentCardData, type ConfigCardData } from '@/components/agents-client';
import type { AgentRow } from '@/lib/types';
import type { LeaderboardRow } from '@/lib/db/trades';

function buildAgentCards(
  agents: AgentRow[],
  leaderboard: LeaderboardRow[],
): AgentCardData[] {
  const db = getDb();
  const lbMap = new Map<string, LeaderboardRow>();
  for (const row of leaderboard) {
    lbMap.set(row.agent_id, row);
  }

  return agents.map(agent => {
    const lb = lbMap.get(agent.agent_id);
    const pnl = lb ? lb.realized_pnl + lb.unrealized_pnl : 0;
    const winRate = lb && lb.num_trades > 0 ? (lb.wins / lb.num_trades) * 100 : 0;

    let configName: string | null = null;
    let configVersion: number | null = null;
    let modelName: string | null = null;
    let scheduleInterval: string | null = null;

    let promptTemplate: string | null = null;
    let mechanicsFile: string | null = null;

    if (agent.config_version_id) {
      const version = getVersion(db, agent.config_version_id);
      if (version) {
        modelName = version.model_name;
        configVersion = version.version_num;
        scheduleInterval = version.schedule_interval;
        promptTemplate = version.prompt_template;
        mechanicsFile = version.mechanics_file;
        const config = getConfig(db, version.config_id);
        if (config) configName = config.name;
      }
    }

    // Get counts
    const positionsCount = (db.prepare(
      'SELECT COUNT(*) AS count FROM positions WHERE agent_id = ?'
    ).get(agent.agent_id) as { count: number }).count;

    const pendingOrdersCount = (db.prepare(
      "SELECT COUNT(*) AS count FROM orders WHERE agent_id = ? AND status IN ('pending', 'partial')"
    ).get(agent.agent_id) as { count: number }).count;

    const memoryCount = (db.prepare(
      'SELECT COUNT(*) AS count FROM agent_memory WHERE agent_id = ?'
    ).get(agent.agent_id) as { count: number }).count;

    const tradeHistoryCount = (db.prepare(
      'SELECT COUNT(*) AS count FROM trade_history WHERE agent_id = ?'
    ).get(agent.agent_id) as { count: number }).count;

    return {
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      status: agent.status,
      config_name: configName,
      config_version: configVersion,
      model_name: modelName,
      schedule_interval: scheduleInterval,
      pnl,
      num_trades: lb?.num_trades ?? 0,
      win_rate: winRate,
      current_cash: agent.current_cash,
      positions_count: positionsCount,
      pending_orders_count: pendingOrdersCount,
      memory_count: memoryCount,
      trade_history_count: tradeHistoryCount,
      prompt_template: promptTemplate,
      mechanics_file: mechanicsFile,
    };
  });
}

function buildConfigCards(): ConfigCardData[] {
  const db = getDb();
  const configs = listConfigs(db);
  return configs.map(config => {
    const latestVersion = getLatestVersion(db, config.config_id);
    const agentCount = (db.prepare(
      `SELECT COUNT(*) as count FROM agents WHERE config_version_id IN (SELECT version_id FROM config_versions WHERE config_id = ?)`
    ).get(config.config_id) as { count: number }).count;
    const runningCount = (db.prepare(
      `SELECT COUNT(*) as count FROM agents WHERE status = 'running' AND config_version_id IN (SELECT version_id FROM config_versions WHERE config_id = ?)`
    ).get(config.config_id) as { count: number }).count;
    let toolsCount = 0;
    if (latestVersion) {
      toolsCount = (db.prepare(
        `SELECT COUNT(*) as count FROM config_version_capabilities WHERE version_id = ? AND enabled = 1`
      ).get(latestVersion.version_id) as { count: number }).count;
    }
    return {
      config_id: config.config_id,
      name: config.name,
      description: config.description,
      model_name: latestVersion?.model_name ?? '',
      latest_version: latestVersion?.version_num ?? 0,
      active_tools: toolsCount,
      agent_count: agentCount,
      running_agents: runningCount,
      updated_at: config.updated_at,
    };
  });
}

export default function AgentsPage() {
  const db = getDb();
  const agents = listAgents(db);
  const leaderboard = getLeaderboard(db);
  const agentCards = buildAgentCards(agents, leaderboard);
  const configCards = buildConfigCards();

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {agents.length} agent{agents.length !== 1 ? 's' : ''} deployed
          </p>
        </div>
        <button className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5">
          + New Agent
        </button>
      </div>

      <AgentsClient agents={agentCards} configs={configCards} />
    </main>
  );
}
