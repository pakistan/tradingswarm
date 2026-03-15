'use client';

import { useState, useEffect, useRef } from 'react';
import { AgentBadge } from '@/components/agent-badge';

interface FeedEvent {
  id: string;
  type: string;
  agentId: string;
  content: string;
  time: string;
  raw: Record<string, unknown> | null;
}

const EVENT_COLORS: Record<string, string> = {
  thinking: 'border-l-purple-400',
  tool_call: 'border-l-blue-400',
  tool_result: 'border-l-emerald-400',
  error: 'border-l-red-400',
  loop_start: 'border-l-gray-300',
  loop_end: 'border-l-gray-300',
};

const EVENT_LABELS: Record<string, string> = {
  thinking: 'Thinking',
  tool_call: 'Tool Call',
  tool_result: 'Tool Result',
  error: 'Error',
  loop_start: 'Cycle Start',
  loop_end: 'Cycle End',
};

const FILTER_PRESETS = [
  { key: 'all', label: 'All' },
  { key: 'trades', label: 'Trades' },
  { key: 'thinking', label: 'Thinking' },
  { key: 'tool_calls', label: 'Tool Calls' },
  { key: 'errors', label: 'Errors' },
  { key: 'research', label: 'Research' },
] as const;

type FilterPreset = typeof FILTER_PRESETS[number]['key'];

function matchesFilter(event: FeedEvent, filter: FilterPreset, selectedAgent: string | null): boolean {
  if (selectedAgent && event.agentId !== selectedAgent) return false;
  switch (filter) {
    case 'all': return true;
    case 'trades': return event.type === 'tool_call' && (event.content.includes('pm_buy') || event.content.includes('pm_sell'));
    case 'thinking': return event.type === 'thinking';
    case 'tool_calls': return event.type === 'tool_call' || event.type === 'tool_result';
    case 'errors': return event.type === 'error';
    case 'research': return event.type === 'tool_call' && (event.content.includes('web_search') || event.content.includes('pm_search') || event.content.includes('pm_orderbook') || event.content.includes('pm_price_history'));
    default: return true;
  }
}

function formatContent(type: string, data: Record<string, unknown> | null): string {
  if (!data) return '';
  if (type === 'thinking') return String(data.content ?? '');
  if (type === 'tool_call') return `${data.tool_name}(${JSON.stringify(data.arguments ?? {})})`;
  if (type === 'tool_result') {
    const result = String(data.result ?? '');
    return `${data.tool_name} → ${result.length > 400 ? result.slice(0, 400) + '...' : result}`;
  }
  if (type === 'error') return String(data.error ?? data.message ?? JSON.stringify(data));
  if (type === 'loop_start') return data.message ? String(data.message) : 'New cycle';
  if (type === 'loop_end') return 'Cycle complete';
  return JSON.stringify(data);
}

interface Props {
  agentIds: string[];
  eventTypes: string[];
  toolNames: string[];
}

export function FeedClient({ agentIds }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<FilterPreset>('all');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('connected', () => setConnected(true));
    es.onerror = () => setConnected(false);

    const handle = (eventType: string) => (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const event: FeedEvent = {
          id: e.lastEventId || String(Date.now()) + Math.random(),
          type: eventType,
          agentId: parsed.agent_id,
          content: formatContent(eventType, parsed.data),
          time: parsed.created_at ?? new Date().toISOString(),
          raw: parsed.data,
        };
        setEvents(prev => [event, ...prev.slice(0, 499)]);
      } catch { /* skip */ }
    };

    for (const type of ['thinking', 'tool_call', 'tool_result', 'error', 'loop_start', 'loop_end']) {
      es.addEventListener(type, handle(type));
    }

    return () => es.close();
  }, []);

  // New events appear at top, no need to auto-scroll

  const filtered = events.filter(e => matchesFilter(e, filter, selectedAgent));
  const counts = {
    all: events.length,
    trades: events.filter(e => matchesFilter(e, 'trades', selectedAgent)).length,
    thinking: events.filter(e => matchesFilter(e, 'thinking', selectedAgent)).length,
    tool_calls: events.filter(e => matchesFilter(e, 'tool_calls', selectedAgent)).length,
    errors: events.filter(e => matchesFilter(e, 'errors', selectedAgent)).length,
    research: events.filter(e => matchesFilter(e, 'research', selectedAgent)).length,
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-4 mb-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Live' : 'Connecting...'}</span>
        </div>

        {/* Filter presets */}
        <div className="flex gap-0.5 bg-black/[.03] rounded-2xl p-1">
          {FILTER_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => setFilter(preset.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                filter === preset.key
                  ? 'text-gray-900 bg-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {preset.label}
              {counts[preset.key] > 0 && (
                <span className="ml-1 text-[0.6rem] opacity-60">{counts[preset.key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Agent filter */}
        <select
          value={selectedAgent ?? ''}
          onChange={(e) => setSelectedAgent(e.target.value || null)}
          className="bg-black/[.03] border border-black/5 rounded-xl px-3 py-1.5 text-xs text-gray-700 focus:outline-none"
        >
          <option value="">All agents</option>
          {agentIds.map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>

        {/* Pause button */}
        <button
          onClick={() => setPaused(!paused)}
          className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
            paused
              ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
              : 'border-black/10 text-gray-500 hover:bg-black/[.03]'
          }`}
        >
          {paused ? 'Paused' : 'Pause'}
        </button>

        <span className="text-xs text-gray-300">{filtered.length} events</span>
      </div>

      {/* Feed */}
      <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto p-4 space-y-0.5 font-mono text-xs">
          {filtered.length === 0 && (
            <p className="text-gray-400 text-center py-12">
              {events.length === 0 ? 'Waiting for agent events...' : 'No events match this filter'}
            </p>
          )}
          {filtered.map(event => (
            <div
              key={event.id}
              className={`border-l-2 ${EVENT_COLORS[event.type] ?? 'border-l-gray-300'} pl-3 py-1.5 hover:bg-black/[.02] cursor-pointer rounded-r`}
              onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[0.55rem] font-bold uppercase tracking-wider text-gray-400 w-16">
                  {EVENT_LABELS[event.type] ?? event.type}
                </span>
                <AgentBadge name={event.agentId} />
                <span className="text-[0.55rem] text-gray-300 ml-auto">
                  {event.time.split(' ')[1] ?? event.time}
                </span>
              </div>
              <pre className={`whitespace-pre-wrap break-words ${
                event.type === 'error' ? 'text-red-500' :
                event.type === 'thinking' ? 'text-gray-700' :
                'text-gray-500'
              } ${expandedId === event.id ? '' : 'line-clamp-3'}`}>
                {event.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
