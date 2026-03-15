'use client';

import { useState, useEffect, useRef } from 'react';
import { StatusBadge } from './status-badge';
import { ToggleSwitch } from './toggle-switch';
import { AgentBadge } from './agent-badge';

export interface AgentCardData {
  agent_id: string;
  display_name: string | null;
  status: 'running' | 'stopped' | 'failed';
  config_name: string | null;
  config_version: number | null;
  model_name: string | null;
  schedule_interval: string | null;
  pnl: number;
  num_trades: number;
  win_rate: number;
  current_cash: number;
  positions_count: number;
  pending_orders_count: number;
  memory_count: number;
  trade_history_count: number;
  prompt_template: string | null;
  mechanics_file: string | null;
}

export interface ConfigCardData {
  config_id: number;
  name: string;
  description: string | null;
  model_name: string;
  latest_version: number;
  active_tools: number;
  agent_count: number;
  running_agents: number;
  updated_at: string;
}

interface AgentsClientProps {
  agents: AgentCardData[];
  configs: ConfigCardData[];
}

export function AgentsClient({ agents, configs }: AgentsClientProps) {
  const [pageTab, setPageTab] = useState<'live' | 'offline' | 'configs'>('live');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'state' | 'prompt' | 'mechanics' | 'live'>('overview');

  const liveAgents = agents.filter(a => a.status === 'running');
  const offlineAgents = agents.filter(a => a.status !== 'running');
  const displayedAgents = pageTab === 'live' ? liveAgents : pageTab === 'offline' ? offlineAgents : [];
  const selectedAgent = agents.find(a => a.agent_id === selectedAgentId) ?? null;

  return (
    <>
      {/* Sub-tabs */}
      <div className="flex gap-0.5 bg-black/[.03] rounded-2xl p-1 mb-6">
        {([
          { key: 'live' as const, label: `Live (${liveAgents.length})` },
          { key: 'offline' as const, label: `Offline (${offlineAgents.length})` },
          { key: 'configs' as const, label: `Configs (${configs.length})` },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setPageTab(tab.key); setSelectedAgentId(null); }}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
              pageTab === tab.key
                ? 'text-gray-900 bg-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Configs view */}
      {pageTab === 'configs' && (
        configs.length === 0 ? (
          <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-12 text-center">
            <p className="text-gray-400 font-medium">No configs yet</p>
          </div>
        ) : (
          <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold border-b border-black/5">
                  <th className="py-2.5 px-5">Name</th>
                  <th className="py-2.5 px-5">Version</th>
                  <th className="py-2.5 px-5">Model</th>
                  <th className="py-2.5 px-5 text-right">Tools</th>
                  <th className="py-2.5 px-5 text-right">Agents</th>
                  <th className="py-2.5 px-5 text-right">Running</th>
                </tr>
              </thead>
              <tbody>
                {configs.map(c => (
                  <tr key={c.config_id} className="border-b border-black/5 last:border-0 hover:bg-black/[.02] cursor-pointer"
                    onClick={() => window.location.href = `/configs/${c.config_id}`}
                  >
                    <td className="py-3 px-5">
                      <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                      {c.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">{c.description}</p>}
                    </td>
                    <td className="py-3 px-5">
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">v{c.latest_version}</span>
                    </td>
                    <td className="py-3 px-5">
                      <span className="text-xs font-mono text-gray-500">{c.model_name || '-'}</span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-sm text-gray-900">{c.active_tools}</span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="text-sm text-gray-900">{c.agent_count}</span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className={`text-sm font-semibold ${c.running_agents > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{c.running_agents}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Agent Table */}
      {pageTab !== 'configs' && (<>
      {displayedAgents.length === 0 ? (
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-12 text-center">
          <p className="text-gray-400 font-medium">No {pageTab === 'live' ? 'live' : 'offline'} agents</p>
        </div>
      ) : (
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden mb-6">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold border-b border-black/5">
                <th className="py-2.5 px-5">Agent</th>
                <th className="py-2.5 px-5">Status</th>
                <th className="py-2.5 px-5">Model</th>
                <th className="py-2.5 px-5">Config</th>
                <th className="py-2.5 px-5 text-right">P&L</th>
                <th className="py-2.5 px-5 text-right">Trades</th>
                <th className="py-2.5 px-5 text-right">Win Rate</th>
                <th className="py-2.5 px-5 text-right">Cash</th>
              </tr>
            </thead>
            <tbody>
              {displayedAgents.map(agent => {
                const isSelected = agent.agent_id === selectedAgentId;
                return (
                  <tr
                    key={agent.agent_id}
                    onClick={() => setSelectedAgentId(isSelected ? null : agent.agent_id)}
                    className={`border-b border-black/5 last:border-0 cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/5' : 'hover:bg-black/[.02]'
                    }`}
                  >
                    <td className="py-3 px-5">
                      <AgentBadge name={agent.display_name ?? agent.agent_id} />
                    </td>
                    <td className="py-3 px-5">
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="py-3 px-5">
                      <span className="text-xs font-mono text-gray-500">{agent.model_name ?? '-'}</span>
                    </td>
                    <td className="py-3 px-5">
                      <span className="text-xs text-gray-500">
                        {agent.config_name ? `${agent.config_name} v${agent.config_version ?? '?'}` : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className={`font-mono font-bold text-sm ${agent.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {agent.pnl >= 0 ? '+' : ''}{agent.pnl.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="font-mono text-sm text-gray-900">{agent.num_trades}</span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="font-mono text-sm text-gray-900">
                        {agent.num_trades > 0 ? `${agent.win_rate.toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <span className="font-mono text-sm text-gray-900">${agent.current_cash.toFixed(0)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent Detail Panel */}
      {selectedAgent && (
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-0.5 px-5 pt-4 pb-0 border-b border-black/5">
            {(['overview', 'state', 'prompt', 'mechanics', 'live'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all ${
                  activeTab === tab
                    ? 'text-gray-900 bg-white border border-black/5 border-b-white -mb-px font-semibold'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {{ overview: 'Overview', state: 'State', prompt: 'Prompt', mechanics: 'Mechanics', live: 'Live View' }[tab]}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <OverviewTab agent={selectedAgent} />
            )}
            {activeTab === 'state' && (
              <StateTab agent={selectedAgent} />
            )}
            {activeTab === 'prompt' && (
              <pre className="bg-black/[.03] rounded-xl p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-y-auto border border-black/5">
                {selectedAgent.prompt_template ?? 'No prompt template configured'}
              </pre>
            )}
            {activeTab === 'mechanics' && (
              <pre className="bg-black/[.03] rounded-xl p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-y-auto border border-black/5">
                {selectedAgent.mechanics_file ?? 'No mechanics file configured'}
              </pre>
            )}
            {activeTab === 'live' && (
              <LiveTab agentId={selectedAgent.agent_id} />
            )}
          </div>
        </div>
      )}
    </>)}
    </>
  );
}

function OverviewTab({ agent }: { agent: AgentCardData }) {
  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between p-4 bg-black/[.02] rounded-xl">
        <div className="flex items-center gap-4">
          <StatusBadge status={agent.status} />
          <span className="text-sm text-gray-500">
            {agent.config_name ? `${agent.config_name} v${agent.config_version ?? '?'}` : 'No config assigned'}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-1.5 text-sm font-medium rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
            Stop
          </button>
          <button className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            Restart
          </button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-3 bg-black/[.02] rounded-xl">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">Agent ID</div>
          <div className="font-mono text-sm text-gray-700 mt-1 truncate">{agent.agent_id}</div>
        </div>
        <div className="p-3 bg-black/[.02] rounded-xl">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">Model</div>
          <div className="font-mono text-sm text-gray-700 mt-1">{agent.model_name ?? '-'}</div>
        </div>
        <div className="p-3 bg-black/[.02] rounded-xl">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">Schedule</div>
          <div className="font-mono text-sm text-gray-700 mt-1">{agent.schedule_interval ?? '-'}</div>
        </div>
        <div className="p-3 bg-black/[.02] rounded-xl">
          <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">Total P&L</div>
          <div className={`font-mono font-bold text-sm mt-1 ${agent.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {agent.pnl >= 0 ? '+' : ''}{agent.pnl.toFixed(2)}
          </div>
        </div>
      </div>

    </div>
  );
}

function StateTab({ agent }: { agent: AgentCardData }) {
  const stateItems = [
    {
      label: 'Positions',
      value: agent.positions_count.toString(),
      actions: ['View All', 'Close All'],
    },
    {
      label: 'Pending Orders',
      value: agent.pending_orders_count.toString(),
      actions: ['View', 'Cancel All'],
    },
    {
      label: 'Memory',
      value: `${agent.memory_count} topics`,
      actions: ['Edit', 'Clear'],
    },
    {
      label: 'Trade History',
      value: agent.trade_history_count.toString(),
      actions: ['View'],
    },
    {
      label: 'Cash Balance',
      value: `$${agent.current_cash.toFixed(2)}`,
      actions: ['Reset'],
    },
  ];

  return (
    <div className="space-y-3">
      {stateItems.map(item => (
        <div key={item.label} className="flex items-center justify-between p-4 bg-black/[.02] rounded-xl">
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">{item.label}</div>
            <div className="font-mono font-bold text-sm text-gray-900 mt-0.5">{item.value}</div>
          </div>
          <div className="flex gap-2">
            {item.actions.map(action => (
              <button
                key={action}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-white border border-black/10 text-gray-500 hover:text-gray-700 hover:border-black/20 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Live View ----------

interface LiveEvent {
  id: string;
  type: string;
  content: string;
  time: string;
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

function formatEventContent(type: string, data: Record<string, unknown> | null): string {
  if (!data) return '';
  if (type === 'thinking') return String(data.content ?? '');
  if (type === 'tool_call') return `${data.tool_name}(${JSON.stringify(data.arguments ?? {})})`;
  if (type === 'tool_result') {
    const result = String(data.result ?? '');
    return `${data.tool_name} → ${result.length > 300 ? result.slice(0, 300) + '...' : result}`;
  }
  if (type === 'error') return String(data.error ?? data.message ?? JSON.stringify(data));
  if (type === 'loop_start') return data.message ? String(data.message) : 'New cycle';
  if (type === 'loop_end') return 'Cycle complete';
  return JSON.stringify(data);
}

function LiveTab({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/events?agent_id=${agentId}`);

    es.addEventListener('connected', () => setConnected(true));
    es.onerror = () => setConnected(false);

    const handle = (eventType: string) => (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const event: LiveEvent = {
          id: e.lastEventId || String(Date.now()),
          type: eventType,
          content: formatEventContent(eventType, parsed.data),
          time: parsed.created_at ?? new Date().toISOString(),
        };
        setEvents(prev => [...prev.slice(-200), event]);
      } catch { /* skip */ }
    };

    for (const type of ['thinking', 'tool_call', 'tool_result', 'error', 'loop_start', 'loop_end']) {
      es.addEventListener(type, handle(type));
    }

    return () => es.close();
  }, [agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
        <span className="text-xs text-gray-400">{connected ? 'Connected' : 'Connecting...'}</span>
        <span className="text-xs text-gray-300 ml-auto">{events.length} events</span>
      </div>
      <div className="bg-black/[.02] rounded-xl p-4 max-h-[500px] overflow-y-auto font-mono text-xs space-y-1">
        {events.length === 0 && (
          <p className="text-gray-400 text-center py-8">Waiting for agent events...</p>
        )}
        {events.map(event => (
          <div key={event.id} className={`border-l-2 ${EVENT_COLORS[event.type] ?? 'border-l-gray-300'} pl-3 py-1`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[0.6rem] font-bold uppercase tracking-wider text-gray-400">
                {EVENT_LABELS[event.type] ?? event.type}
              </span>
              <span className="text-[0.55rem] text-gray-300">
                {event.time.split(' ')[1] ?? event.time}
              </span>
            </div>
            <pre className={`whitespace-pre-wrap break-words text-xs ${
              event.type === 'error' ? 'text-red-500' :
              event.type === 'thinking' ? 'text-gray-700' :
              'text-gray-500'
            }`}>{event.content}</pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
