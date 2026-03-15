import { AgentBadge } from './agent-badge';

interface LeaderboardRowProps {
  rank: number;
  agentId: string;
  modelName?: string;
  pnl: number;
  returnPct: number;
  status: 'running' | 'stopped' | 'failed';
}

const rankStyles: Record<number, string> = {
  1: 'text-amber-500 font-bold',
  2: 'text-gray-400 font-bold',
  3: 'text-orange-600 font-bold',
};

export function LeaderboardRow({ rank, agentId, modelName, pnl, returnPct, status }: LeaderboardRowProps) {
  const pnlColor = pnl >= 0 ? 'text-emerald-600' : 'text-rose-600';
  const returnColor = returnPct >= 0 ? 'text-emerald-600' : 'text-rose-600';
  const statusColor = status === 'running' ? 'bg-emerald-500' : status === 'failed' ? 'bg-red-500' : 'bg-gray-300';

  return (
    <tr className="border-b border-black/5 last:border-0 hover:bg-black/[.02] transition-colors">
      <td className="py-3 px-4">
        <span className={`font-mono text-sm ${rankStyles[rank] ?? 'text-gray-400'}`}>
          {rank <= 3 ? ['', '#1', '#2', '#3'][rank] : `#${rank}`}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <AgentBadge name={agentId} />
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-gray-400 font-mono">{modelName ?? '-'}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className={`font-mono font-bold text-sm ${pnlColor}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className={`font-mono text-sm ${returnColor}`}>
          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}
