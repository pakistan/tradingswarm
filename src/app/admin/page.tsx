import { getDb } from '@/lib/db/index';
import { listModelProviders, listRules, listTools } from '@/lib/db/configs';
import { AdminClient } from '@/components/admin-client';

export default function AdminPage() {
  const db = getDb();
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
