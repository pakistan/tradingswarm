import { getDb } from '@/lib/db/index';
import { getTradeById } from '@/lib/db/trades';
import { getSnapshot } from '@/lib/db/snapshots';
import { getAgent } from '@/lib/db/agents';
import { getVersion } from '@/lib/db/configs';
import { AgentBadge } from '@/components/agent-badge';
import { TradeInspectorClient } from './client';

interface PageProps {
  params: { id: string };
}

export default function TradeInspectorPage({ params }: PageProps) {
  const tradeId = parseInt(params.id, 10);

  if (isNaN(tradeId)) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Invalid Trade ID</h1>
        <p className="text-gray-500 mt-2">The trade ID must be a number.</p>
      </main>
    );
  }

  const db = getDb();
  const trade = getTradeById(db, tradeId);

  if (!trade) {
    return (
      <main className="p-8 max-w-5xl mx-auto">
        <div className="bg-white/70 border border-black/5 rounded-2xl p-12 backdrop-blur-xl text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900">No trades to inspect yet</h2>
          <p className="text-gray-400 mt-1 text-sm">Trades will appear here once agents start trading.</p>
        </div>
      </main>
    );
  }

  const snapshot = trade.snapshot_id ? getSnapshot(db, trade.snapshot_id) : null;
  const agent = getAgent(db, trade.agent_id);
  const configVersion = agent?.config_version_id
    ? getVersion(db, agent.config_version_id)
    : null;

  // Parse snapshot data
  let agentContext: string | null = null;
  let marketSnapshot: {
    best_bid?: number;
    best_ask?: number;
    spread?: number;
    mid_price?: number;
    bids?: Array<{ price: number; size: number }>;
    asks?: Array<{ price: number; size: number }>;
    total_bid_depth?: number;
    total_ask_depth?: number;
  } | null = null;

  if (snapshot) {
    agentContext = snapshot.agent_context;
    try {
      marketSnapshot = JSON.parse(snapshot.market_snapshot);
    } catch {
      marketSnapshot = null;
    }
  }

  // Calculate trade metrics
  const pnl = trade.realized_pnl;
  const pnlPercent = trade.entry_price > 0
    ? ((trade.exit_price - trade.entry_price) / trade.entry_price * 100)
    : 0;
  const holdingMs = new Date(trade.closed_at).getTime() - new Date(trade.opened_at).getTime();
  const holdingDays = Math.floor(holdingMs / (1000 * 60 * 60 * 24));
  const holdingHours = Math.floor((holdingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const reasonLabel: Record<string, string> = {
    sold: 'Sold',
    resolved_win: 'Resolved (Win)',
    resolved_loss: 'Resolved (Loss)',
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* Agent Info Bar */}
      <div className="bg-white/70 border border-black/5 rounded-2xl p-5 backdrop-blur-xl mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AgentBadge name={agent?.display_name ?? trade.agent_id} />
            {configVersion && (
              <span className="text-xs text-gray-400 font-mono">
                {configVersion.model_name} &middot; v{configVersion.version_num}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">
              {new Date(trade.closed_at).toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
              trade.reason === 'resolved_win' ? 'bg-emerald-50 text-emerald-600' :
              trade.reason === 'resolved_loss' ? 'bg-red-50 text-red-500' :
              'bg-gray-100 text-gray-500'
            }`}>
              {reasonLabel[trade.reason] ?? trade.reason}
            </span>
          </div>
        </div>
        <h1 className="text-lg font-bold text-gray-900 mt-3">{trade.market_question}</h1>
        <p className="text-sm text-gray-500 mt-1">Outcome: {trade.outcome_name}</p>
      </div>

      {/* Split View */}
      <TradeInspectorClient
        trade={trade}
        agentContext={agentContext}
        marketSnapshot={marketSnapshot}
        pnl={pnl}
        pnlPercent={pnlPercent}
        holdingDays={holdingDays}
        holdingHours={holdingHours}
        reasonLabel={reasonLabel[trade.reason] ?? trade.reason}
      />
    </main>
  );
}
