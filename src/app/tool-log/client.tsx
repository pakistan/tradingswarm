'use client';

import { useState, useMemo } from 'react';
import type { ToolLogRow } from '@/lib/types';
import { AgentBadge } from '@/components/agent-badge';

interface ToolLogClientProps {
  initialLogs: ToolLogRow[];
  agents: string[];
  toolNames: string[];
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  polymarket: { bg: 'bg-primary/10', text: 'text-primary', label: 'Polymarket' },
  channels: { bg: 'bg-teal/10', text: 'text-teal', label: 'Channels' },
  web: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Web' },
  naanhub: { bg: 'bg-teal/10', text: 'text-teal', label: 'NaanHub' },
};

const TIME_RANGES = [
  { label: '1h', value: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', value: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', value: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'All', value: 'all', ms: 0 },
] as const;

function truncate(str: string | null, maxLen: number): string {
  if (!str) return '--';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) + ' ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseSummary(jsonStr: string | null): string {
  if (!jsonStr) return '--';
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'string') return parsed;
    return JSON.stringify(parsed);
  } catch {
    return jsonStr;
  }
}

function ExpandedRow({ log }: { log: ToolLogRow }) {
  return (
    <div className="px-6 py-4 bg-black/[.01] border-t border-black/5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Input</div>
          <pre className="font-mono text-xs bg-black/[.02] rounded-lg p-4 text-gray-700 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {log.input_json ? JSON.stringify(JSON.parse(log.input_json), null, 2) : 'No input'}
          </pre>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Output</div>
          <pre className="font-mono text-xs bg-black/[.02] rounded-lg p-4 text-gray-700 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {log.output_json ? (() => { try { return JSON.stringify(JSON.parse(log.output_json), null, 2); } catch { return log.output_json; } })() : 'No output'}
          </pre>
        </div>
      </div>
      {log.error && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest text-red-400 font-semibold mb-2">Error</div>
          <pre className="font-mono text-xs bg-red-50 rounded-lg p-4 text-red-600 whitespace-pre-wrap break-all">
            {log.error}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolLogClient({ initialLogs, agents, toolNames }: ToolLogClientProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredLogs = useMemo(() => {
    let result = initialLogs;

    if (selectedAgent) {
      result = result.filter(l => l.agent_id === selectedAgent);
    }
    if (selectedTool) {
      result = result.filter(l => l.tool_name === selectedTool);
    }
    if (timeRange !== 'all') {
      const range = TIME_RANGES.find(r => r.value === timeRange);
      if (range && range.ms > 0) {
        const cutoff = new Date(Date.now() - range.ms).toISOString();
        result = result.filter(l => l.created_at >= cutoff);
      }
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(l =>
        l.tool_name.toLowerCase().includes(lower) ||
        l.agent_id.toLowerCase().includes(lower) ||
        (l.input_json?.toLowerCase().includes(lower)) ||
        (l.output_json?.toLowerCase().includes(lower))
      );
    }

    return result;
  }, [initialLogs, selectedAgent, selectedTool, timeRange, search]);

  // Group by cycle_id for chain visualization
  const cycleGroups = useMemo(() => {
    const groups = new Map<string, ToolLogRow[]>();
    const ungrouped: ToolLogRow[] = [];

    for (const log of filteredLogs) {
      if (log.cycle_id) {
        const existing = groups.get(log.cycle_id);
        if (existing) {
          existing.push(log);
        } else {
          groups.set(log.cycle_id, [log]);
        }
      } else {
        ungrouped.push(log);
      }
    }

    // Build ordered list: cycles stay together, ungrouped are individual
    const ordered: Array<{ cycleId: string | null; logs: ToolLogRow[] }> = [];
    const seen = new Set<string>();

    for (const log of filteredLogs) {
      if (log.cycle_id && !seen.has(log.cycle_id)) {
        seen.add(log.cycle_id);
        const cycleLogs = groups.get(log.cycle_id)!;
        // Sort cycle logs by created_at ascending for chain numbering
        cycleLogs.sort((a, b) => a.created_at.localeCompare(b.created_at));
        ordered.push({ cycleId: log.cycle_id, logs: cycleLogs });
      } else if (!log.cycle_id) {
        ordered.push({ cycleId: null, logs: [log] });
      }
    }

    return ordered;
  }, [filteredLogs]);

  if (initialLogs.length === 0) {
    return (
      <div className="bg-white/70 border border-black/5 rounded-2xl p-12 backdrop-blur-xl text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900">No tool activity yet</h2>
        <p className="text-gray-400 mt-1 text-sm">Tool calls will appear here once agents start running.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="bg-white/70 border border-black/5 rounded-2xl p-4 backdrop-blur-xl mb-4 flex flex-wrap items-center gap-3">
        <select
          value={selectedAgent}
          onChange={e => setSelectedAgent(e.target.value)}
          className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All agents</option>
          {agents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={selectedTool}
          onChange={e => setSelectedTool(e.target.value)}
          className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All tools</option>
          {toolNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.value}
              onClick={() => setTimeRange(tr.value)}
              className={`text-xs px-3 py-2 font-medium transition-colors ${
                timeRange === tr.value
                  ? 'bg-primary text-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary/20"
        />

        <span className="text-xs text-gray-400 ml-auto">
          {filteredLogs.length} call{filteredLogs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tool log table */}
      <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No tool calls match the current filters.
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="hidden md:grid grid-cols-[140px_100px_160px_1fr_1fr_60px_32px] gap-2 px-4 py-2.5 border-b border-black/5 text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
              <div>Timestamp</div>
              <div>Agent</div>
              <div>Tool</div>
              <div>Input</div>
              <div>Output</div>
              <div className="text-right">Duration</div>
              <div />
            </div>

            {/* Rows grouped by cycle */}
            {cycleGroups.map((group, gi) => (
              <div key={group.cycleId ?? `ungrouped-${gi}`}>
                {group.logs.map((log, li) => {
                  const isExpanded = expandedId === log.id;
                  const isInCycle = group.cycleId !== null && group.logs.length > 1;
                  const platformStyle = PLATFORM_COLORS[log.platform] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: log.platform };
                  const isFirst = li === 0;
                  const isLast = li === group.logs.length - 1;

                  return (
                    <div key={log.id}>
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className={`grid grid-cols-1 md:grid-cols-[140px_100px_160px_1fr_1fr_60px_32px] gap-2 px-4 py-2.5 cursor-pointer transition-colors hover:bg-black/[.02] ${
                          isExpanded ? 'bg-black/[.02]' : ''
                        } ${
                          isInCycle && !isFirst ? 'border-t border-dashed border-black/5' : 'border-t border-black/5'
                        }`}
                      >
                        {/* Timestamp */}
                        <div className="flex items-center gap-2">
                          {isInCycle && (
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                              {li + 1}
                            </span>
                          )}
                          <span className="font-mono text-xs text-gray-500">
                            {formatTimestamp(log.created_at)}
                          </span>
                        </div>

                        {/* Agent */}
                        <div className="flex items-center">
                          <AgentBadge name={log.agent_id} />
                        </div>

                        {/* Tool name */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${platformStyle.bg} ${platformStyle.text}`}>
                            {platformStyle.label}
                          </span>
                          <span className="font-mono text-xs text-gray-700 truncate">{log.tool_name}</span>
                        </div>

                        {/* Input summary */}
                        <div className="text-xs text-gray-500 truncate" title={log.input_json ?? undefined}>
                          {truncate(parseSummary(log.input_json), 80)}
                        </div>

                        {/* Output summary */}
                        <div className="text-xs text-gray-500 truncate" title={log.output_json ?? undefined}>
                          {truncate(parseSummary(log.output_json), 80)}
                        </div>

                        {/* Duration */}
                        <div className="text-xs font-mono text-gray-400 text-right">
                          {log.duration_ms != null ? `${log.duration_ms}ms` : '--'}
                        </div>

                        {/* Error indicator */}
                        <div className="flex items-center justify-center">
                          {log.error ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500" title={log.error} />
                          ) : null}
                        </div>
                      </div>

                      {isExpanded && <ExpandedRow log={log} />}
                    </div>
                  );
                })}

                {/* Cycle group separator */}
                {group.cycleId && group.logs.length > 1 && (
                  <div className="px-4 py-1 bg-primary/[.02] border-t border-primary/10">
                    <span className="text-[10px] text-primary/60 font-mono">
                      cycle {group.cycleId.slice(0, 8)}... ({group.logs.length} calls)
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
