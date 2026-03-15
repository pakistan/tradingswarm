'use client';

import { useState } from 'react';
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
}

interface AgentsClientProps {
  agents: AgentCardData[];
}

export function AgentsClient({ agents }: AgentsClientProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'state' | 'live'>('overview');

  const selectedAgent = agents.find(a => a.agent_id === selectedAgentId) ?? null;

  return (
    <>
      {/* Agent Cards Grid */}
      {agents.length === 0 ? (
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-16 text-center">
          <div className="text-gray-300 text-5xl mb-4">&#9651;</div>
          <p className="text-gray-400 font-medium">No agents yet</p>
          <p className="text-xs text-gray-300 mt-1">Create your first agent to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {agents.map(agent => {
            const isSelected = agent.agent_id === selectedAgentId;
            const pnlColor = agent.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600';

            return (
              <button
                key={agent.agent_id}
                onClick={() => setSelectedAgentId(isSelected ? null : agent.agent_id)}
                className={`bg-white/70 border rounded-2xl backdrop-blur-xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 ${
                  isSelected ? 'border-primary/30 ring-2 ring-primary/10' : 'border-black/5'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AgentBadge name={agent.display_name ?? agent.agent_id} />
                    </div>
                    {agent.model_name && (
                      <span className="text-[0.6rem] text-gray-400 font-mono">{agent.model_name}</span>
                    )}
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">P&L</div>
                    <div className={`font-mono font-bold text-sm ${pnlColor}`}>
                      {agent.pnl >= 0 ? '+' : ''}{agent.pnl.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">Trades</div>
                    <div className="font-mono font-bold text-sm text-gray-900">{agent.num_trades}</div>
                  </div>
                  <div>
                    <div className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold">Win Rate</div>
                    <div className="font-mono font-bold text-sm text-gray-900">
                      {agent.num_trades > 0 ? `${agent.win_rate.toFixed(0)}%` : '-'}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {agent.config_name && (
                      <span className="text-[0.6rem] font-medium px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500">
                        {agent.config_name}
                        {agent.config_version ? ` v${agent.config_version}` : ''}
                      </span>
                    )}
                    {agent.schedule_interval && (
                      <span className="text-[0.6rem] font-medium px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500">
                        {agent.schedule_interval}
                      </span>
                    )}
                  </div>
                  <ToggleSwitch on={agent.status === 'running'} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Agent Detail Panel */}
      {selectedAgent && (
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-0.5 px-5 pt-4 pb-0 border-b border-black/5">
            {(['overview', 'state', 'live'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all ${
                  activeTab === tab
                    ? 'text-gray-900 bg-white border border-black/5 border-b-white -mb-px font-semibold'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab === 'live' ? 'Live View' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
            {activeTab === 'live' && (
              <div className="text-center py-12">
                <div className="text-gray-300 text-4xl mb-3">&#9679;</div>
                <p className="text-sm text-gray-400 font-medium">Live View</p>
                <p className="text-xs text-gray-300 mt-1">Real-time agent output streaming will be available soon</p>
              </div>
            )}
          </div>
        </div>
      )}
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
