import { getDb } from '@/lib/db/index';
import { getLeaderboard } from '@/lib/db/trades';
import { getRecentEvents } from '@/lib/db/observability';
import { listAgents } from '@/lib/db/agents';
import { getLatestVersion } from '@/lib/db/configs';
import { TradingService } from '@/lib/trading/service';
import { PolymarketPlatform } from '@/lib/platforms/polymarket/adapter';
import { BinancePlatform } from '@/lib/platforms/binance/adapter';
import { StatCard } from '@/components/stat-card';
import { LeaderboardRow as LeaderboardRowComponent } from '@/components/leaderboard-row';
import { ActivityItem } from '@/components/activity-item';

export default function DashboardPage() {
  const db = getDb();
  const leaderboard = getLeaderboard(db);
  const events = getRecentEvents(db, 20);
  const agents = listAgents(db);

  const service = new TradingService(db);
  service.registerPlatform(new PolymarketPlatform());
  service.registerPlatform(new BinancePlatform());
  const swarm = service.getSwarmSummary();

  const activeCount = agents.filter(a => a.status === 'running').length;

  // Compute win rate from leaderboard
  let totalWins = 0;
  let totalTrades = 0;
  for (const row of leaderboard) {
    totalWins += row.wins;
    totalTrades += row.num_trades;
  }
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

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
      {/* Hero P&L Banner */}
      <div className="mb-6 bg-gradient-to-br from-primary/[.06] to-teal/[.06] border border-primary/10 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex items-end gap-10">
          <div>
            <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold">Total AUM</div>
            <div className="font-mono font-bold text-4xl text-gray-900 mt-1">${swarm.total_aum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold">Total P&L</div>
            <div className={`font-mono font-bold text-3xl mt-1 ${swarm.total_pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {swarm.total_pnl >= 0 ? '+' : ''}${swarm.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold">Total Return</div>
            <div className={`font-mono font-bold text-3xl mt-1 ${swarm.total_return_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {swarm.total_return_pct >= 0 ? '+' : ''}{swarm.total_return_pct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Total P&L"
          value={`${swarm.total_pnl >= 0 ? '+' : ''}$${swarm.total_pnl.toFixed(2)}`}
          color="green"
          hero
        />
        <StatCard
          label="Total AUM"
          value={`$${swarm.total_aum.toFixed(0)}`}
          sub={`Cash: $${swarm.total_cash.toFixed(0)}`}
          color="default"
        />
        <StatCard
          label="Active Agents"
          value={`${activeCount}/${agents.length}`}
          sub={agents.length === 0 ? 'No agents' : undefined}
          color="purple"
        />
        <StatCard
          label="Open Positions"
          value={swarm.num_positions.toString()}
          color="teal"
        />
        <StatCard
          label="Win Rate"
          value={swarm.num_trades > 0 ? `${winRate.toFixed(1)}%` : '-'}
          sub={swarm.num_trades > 0 ? `${swarm.num_trades} trades` : 'No trades yet'}
          color="orange"
        />
      </div>

      {/* Open Positions */}
      {(() => {
        const positions = swarm.portfolios.flatMap(p => p.positions);
        return positions.length > 0 ? (
          <div className="mb-6">
            <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Open Positions ({positions.length})</h2>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold border-b border-black/5">
                    <th className="py-2 px-4">Agent</th>
                    <th className="py-2 px-4">Platform</th>
                    <th className="py-2 px-4">Market</th>
                    <th className="py-2 px-4">Outcome</th>
                    <th className="py-2 px-4 text-right">Shares</th>
                    <th className="py-2 px-4 text-right">Entry</th>
                    <th className="py-2 px-4 text-right">Current</th>
                    <th className="py-2 px-4 text-right">Cost</th>
                    <th className="py-2 px-4 text-right">Value</th>
                    <th className="py-2 px-4 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={i} className="border-b border-black/5 last:border-0 text-xs">
                      <td className="py-2 px-4 font-mono text-gray-700">{p.agent_id.replace('agent-','')}</td>
                      <td className="py-2 px-4">
                        <span className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded-full ${
                          p.platform === 'binance' ? 'bg-yellow-50 text-yellow-700' : 'bg-primary/10 text-primary'
                        }`}>{p.platform}</span>
                      </td>
                      <td className="py-2 px-4 text-gray-600 max-w-[200px] truncate">{p.market_question ?? p.outcome_id.slice(0,16)+'...'}</td>
                      <td className="py-2 px-4 text-gray-500">{p.outcome_name ?? p.outcome_id.slice(0,12)+'...'}</td>
                      <td className="py-2 px-4 text-right font-mono text-gray-900">{p.shares.toFixed(1)}</td>
                      <td className="py-2 px-4 text-right font-mono text-gray-500">${p.avg_entry_price.toFixed(3)}</td>
                      <td className="py-2 px-4 text-right font-mono text-gray-500">{p.current_price != null ? `$${p.current_price.toFixed(3)}` : '-'}</td>
                      <td className="py-2 px-4 text-right font-mono text-gray-500">${p.cost_basis.toFixed(0)}</td>
                      <td className="py-2 px-4 text-right font-mono text-gray-900">{p.market_value != null ? `$${p.market_value.toFixed(0)}` : '-'}</td>
                      <td className={`py-2 px-4 text-right font-mono font-bold ${(p.unrealized_pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {p.unrealized_pnl != null ? `${p.unrealized_pnl >= 0 ? '+' : ''}$${p.unrealized_pnl.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null;
      })()}

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
