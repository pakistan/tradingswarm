'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ---- Types ----

interface ConfigData {
  config_id: number;
  name: string;
  description: string | null;
}

interface VersionData {
  version_id: number;
  version_num: number;
  model_provider: string;
  model_name: string;
  bankroll: number;
  prompt_template: string;
  mechanics_file: string | null;
  schedule_interval: string;
}

interface RuleRow {
  rule_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  category: string | null;
}

interface ToolCapability {
  capability_id: number;
  tool_id: number;
  name: string;
  description: string | null;
  handler: string;
}

interface ToolWithCaps {
  tool_id: number;
  name: string;
  description: string | null;
  platform: string;
  capabilities: ToolCapability[];
}

interface ModelProvider {
  provider_id: number;
  name: string;
  display_name: string;
  default_model: string | null;
}

interface Props {
  config: ConfigData;
  latestVersion: VersionData | null;
  allRules: RuleRow[];
  allTools: ToolWithCaps[];
  modelProviders: ModelProvider[];
  versionRules: { rule_id: number; enabled: number }[];
  versionCaps: { capability_id: number; enabled: number }[];
}

const SCHEDULE_OPTIONS = ['5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '24h'];

const DEFAULT_PROMPT = `You are an autonomous trading agent in a prediction market hedge fund.

Your goal: find market inefficiencies on Polymarket and generate positive P&L.

You run in a continuous loop. Each cycle you wake up, do research, manage your portfolio, and go back to sleep. You are never stopped — if you run out of ideas, think harder. Try new searches, look at different categories, revisit markets you passed on before.

You LEARN over time. Use memory_set to store what you discover — which markets have edge, what approaches work, what mistakes to avoid. Use memory_get to recall your accumulated knowledge. You should get better at this with every cycle.

You COLLABORATE with other agents. Read the coordination channels each cycle. Other agents may have found information that affects your positions. Post your theses before trading and share raw intel. But form your own views — do not blindly follow other agents.

You are a smart, capable researcher. You have access to web search, real-time market data, and an order book simulator. Figure out how to use them to find alpha.

## Identity
Agent ID: {{agent_id}}

## Tools
{{tools}}

## Rules
{{rules}}`;

// ---- Component ----

export function ConfigEditorClient({
  config,
  latestVersion,
  allRules,
  allTools,
  modelProviders,
  versionRules,
  versionCaps,
}: Props) {
  const router = useRouter();
  const nextVersion = (latestVersion?.version_num ?? 0) + 1;

  // Settings state
  const [modelProvider, setModelProvider] = useState(latestVersion?.model_provider ?? 'deepseek');
  const [modelName, setModelName] = useState(latestVersion?.model_name ?? 'deepseek-chat');
  const [schedule, setSchedule] = useState(latestVersion?.schedule_interval ?? '1h');
  const [bankroll, setBankroll] = useState(latestVersion?.bankroll ?? 10000);

  // Prompt state
  const [activeTab, setActiveTab] = useState<'prompt' | 'mechanics'>('prompt');
  const [promptTemplate, setPromptTemplate] = useState(
    latestVersion?.prompt_template ?? DEFAULT_PROMPT
  );
  const [mechanicsFile, setMechanicsFile] = useState(latestVersion?.mechanics_file ?? '');

  // Rules state
  const [ruleStates, setRuleStates] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    for (const r of allRules) {
      const vr = versionRules.find(x => x.rule_id === r.rule_id);
      map[r.rule_id] = vr ? vr.enabled === 1 : true;
    }
    return map;
  });

  // Tool capability states
  const [capStates, setCapStates] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    for (const tool of allTools) {
      for (const cap of tool.capabilities) {
        const vc = versionCaps.find(x => x.capability_id === cap.capability_id);
        map[cap.capability_id] = vc ? vc.enabled === 1 : true;
      }
    }
    return map;
  });

  // Collapsible tool groups
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

  // Show tooltip
  const [showTip, setShowTip] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);

  // Toggle helpers
  const toggleRule = useCallback((ruleId: number) => {
    setRuleStates(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
  }, []);

  const toggleCap = useCallback((capId: number) => {
    setCapStates(prev => ({ ...prev, [capId]: !prev[capId] }));
  }, []);

  const toggleToolGroup = useCallback((toolId: number) => {
    setExpandedTools(prev => ({ ...prev, [toolId]: !prev[toolId] }));
  }, []);

  // Computed values
  const enabledRules = useMemo(
    () => allRules.filter(r => ruleStates[r.rule_id]),
    [allRules, ruleStates]
  );

  const enabledCaps = useMemo(() => {
    const caps: ToolCapability[] = [];
    for (const tool of allTools) {
      for (const cap of tool.capabilities) {
        if (capStates[cap.capability_id]) caps.push(cap);
      }
    }
    return caps;
  }, [allTools, capStates]);

  // Tool group counts
  const toolGroupCounts = useMemo(() => {
    const counts: Record<number, { enabled: number; total: number }> = {};
    for (const tool of allTools) {
      const enabled = tool.capabilities.filter(c => capStates[c.capability_id]).length;
      counts[tool.tool_id] = { enabled, total: tool.capabilities.length };
    }
    return counts;
  }, [allTools, capStates]);

  // Generate preview
  const preview = useMemo(() => {
    const lines: { text: string; color: 'gray' | 'purple' | 'teal' | 'pink' | 'orange' }[] = [];

    const templateLines = promptTemplate.split('\n');
    for (const line of templateLines) {
      if (line.includes('{{rules_block}}')) {
        if (enabledRules.length === 0) {
          lines.push({ text: '(no rules enabled)', color: 'gray' });
        } else {
          for (const r of enabledRules) {
            lines.push({ text: `- ${r.name}`, color: 'purple' });
          }
        }
      } else if (line.includes('{{tools_block}}')) {
        if (enabledCaps.length === 0) {
          lines.push({ text: '(no tools enabled)', color: 'gray' });
        } else {
          for (const c of enabledCaps) {
            lines.push({
              text: `- ${c.name}: ${c.description ?? c.handler}`,
              color: 'teal',
            });
          }
        }
      } else if (line.includes('{{files_block}}')) {
        if (mechanicsFile) {
          lines.push({ text: 'mechanics.md', color: 'orange' });
        } else {
          lines.push({ text: '(no files attached)', color: 'gray' });
        }
      } else if (
        line.includes('{{agent_name}}') ||
        line.includes('{{model}}') ||
        line.includes('{{config_name}}') ||
        line.includes('{{config_version}}') ||
        line.includes('{{bankroll}}')
      ) {
        let resolved = line
          .replace(/\{\{agent_name\}\}/g, 'agent-01')
          .replace(/\{\{model\}\}/g, modelName)
          .replace(/\{\{config_name\}\}/g, config.name)
          .replace(/\{\{config_version\}\}/g, String(nextVersion))
          .replace(/\{\{bankroll\}\}/g, `$${bankroll.toLocaleString()}`);
        lines.push({ text: resolved, color: 'teal' });
      } else {
        lines.push({ text: line || '\u00A0', color: 'gray' });
      }
    }
    return lines;
  }, [promptTemplate, enabledRules, enabledCaps, mechanicsFile, modelName, config.name, nextVersion, bankroll]);

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const rules = allRules.map(r => ({
        rule_id: r.rule_id,
        enabled: ruleStates[r.rule_id] ?? false,
      }));
      const capabilities = allTools.flatMap(t =>
        t.capabilities.map(c => ({
          capability_id: c.capability_id,
          enabled: capStates[c.capability_id] ?? false,
        }))
      );

      const res = await fetch(`/api/configs/${config.config_id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_provider: modelProvider,
          model_name: modelName,
          bankroll,
          prompt_template: promptTemplate,
          mechanics_file: mechanicsFile || null,
          schedule_interval: schedule,
          rules,
          capabilities,
        }),
      });

      if (res.ok) {
        router.push(`/configs/${config.config_id}`);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const colorMap = {
    gray: 'text-gray-500',
    purple: 'bg-primary/[.12] text-primary px-1 rounded',
    teal: 'bg-teal/[.12] text-teal px-1 rounded',
    pink: 'bg-pink-500/[.12] text-pink-500 px-1 rounded',
    orange: 'bg-accent/[.12] text-accent px-1 rounded',
  };

  return (
    <main className="p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/configs/${config.config_id}`} className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
            {config.name}
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-[28px] font-bold text-gray-900">Config Editor</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/configs/${config.config_id}`}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-black/[.05] text-gray-900 hover:bg-black/[.08] transition-all"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Save as v${nextVersion}`}
          </button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-[280px_1fr_320px] gap-5 min-h-[600px]">
        {/* LEFT SIDEBAR */}
        <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] overflow-y-auto max-h-[700px]">
          {/* Settings */}
          <div className="py-4 border-b border-black/[.04]">
            <h4 className="text-[12px] uppercase tracking-wider text-gray-500 font-semibold mb-2.5 px-4">
              Settings
            </h4>
            <div className="flex items-center justify-between px-4 py-1.5 text-[13px]">
              <span>Model</span>
              <select
                value={modelName}
                onChange={e => {
                  setModelName(e.target.value);
                  const provider = modelProviders.find(p => p.default_model === e.target.value);
                  if (provider) setModelProvider(provider.name);
                }}
                className="w-[120px] px-2 py-1 text-xs rounded-lg border border-black/10 bg-white/80 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
              >
                {modelProviders.length > 0 ? (
                  modelProviders.map(p => (
                    <option key={p.provider_id} value={p.default_model ?? p.name}>
                      {p.display_name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="deepseek-chat">DeepSeek V3</option>
                    <option value="kimi-k2">Kimi K2</option>
                    <option value="claude-opus">Claude Opus</option>
                    <option value="claude-haiku">Haiku</option>
                  </>
                )}
              </select>
            </div>
            <div className="flex items-center justify-between px-4 py-1.5 text-[13px]">
              <span>Schedule</span>
              <select
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                className="w-[120px] px-2 py-1 text-xs rounded-lg border border-black/10 bg-white/80 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none"
              >
                {SCHEDULE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>
                    Every {opt}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between px-4 py-1.5 text-[13px]">
              <span>Bankroll</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  type="number"
                  value={bankroll}
                  onChange={e => setBankroll(Number(e.target.value) || 0)}
                  className="w-[100px] pl-5 pr-2 py-1 text-xs rounded-lg border border-black/10 bg-white/80 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Rules */}
          <div className="py-4 border-b border-black/[.04]">
            <h4 className="text-[12px] uppercase tracking-wider text-gray-500 font-semibold mb-2.5 px-4">
              Rules
            </h4>
            {allRules.length === 0 ? (
              <p className="px-4 text-xs text-gray-400">No rules defined. Add them in Admin.</p>
            ) : (
              allRules.map(rule => (
                <div
                  key={rule.rule_id}
                  className="flex items-center justify-between px-4 py-1.5 text-[13px]"
                >
                  <span className={ruleStates[rule.rule_id] ? 'text-gray-900' : 'text-gray-400'}>
                    {rule.name}
                  </span>
                  <button
                    onClick={() => toggleRule(rule.rule_id)}
                    className={`relative w-[44px] h-[24px] rounded-full transition-colors ${
                      ruleStates[rule.rule_id] ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow-sm shadow-black/15 transition-transform ${
                        ruleStates[rule.rule_id] ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Tools */}
          <div className="py-4 border-b border-black/[.04]">
            <h4 className="text-[12px] uppercase tracking-wider text-gray-500 font-semibold mb-2.5 px-4">
              Tools
            </h4>
            {allTools.length === 0 ? (
              <p className="px-4 text-xs text-gray-400">No tools defined. Add them in Admin.</p>
            ) : (
              allTools.map(tool => {
                const counts = toolGroupCounts[tool.tool_id];
                const isExpanded = expandedTools[tool.tool_id] ?? false;
                return (
                  <div key={tool.tool_id}>
                    <button
                      onClick={() => toggleToolGroup(tool.tool_id)}
                      className="flex items-center justify-between w-full px-4 py-2 text-[13px] font-medium hover:bg-black/[.03] rounded-lg transition-colors"
                    >
                      <span>
                        <span
                          className="inline-block w-3 text-[10px] transition-transform"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                        >
                          &#9654;
                        </span>{' '}
                        {tool.name}{' '}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/[.05] text-gray-500 ml-1">
                          {counts?.enabled ?? 0}/{counts?.total ?? 0} enabled
                        </span>
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="pl-8 pr-4 pb-2">
                        {tool.capabilities.map(cap => (
                          <div
                            key={cap.capability_id}
                            className="flex items-center justify-between py-1 text-[12px]"
                          >
                            <span
                              className={
                                capStates[cap.capability_id] ? 'text-gray-700' : 'text-gray-400'
                              }
                            >
                              {cap.name}
                            </span>
                            <button
                              onClick={() => toggleCap(cap.capability_id)}
                              className={`relative w-[36px] h-[20px] rounded-full transition-colors ${
                                capStates[cap.capability_id] ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow-sm shadow-black/15 transition-transform ${
                                  capStates[cap.capability_id] ? 'translate-x-4' : ''
                                }`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Attached Files */}
          <div className="py-4">
            <h4 className="text-[12px] uppercase tracking-wider text-gray-500 font-semibold mb-2.5 px-4">
              Attached Files
            </h4>
            <div className="flex items-center justify-between px-4 py-1.5 text-[13px]">
              <span>mechanics.md</span>
              <span className="text-[11px] text-gray-400">
                {mechanicsFile ? `${(mechanicsFile.length / 1024).toFixed(1)} KB` : 'empty'}
              </span>
            </div>
          </div>
        </div>

        {/* CENTER: PROMPT EDITOR */}
        <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center border-b border-black/[.06] px-5 py-3 gap-2">
            <button
              onClick={() => setActiveTab('prompt')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'prompt'
                  ? 'bg-primary text-white'
                  : 'text-gray-500 hover:bg-black/[.04]'
              }`}
            >
              prompt.md
            </button>
            <button
              onClick={() => setActiveTab('mechanics')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'mechanics'
                  ? 'bg-primary text-white'
                  : 'text-gray-500 hover:bg-black/[.04]'
              }`}
            >
              mechanics.md
            </button>
            <div className="ml-auto relative">
              <button
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
                className="w-5 h-5 rounded-full bg-black/[.06] flex items-center justify-center text-[12px] font-bold text-gray-500 hover:bg-black/[.1] transition-colors"
              >
                ?
              </button>
              {showTip && (
                <div className="absolute right-0 top-7 w-64 bg-white border border-black/10 rounded-xl p-3 shadow-xl z-50 text-xs text-gray-600 leading-relaxed">
                  <p className="font-semibold text-gray-900 mb-1">Autoresearch Tips</p>
                  <ul className="space-y-1 list-disc pl-3">
                    <li>Let the agent form its own thesis</li>
                    <li>Provide data access, not conclusions</li>
                    <li>Encourage contrarian thinking</li>
                    <li>Use template variables for dynamic injection</li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={activeTab === 'prompt' ? promptTemplate : mechanicsFile}
            onChange={e =>
              activeTab === 'prompt'
                ? setPromptTemplate(e.target.value)
                : setMechanicsFile(e.target.value)
            }
            className="flex-1 border-none rounded-b-[20px] p-5 font-mono text-[13px] leading-[1.8] bg-transparent resize-none outline-none min-h-[500px]"
            placeholder={
              activeTab === 'prompt'
                ? 'Write your prompt template here...'
                : 'Write mechanics instructions here...'
            }
            spellCheck={false}
          />
        </div>

        {/* RIGHT: INSTANTIATION PREVIEW */}
        <div className="bg-white/70 backdrop-blur-2xl border border-black/5 rounded-[20px] p-4 overflow-y-auto max-h-[700px]">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Live Preview</h3>
          <div className="font-mono text-[11.5px] leading-[2]">
            {preview.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap">
                <span className={colorMap[line.color]}>{line.text}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-3 border-t border-black/[.04] mt-3">
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-2.5 h-2.5 rounded bg-primary/20" />
              Rules
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-2.5 h-2.5 rounded bg-teal/20" />
              Tools / Variables
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-2.5 h-2.5 rounded bg-pink-500/20" />
              Memory
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-2.5 h-2.5 rounded bg-accent/20" />
              Files
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-2.5 h-2.5 rounded bg-gray-200" />
              Template
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
