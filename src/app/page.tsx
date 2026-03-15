import { getDb } from '@/lib/db/index';
import { getLeaderboard, type LeaderboardRow } from '@/lib/db/trades';
import { getRecentEvents } from '@/lib/db/observability';
import { listAgents } from '@/lib/db/agents';
import { getLatestVersion } from '@/lib/db/configs';
import { StatCard } from '@/components/stat-card';
import { LeaderboardRow as LeaderboardRowComponent } from '@/components/leaderboard-row';
import { ActivityItem } from '@/components/activity-item';

function computeStats(leaderboard: LeaderboardRow[], agentCount: number, activeCount: number) {
  let totalPnl = 0;
  let totalPositions = 0;
  let totalWins = 0;
  let totalTrades = 0;

  for (const row of leaderboard) {
    totalPnl += row.realized_pnl + row.unrealized_pnl;
    totalWins += row.wins;
    totalTrades += row.num_trades;
  }

  // Count open positions (agents with unrealized P&L have positions)
  const db = getDb();
  const posCount = db.prepare('SELECT COUNT(*) AS count FROM positions').get() as { count: number };
  totalPositions = posCount.count;

  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  return { totalPnl, activeCount, agentCount, totalPositions, winRate, totalTrades };
}

export default function DashboardPage() {
  const db = getDb();
  const leaderboard = getLeaderboard(db);
  const events = getRecentEvents(db, 20);
  const agents = listAgents(db);

  const activeCount = agents.filter(a => a.status === 'running').length;
  const stats = computeStats(leaderboard, agents.length, activeCount);

  // Build config version lookup for model names
  const configVersionCache = new Map<number, string>();
  for (const agent of agents) {
    if (agent.config_version_id && !configVersionCache.has(agent.config_version_id)) {
      const version = getLatestVersion(db, agent.config_version_id);
      if (version) {
        configVersionCache.set(agent.config_version_id, version.model_name);
      }
    }
  }

  // Build agent lookup for model name
  const agentModelMap = new Map<string, string>();
  for (const agent of agents) {
    if (agent.config_version_id) {
      const modelName = configVersionCache.get(agent.config_version_id);
      if (modelName) agentModelMap.set(agent.agent_id, modelName);
    }
  }

  // Build agent status lookup
  const agentStatusMap = new Map<string, 'running' | 'stopped' | 'failed'>();
  for (const agent of agents) {
    agentStatusMap.set(agent.agent_id, agent.status);
  }

  return (
    <main className="p-8 max-w-7xl mx-auto">
      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="col-span-1">
          <StatCard
            label="Total P&L"
            value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`}
            color="green"
            hero
          />
        </div>
        <StatCard
          label="Today's P&L"
          value="$0.00"
          sub="No trading today"
          color="default"
        />
        <StatCard
          label="Active Agents"
          value={`${stats.activeCount}/${stats.agentCount}`}
          sub={stats.agentCount === 0 ? 'No agents' : undefined}
          color="purple"
        />
        <StatCard
          label="Open Positions"
          value={stats.totalPositions.toString()}
          color="teal"
        />
        <StatCard
          label="Win Rate"
          value={stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '-'}
          sub={stats.totalTrades > 0 ? `${stats.totalTrades} trades` : 'No trades yet'}
          color="orange"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Leaderboard */}
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Agent Leaderboard</h2>
          </div>
          {leaderboard.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-gray-300 text-4xl mb-3">&#9651;</div>
              <p className="text-sm text-gray-400 font-medium">No agents running</p>
              <p className="text-xs text-gray-300 mt-1">Deploy an agent to see leaderboard rankings</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold border-b border-black/5">
                  <th className="py-2 px-4">Rank</th>
                  <th className="py-2 px-4">Agent</th>
                  <th className="py-2 px-4">Model</th>
                  <th className="py-2 px-4 text-right">P&L</th>
                  <th className="py-2 px-4 text-right">Return</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => {
                  const totalPnl = row.realized_pnl + row.unrealized_pnl;
                  const returnPct = row.initial_balance > 0
                    ? (totalPnl / row.initial_balance) * 100
                    : 0;
                  return (
                    <LeaderboardRowComponent
                      key={row.agent_id}
                      rank={idx + 1}
                      agentId={row.agent_id}
                      modelName={agentModelMap.get(row.agent_id)}
                      pnl={totalPnl}
                      returnPct={returnPct}
                      status={agentStatusMap.get(row.agent_id) ?? 'stopped'}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Live Feed */}
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Live Feed</h2>
          </div>
          {events.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-gray-300 text-4xl mb-3">&#9679;</div>
              <p className="text-sm text-gray-400 font-medium">No activity yet</p>
              <p className="text-xs text-gray-300 mt-1">Agent events will appear here in real-time</p>
            </div>
          ) : (
            <div className="divide-y divide-black/5 max-h-[500px] overflow-y-auto">
              {events.map(event => (
                <ActivityItem
                  key={event.id}
                  agentId={event.agent_id}
                  eventType={event.event_type}
                  dataJson={event.data_json}
                  createdAt={event.created_at}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
