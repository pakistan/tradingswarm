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
  config_json: string | null;
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
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
  moonshot: ['kimi-k2.5', 'kimi-k2', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

const defaultProviders: ProviderData[] = [
  { provider_id: 0, name: 'anthropic', display_name: 'Anthropic', api_key: null, default_model: 'claude-sonnet-4-20250514', enabled: 1 },
  { provider_id: 0, name: 'openai', display_name: 'OpenAI', api_key: null, default_model: 'gpt-4o-mini', enabled: 0 },
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
  const [activeTab, setActiveTab] = useState<'providers' | 'tools' | 'rules' | 'settings'>('providers');

  const tabs = [
    { key: 'providers' as const, label: 'Providers' },
    { key: 'tools' as const, label: 'Tools' },
    { key: 'rules' as const, label: 'Rules' },
    { key: 'settings' as const, label: 'Settings' },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-0.5 bg-black/[.03] rounded-2xl p-1 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'text-gray-900 bg-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Model Providers */}
      {activeTab === 'providers' && <section>
        <ProvidersTable providers={providers} onChange={setProviders} />
      </section>}

      {/* Rules Management */}
      {activeTab === 'rules' && <section>
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
      </section>}

      {/* Tools Management */}
      {activeTab === 'tools' && <ToolsSection tools={tools} />}

      {/* Global Settings */}
      {activeTab === 'settings' && <section>
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
      </section>}
    </div>
  );
}

// ---------- ProvidersTable ----------

function ProvidersTable({ providers, onChange }: { providers: ProviderData[]; onChange: (p: ProviderData[]) => void }) {
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    const keys: Record<string, string> = {};
    for (const p of providers) keys[p.name] = p.api_key ?? '';
    return keys;
  });
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});

  const saveProvider = async (provider: ProviderData, updates: Partial<ProviderData>) => {
    const updated = providers.map(p => p.name === provider.name ? { ...p, ...updates } : p);
    onChange(updated);
    if (provider.provider_id === 0) return;
    await fetch('/api/admin/providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: provider.provider_id, ...updates }),
    });
  };

  const testModel = async (providerName: string, model: string) => {
    const key = apiKeys[providerName];
    if (!key) return;
    const testKey = `${providerName}:${model}`;
    setTestStatus(prev => ({ ...prev, [testKey]: 'testing' }));
    try {
      const res = await fetch('/api/admin/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_name: providerName, api_key: key, model }),
      });
      const data = await res.json();
      setTestStatus(prev => ({ ...prev, [testKey]: data.ok ? 'success' : 'error' }));
    } catch {
      setTestStatus(prev => ({ ...prev, [testKey]: 'error' }));
    }
  };

  // Build flat list: one row per model, grouped by provider
  const rows: { provider: ProviderData; model: string; isFirstInGroup: boolean; groupSize: number }[] = [];
  for (const provider of providers) {
    const models = providerModels[provider.name] ?? [];
    models.forEach((model, i) => {
      rows.push({ provider, model, isFirstInGroup: i === 0, groupSize: models.length });
    });
  }

  return (
    <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold border-b border-black/5">
            <th className="py-2.5 px-5">Provider</th>
            <th className="py-2.5 px-5">Model</th>
            <th className="py-2.5 px-5">API Key</th>
            <th className="py-2.5 px-5 text-center">Status</th>
            <th className="py-2.5 px-5 text-center">Enabled</th>
            <th className="py-2.5 px-5 text-right">Test</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ provider, model, isFirstInGroup, groupSize }) => {
            const testKey = `${provider.name}:${model}`;
            const status = testStatus[testKey] ?? 'idle';
            const hasKey = !!(apiKeys[provider.name]);

            return (
              <tr key={testKey} className={`border-b border-black/5 last:border-0 hover:bg-black/[.02] ${isFirstInGroup && rows.indexOf(rows.find(r => r.provider.name === provider.name && r.isFirstInGroup)!) > 0 ? 'border-t-2 border-t-black/10' : ''}`}>
                <td className="py-3 px-5">
                  {isFirstInGroup ? (
                    <span className="text-sm font-semibold text-gray-900">{provider.display_name}</span>
                  ) : (
                    <span className="text-sm text-gray-200">&nbsp;</span>
                  )}
                </td>
                <td className="py-3 px-5">
                  <span className="text-xs font-mono text-gray-700">{model}</span>
                </td>
                <td className="py-3 px-5">
                  {isFirstInGroup ? (
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={apiKeys[provider.name] ?? ''}
                      onChange={(e) => setApiKeys(prev => ({ ...prev, [provider.name]: e.target.value }))}
                      onBlur={() => {
                        if (apiKeys[provider.name] !== (provider.api_key ?? '')) {
                          saveProvider(provider, { api_key: apiKeys[provider.name] });
                        }
                      }}
                      className="w-full bg-black/[.03] border border-black/5 rounded-lg px-2 py-1 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  ) : null}
                </td>
                <td className="py-3 px-5 text-center">
                  {status === 'success' && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />}
                  {status === 'error' && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
                  {status === 'testing' && <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />}
                  {status === 'idle' && <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />}
                </td>
                <td className="py-3 px-5 text-center">
                  {isFirstInGroup ? (
                    <ToggleSwitch
                      on={provider.enabled === 1}
                      onChange={() => saveProvider(provider, { enabled: provider.enabled === 1 ? 0 : 1 })}
                    />
                  ) : null}
                </td>
                <td className="py-3 px-5 text-right">
                  <button
                    onClick={() => testModel(provider.name, model)}
                    disabled={!hasKey || status === 'testing'}
                    className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded-lg transition-colors ${
                      !hasKey ? 'bg-gray-50 text-gray-300 cursor-not-allowed' :
                      status === 'testing' ? 'bg-yellow-50 text-yellow-600' :
                      status === 'success' ? 'bg-emerald-50 text-emerald-600' :
                      status === 'error' ? 'bg-red-50 text-red-500' :
                      'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {status === 'testing' ? '...' : 'Test'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- ToolsSection ----------

function ToolsSection({ tools }: { tools: ToolData[] }) {
  const platforms = Object.entries(groupByPlatform(tools));
  const [activePlatform, setActivePlatform] = useState(platforms[0]?.[0] ?? '');

  if (tools.length === 0) {
    return (
      <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl p-12 text-center">
        <p className="text-sm text-gray-400 font-medium">No tools configured</p>
      </div>
    );
  }

  const currentTools = groupByPlatform(tools)[activePlatform] ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-0.5 bg-black/[.03] rounded-2xl p-1">
          {platforms.map(([platform]) => (
            <button
              key={platform}
              onClick={() => setActivePlatform(platform)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activePlatform === platform
                  ? 'text-gray-900 bg-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {platform}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white/70 border border-black/5 rounded-2xl backdrop-blur-xl overflow-hidden">
        <div className="divide-y divide-black/5">
          {currentTools.map(tool => (
            <ToolCard key={tool.tool_id} tool={tool} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- ToolCard ----------

function ToolCard({ tool }: { tool: ToolData }) {
  const [expanded, setExpanded] = useState(false);
  const config: Record<string, string> = tool.config_json ? (() => { try { return JSON.parse(tool.config_json); } catch { return {}; } })() : {};
  const hasConfig = Object.keys(config).length > 0;
  const [values, setValues] = useState(config);
  const [saving, setSaving] = useState(false);
  const [testingCap, setTestingCap] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; output: string }>>({});

  const saveConfig = async (updated: Record<string, string>) => {
    setSaving(true);
    try {
      await fetch('/api/admin/tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_id: tool.tool_id, config_json: updated }),
      });
    } finally {
      setSaving(false);
    }
  };

  const testTool = async (capName: string) => {
    setTestingCap(capName);
    setTestResult(prev => ({ ...prev, [capName]: { ok: true, output: 'Testing...' } }));
    try {
      const res = await fetch('/api/admin/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: capName, args: {} }),
      });
      const data = await res.json();
      const output = data.ok
        ? JSON.stringify(data.result, null, 2)
        : data.error ?? 'Unknown error';
      setTestResult(prev => ({ ...prev, [capName]: { ok: data.ok, output } }));
    } catch (err) {
      setTestResult(prev => ({ ...prev, [capName]: { ok: false, output: err instanceof Error ? err.message : 'Network error' } }));
    } finally {
      setTestingCap(null);
    }
  };

  return (
    <div className="px-5 py-3 hover:bg-black/[.02] transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-900">{tool.name}</span>
          {tool.description && (
            <p className="text-xs text-gray-400 mt-0.5">{tool.description}</p>
          )}
        </div>
        {hasConfig && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-primary hover:text-primary-dark transition-colors"
          >
            {expanded ? 'Hide Settings' : 'Settings'}
          </button>
        )}
      </div>
      {/* Capabilities */}
      <div className="mt-2 space-y-1">
        {tool.capabilities.map(cap => (
          <div key={cap.capability_id}>
            <div className="flex items-center gap-2 pl-3">
              <span className="text-xs font-mono text-primary/70">{cap.name}</span>
              {cap.description && (
                <span className="text-xs text-gray-400">— {cap.description}</span>
              )}
              <button
                onClick={() => testTool(cap.name)}
                disabled={testingCap === cap.name}
                className={`ml-auto text-[0.6rem] font-semibold px-2 py-0.5 rounded-lg transition-colors ${
                  testResult[cap.name]?.ok === true && testingCap !== cap.name
                    ? 'bg-emerald-50 text-emerald-600'
                    : testResult[cap.name]?.ok === false
                    ? 'bg-red-50 text-red-500'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {testingCap === cap.name ? 'Testing...' : 'Test'}
              </button>
            </div>
            {testResult[cap.name] && testingCap !== cap.name && (
              <pre className={`ml-3 mt-1 text-[0.65rem] font-mono p-2 rounded-lg max-h-[150px] overflow-y-auto ${
                testResult[cap.name].ok ? 'bg-emerald-50/50 text-emerald-700' : 'bg-red-50/50 text-red-600'
              }`}>{testResult[cap.name].output}</pre>
            )}
          </div>
        ))}
      </div>
      {expanded && hasConfig && (
        <div className="mt-3 space-y-2 pl-0">
          {Object.entries(values).map(([key, val]) => (
            <div key={key}>
              <label className="block text-[0.6rem] uppercase tracking-widest text-gray-400 font-semibold mb-1">
                {key.replace(/_/g, ' ')}
              </label>
              <input
                type={key.includes('key') || key.includes('secret') ? 'password' : 'text'}
                value={val}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                onBlur={() => saveConfig(values)}
                placeholder={`Enter ${key.replace(/_/g, ' ')}...`}
                className="w-full bg-black/[.03] border border-black/5 rounded-xl px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
              />
            </div>
          ))}
          {saving && <p className="text-[0.65rem] text-gray-400">Saving...</p>}
        </div>
      )}
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
