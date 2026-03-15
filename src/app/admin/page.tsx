import { getDb } from '@/lib/db/index';
import { listModelProviders, createModelProvider, updateModelProvider, listRules, listTools } from '@/lib/db/configs';
import { AdminClient } from '@/components/admin-client';

const SEED_PROVIDERS = [
  { name: 'anthropic', display_name: 'Anthropic', api_base: 'https://api.anthropic.com', default_model: 'claude-sonnet-4-20250514' },
  { name: 'openai', display_name: 'OpenAI', api_base: null, default_model: 'gpt-4o-mini' },
  { name: 'moonshot', display_name: 'Moonshot / Kimi', api_base: 'https://api.moonshot.ai/v1', default_model: null },
  { name: 'deepseek', display_name: 'DeepSeek', api_base: 'https://api.deepseek.com', default_model: null },
  { name: 'google', display_name: 'Google', api_base: 'https://generativelanguage.googleapis.com/v1beta/openai/', default_model: null },
];

function seedProviders(db: ReturnType<typeof getDb>) {
  const existing = listModelProviders(db);
  for (const seed of SEED_PROVIDERS) {
    const found = existing.find(p => p.name === seed.name);
    if (!found) {
      createModelProvider(db, seed.name, seed.display_name, seed.api_base, undefined, seed.default_model ?? undefined);
    } else if (!found.api_base && seed.api_base) {
      // Backfill api_base for existing providers missing it
      updateModelProvider(db, found.provider_id, { api_base: seed.api_base });
    }
  }
}

export default function AdminPage() {
  const db = getDb();
  seedProviders(db);
  const providers = listModelProviders(db);
  const rules = listRules(db);
  const tools = listTools(db);

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage providers, rules, tools, and global settings</p>
      </div>

      <AdminClient
        providers={providers.map(p => ({
          provider_id: p.provider_id,
          name: p.name,
          display_name: p.display_name,
          api_key: p.api_key,
          default_model: p.default_model,
          enabled: p.enabled,
        }))}
        rules={rules.map(r => ({
          rule_id: r.rule_id,
          name: r.name,
          description: r.description,
          prompt_text: r.prompt_text,
          category: r.category,
        }))}
        tools={tools.map(t => ({
          tool_id: t.tool_id,
          name: t.name,
          description: t.description,
          platform: t.platform,
          enabled: t.enabled,
          config_json: t.config_json,
          capabilities: t.capabilities.map(c => ({
            capability_id: c.capability_id,
            name: c.name,
            description: c.description,
          })),
        }))}
      />
    </main>
  );
}
