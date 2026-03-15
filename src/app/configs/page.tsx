import Link from 'next/link';
import { getDb } from '@/lib/db/index';
import { listConfigs, getLatestVersion, listVersions, getVersionRules, getVersionCapabilities } from '@/lib/db/configs';

interface EnrichedConfig {
  config_id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  latest_version: number;
  model_name: string;
  active_rules: number;
  active_tools: number;
  agent_count: number;
  running_agents: number;
}

function getEnrichedConfigs(): EnrichedConfig[] {
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

    let rulesCount = 0;
    let toolsCount = 0;
    let modelName = '';
    if (latestVersion) {
      rulesCount = (db.prepare(
        `SELECT COUNT(*) as count FROM config_version_rules WHERE version_id = ? AND enabled = 1`
      ).get(latestVersion.version_id) as { count: number }).count;
      toolsCount = (db.prepare(
        `SELECT COUNT(*) as count FROM config_version_capabilities WHERE version_id = ? AND enabled = 1`
      ).get(latestVersion.version_id) as { count: number }).count;
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
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ConfigsPage() {
  const configs = getEnrichedConfigs();

  return (
    <main className="p-8 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-gray-900">Configs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Versioned blueprints for your trading agents</p>
        </div>
        <Link
          href="/configs/new"
          className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
        >
          + New Config
        </Link>
      </div>

      {/* Configs Grid */}
      {configs.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No configs yet</p>
          <p className="text-gray-400 text-sm">Create your first config to start building trading agents.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {configs.map(config => (
            <Link
              key={config.config_id}
              href={`/configs/${config.config_id}`}
              className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[.06] group"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">
                  {config.name}
                </h3>
                {config.latest_version > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                    v{config.latest_version}
                  </span>
                )}
              </div>

              {config.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{config.description}</p>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {config.model_name && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal/10 text-teal">
                    {config.model_name}
                  </span>
                )}
                {config.active_rules > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                    {config.active_rules} rules
                  </span>
                )}
                {config.active_tools > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent">
                    {config.active_tools} tools
                  </span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-black/[.04]">
                <div className="flex items-center gap-1.5">
                  {config.agent_count > 0 ? (
                    <>
                      {Array.from({ length: Math.min(config.agent_count, 5) }).map((_, i) => (
                        <span
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < config.running_agents
                              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                              : 'bg-gray-300'
                          }`}
                        />
                      ))}
                      <span className="ml-1">
                        {config.agent_count} agent{config.agent_count !== 1 ? 's' : ''}
                      </span>
                    </>
                  ) : (
                    <span>No agents</span>
                  )}
                </div>
                <span>{formatDate(config.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
