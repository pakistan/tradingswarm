import { AgentBadge } from './agent-badge';

interface ActivityItemProps {
  agentId: string;
  eventType: string;
  dataJson: string | null;
  createdAt: string;
}

const borderColors: Record<string, string> = {
  trade: 'border-l-primary',
  tool_call: 'border-l-primary',
  tool_result: 'border-l-primary',
  thinking: 'border-l-teal',
  loop_start: 'border-l-teal',
  loop_end: 'border-l-teal',
  error: 'border-l-red-500',
  memory_update: 'border-l-fuchsia-500',
  channel_post: 'border-l-accent',
};

const typeLabels: Record<string, string> = {
  trade: 'Trade',
  tool_call: 'Tool Call',
  tool_result: 'Tool Result',
  thinking: 'Scan',
  loop_start: 'Loop Start',
  loop_end: 'Loop End',
  error: 'Error',
  memory_update: 'Memory',
  channel_post: 'Channel',
};

const typeBadgeColors: Record<string, string> = {
  trade: 'bg-primary/10 text-primary',
  tool_call: 'bg-primary/10 text-primary',
  tool_result: 'bg-primary/10 text-primary',
  thinking: 'bg-teal/10 text-teal',
  loop_start: 'bg-teal/10 text-teal',
  loop_end: 'bg-teal/10 text-teal',
  error: 'bg-red-50 text-red-500',
  memory_update: 'bg-fuchsia-50 text-fuchsia-500',
  channel_post: 'bg-accent/10 text-accent',
};

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return dateStr;
  }
}

function getSummary(eventType: string, dataJson: string | null): string {
  if (!dataJson) return '';
  try {
    const data = JSON.parse(dataJson);
    if (eventType === 'trade' && data.side && data.outcome) {
      return `${data.side} ${data.outcome}`;
    }
    if (eventType === 'tool_call' && data.tool_name) {
      return data.tool_name;
    }
    if (eventType === 'error' && data.message) {
      return data.message.slice(0, 80);
    }
    if (data.summary) return data.summary.slice(0, 80);
    if (data.message) return data.message.slice(0, 80);
    return '';
  } catch {
    return '';
  }
}

export function ActivityItem({ agentId, eventType, dataJson, createdAt }: ActivityItemProps) {
  const borderClass = borderColors[eventType] ?? 'border-l-gray-300';
  const badgeClass = typeBadgeColors[eventType] ?? 'bg-gray-100 text-gray-500';
  const label = typeLabels[eventType] ?? eventType;
  const summary = getSummary(eventType, dataJson);

  return (
    <div className={`flex items-start gap-3 py-2.5 px-3 border-l-2 ${borderClass} hover:bg-black/[.02] transition-colors rounded-r-lg`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <AgentBadge name={agentId} />
          <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {label}
          </span>
          <span className="text-[0.6rem] text-gray-300 font-mono ml-auto flex-shrink-0">
            {formatTime(createdAt)}
          </span>
        </div>
        {summary && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{summary}</p>
        )}
      </div>
    </div>
  );
}
