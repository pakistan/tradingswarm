'use client';

import { useState } from 'react';
import { ToggleSwitch } from './toggle-switch';

// ---------- Types ----------

export interface ProviderData {
  provider_id: number;
  name: string;
  display_name: string;
  api_key: string | null;
  default_model: string | null;
  enabled: number;
}

export interface RuleData {
  rule_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  category: string | null;
}

export interface ToolData {
  tool_id: number;
  name: string;
  description: string | null;
  platform: string;
  enabled: number;
  capabilities: { capability_id: number; name: string; description: string | null }[];
}

interface AdminClientProps {
  providers: ProviderData[];
  rules: RuleData[];
  tools: ToolData[];
}

// ---------- Provider models ----------

const providerModels: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-20250414'],
  moonshot: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

const defaultProviders: ProviderData[] = [
  { provider_id: 0, name: 'anthropic', display_name: 'Anthropic', api_key: null, default_model: 'claude-sonnet-4-20250514', enabled: 1 },
  { provider_id: 0, name: 'moonshot', display_name: 'Moonshot / Kimi', api_key: null, default_model: null, enabled: 0 },
  { provider_id: 0, name: 'deepseek', display_name: 'DeepSeek', api_key: null, default_model: null, enabled: 0 },
  { provider_id: 0, name: 'google', display_name: 'Google', api_key: null, default_model: null, enabled: 0 },
];

// ---------- Component ----------

export function AdminClient({ providers: initialProviders, rules: initialRules, tools }: AdminClientProps) {
  // Merge DB providers with defaults
  const mergedProviders = defaultProviders.map(dp => {
    const existing = initialProviders.find(p => p.name === dp.name);
    return existing ?? dp;
  });

  const [providers, setProviders] = useState(mergedProviders);
  const [rules, setRules] = useState(initialRules);

  return (
    <div className="space-y-8">
      {/* Model Providers */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Model Providers</h2>
        <div className="grid grid-cols-2 gap-4">
          {providers.map((provider, idx) => (
            <ProviderCard
              key={provider.name}
              provider={provider}
              onChange={(updated) => {
                const next = [...providers];
                next[idx] = updated;
                setProviders(next);
              }}
            />
          ))}
        </div>
      </section>

      {/* Rules Management */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Rules</h2>
          <button className="px-4 py-1.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-xl transition-all hover:-translate-y-0.5">
            + New Rule
          </button>
        </div>
        {rules.length === 0 ? (
          <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-12 text-center">
            <p className="text-sm text-gray-400 font-medium">No rules configured</p>
            <p className="text-xs text-gray-300 mt-1">Rules constrain agent behavior during trading loops</p>
          </div>
        ) : (
          <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold border-b border-black/5">
                  <th className="py-2.5 px-5">Name</th>
                  <th className="py-2.5 px-5">Description</th>
                  <th className="py-2.5 px-5">Prompt</th>
                  <th className="py-2.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.rule_id} className="border-b border-black/5 last:border-0 hover:bg-black/[.02] transition-colors">
                    <td className="py-3 px-5">
                      <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                      {rule.category && (
                        <span className="ml-2 text-[0.6rem] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                          {rule.category}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-5">
                      <span className="text-xs text-gray-500">{rule.description ?? '-'}</span>
                    </td>
                    <td className="py-3 px-5">
                      <span className="text-xs text-gray-400 font-mono truncate block max-w-[200px]">
                        {rule.prompt_text.length > 60
                          ? rule.prompt_text.slice(0, 60) + '...'
                          : rule.prompt_text}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="px-3 py-1 text-xs font-medium rounded-lg bg-white border border-black/10 text-gray-500 hover:text-gray-700 transition-colors">
                          Edit
                        </button>
                        <button
                          onClick={() => setRules(rules.filter(r => r.rule_id !== rule.rule_id))}
                          className="px-3 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tools Management */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Tools</h2>
          <button className="px-4 py-1.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-xl transition-all hover:-translate-y-0.5">
            + New Tool
          </button>
        </div>
        {tools.length === 0 ? (
          <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-12 text-center">
            <p className="text-sm text-gray-400 font-medium">No tools configured</p>
            <p className="text-xs text-gray-300 mt-1">Tools give agents capabilities to interact with trading platforms</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupByPlatform(tools)).map(([platform, platformTools]) => (
              <div key={platform} className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-black/5 bg-black/[.02]">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{platform}</span>
                </div>
                <div className="divide-y divide-black/5">
                  {platformTools.map(tool => (
                    <div key={tool.tool_id} className="flex items-center justify-between px-5 py-3 hover:bg-black/[.02] transition-colors">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">{tool.name}</span>
                        {tool.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{tool.description}</p>
                        )}
                      </div>
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {tool.capabilities.length} capabilities
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Global Settings */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Global Settings</h2>
        <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold mb-2">
                Default Bankroll
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="number"
                  defaultValue={10000}
                  className="w-full bg-black/[.03] border border-black/5 rounded-xl px-4 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold mb-2">
                Default Schedule
              </label>
              <select className="w-full bg-black/[.03] border border-black/5 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 appearance-none">
                <option value="5m">Every 5 minutes</option>
                <option value="15m">Every 15 minutes</option>
                <option value="30m">Every 30 minutes</option>
                <option value="1h" selected>Every 1 hour</option>
                <option value="2h">Every 2 hours</option>
                <option value="4h">Every 4 hours</option>
                <option value="8h">Every 8 hours</option>
                <option value="12h">Every 12 hours</option>
                <option value="24h">Every 24 hours</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- ProviderCard ----------

function ProviderCard({
  provider,
  onChange,
}: {
  provider: ProviderData;
  onChange: (updated: ProviderData) => void;
}) {
  const models = providerModels[provider.name] ?? [];

  return (
    <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-lg font-bold text-gray-400">
            {provider.display_name.charAt(0)}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">{provider.display_name}</h3>
            <span className="text-[0.6rem] text-gray-400 font-mono">{provider.name}</span>
          </div>
        </div>
        <ToggleSwitch
          on={provider.enabled === 1}
          onChange={() => onChange({ ...provider, enabled: provider.enabled === 1 ? 0 : 1 })}
        />
      </div>

      {/* API Key */}
      <div className="mb-3">
        <label className="block text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold mb-1.5">
          API Key
        </label>
        <input
          type="password"
          placeholder="sk-..."
          defaultValue={provider.api_key ?? ''}
          className="w-full bg-black/[.03] border border-black/5 rounded-xl px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
        />
      </div>

      {/* Default Model */}
      <div className="mb-4">
        <label className="block text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold mb-1.5">
          Default Model
        </label>
        <select
          defaultValue={provider.default_model ?? ''}
          className="w-full bg-black/[.03] border border-black/5 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 appearance-none"
        >
          <option value="">Select model...</option>
          {models.map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>

      {/* Test Connection */}
      <button className="w-full px-4 py-2 text-xs font-semibold rounded-xl border border-black/10 text-gray-500 hover:bg-black/[.03] hover:text-gray-700 transition-colors">
        Test Connection
      </button>
    </div>
  );
}

// ---------- Helpers ----------

function groupByPlatform(tools: ToolData[]): Record<string, ToolData[]> {
  const grouped: Record<string, ToolData[]> = {};
  for (const tool of tools) {
    const platform = tool.platform;
    if (!grouped[platform]) grouped[platform] = [];
    grouped[platform].push(tool);
  }
  return grouped;
}
