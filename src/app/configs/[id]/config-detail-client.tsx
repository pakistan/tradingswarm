'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { EnrichedVersion } from './page';

interface ConfigData {
  config_id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface Agent {
  agent_id: string;
  display_name: string | null;
  status: string;
  config_version_id: number | null;
}

interface Props {
  config: ConfigData;
  versions: EnrichedVersion[];
  agents: Agent[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConfigDetailClient({ config, versions, agents }: Props) {
  const [selectedVersionNum, setSelectedVersionNum] = useState(
    versions.length > 0 ? versions[versions.length - 1].version_num : 0
  );

  const selectedVersion = versions.find(v => v.version_num === selectedVersionNum);
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;

  const enabledRules = selectedVersion?.rules.filter(r => r.enabled) ?? [];
  const enabledCaps = selectedVersion?.capabilities.filter(c => c.enabled) ?? [];
  const totalCaps = selectedVersion?.capabilities.length ?? 0;

  // Find previous version for diff display
  const prevVersionIdx = versions.findIndex(v => v.version_num === selectedVersionNum) - 1;
  const prevVersion = prevVersionIdx >= 0 ? versions[prevVersionIdx] : null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/configs"
            className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
          >
            Configs
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-[28px] font-bold text-gray-900">{config.name}</h1>
          {latestVersion && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
              v{latestVersion.version_num}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {latestVersion && (
            <Link
              href={`/configs/${config.config_id}/edit`}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30"
            >
              Edit Config
            </Link>
          )}
        </div>
      </div>

      {config.description && (
        <p className="text-gray-500 text-sm mb-6">{config.description}</p>
      )}

      {/* Version Detail Panel */}
      {versions.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No versions yet</p>
          <p className="text-gray-400 text-sm">
            <Link href={`/configs/${config.config_id}/edit`} className="text-primary hover:underline">
              Create the first version
            </Link>{' '}
            to define this config.
          </p>
        </div>
      ) : (
        <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-6">
          <div className="grid grid-cols-[160px_1fr] gap-5">
            {/* Version Timeline */}
            <div className="border-r border-black/[.06] pr-3">
              {versions.map((v, i) => (
                <div key={v.version_id}>
                  <button
                    onClick={() => setSelectedVersionNum(v.version_num)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-[10px] text-sm transition-all ${
                      v.version_num === selectedVersionNum
                        ? 'bg-primary/[.08] text-primary font-semibold'
                        : 'text-gray-500 hover:bg-black/[.03]'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        v.version_num === selectedVersionNum
                          ? 'bg-primary border-primary'
                          : 'border-black/[.15]'
                      }`}
                    />
                    <span>v{v.version_num}</span>
                    {v.version_num === latestVersion?.version_num && (
                      <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700">
                        active
                      </span>
                    )}
                  </button>
                  {i < versions.length - 1 && (
                    <div className="w-0.5 h-4 bg-black/[.08] ml-[17px]" />
                  )}
                </div>
              ))}
            </div>

            {/* Selected Version Detail */}
            {selectedVersion && (
              <div>
                {/* Settings */}
                <div className="mb-4">
                  <h3 className="text-[13px] font-semibold text-gray-900 mb-2">Settings</h3>
                  <div className="flex gap-6 text-[13px] text-gray-500">
                    <span>
                      Model:{' '}
                      <strong className="text-gray-900">{selectedVersion.model_name}</strong>
                    </span>
                    <span>
                      Schedule:{' '}
                      <strong className="text-gray-900">
                        Every {selectedVersion.schedule_interval}
                      </strong>
                    </span>
                    <span>
                      Bankroll:{' '}
                      <strong className="text-gray-900">
                        ${selectedVersion.bankroll.toLocaleString()}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Rules */}
                <div className="mb-4">
                  <h3 className="text-[13px] font-semibold text-gray-900 mb-2">
                    Rules{' '}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/[.05] text-gray-500 ml-1">
                      {enabledRules.length} active
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {enabledRules.map(r => (
                      <span
                        key={r.rule_id}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary"
                      >
                        {r.name}
                      </span>
                    ))}
                    {enabledRules.length === 0 && (
                      <span className="text-sm text-gray-400">No rules enabled</span>
                    )}
                  </div>
                </div>

                {/* Tools */}
                <div className="mb-4">
                  <h3 className="text-[13px] font-semibold text-gray-900 mb-2">
                    Tools{' '}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/[.05] text-gray-500 ml-1">
                      {enabledCaps.length}/{totalCaps} enabled
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {enabledCaps.map(c => (
                      <span
                        key={c.capability_id}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal/10 text-teal"
                      >
                        {c.name}
                      </span>
                    ))}
                    {enabledCaps.length === 0 && (
                      <span className="text-sm text-gray-400">No tools enabled</span>
                    )}
                  </div>
                </div>

                {/* Diff */}
                {selectedVersion.diff_summary && (
                  <div className="mb-4">
                    <h3 className="text-[13px] font-semibold text-gray-900 mb-2">
                      Diff from v{selectedVersionNum - 1}
                    </h3>
                    <div className="font-mono text-xs bg-black/[.03] p-3 rounded-[10px] leading-[1.8]">
                      {selectedVersion.diff_summary.split('\n').map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.startsWith('+')
                              ? 'text-emerald-600'
                              : line.startsWith('-')
                                ? 'text-rose-600'
                                : 'text-gray-500'
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Created at */}
                <div className="text-xs text-gray-400 pt-3 border-t border-black/[.04]">
                  Created {formatDate(selectedVersion.created_at)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agents Section */}
      {agents.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Agents using this config</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map(agent => (
              <div
                key={agent.agent_id}
                className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-xl p-4 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agent.status === 'running'
                        ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                        : agent.status === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-gray-300'
                    }`}
                  />
                  <span className="font-medium text-gray-900">
                    {agent.display_name ?? agent.agent_id}
                  </span>
                  <span className="ml-auto text-xs text-gray-400 capitalize">{agent.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
