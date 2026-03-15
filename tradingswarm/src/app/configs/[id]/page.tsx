import { getDb } from '@/lib/db/index';
import { getConfig, listVersions, getVersionRules, getVersionCapabilities } from '@/lib/db/configs';
import { notFound } from 'next/navigation';
import { ConfigDetailClient } from './config-detail-client';

interface VersionRule {
  rule_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  category: string | null;
  created_at: string;
  enabled: number;
}

interface VersionCapability {
  capability_id: number;
  tool_id: number;
  name: string;
  description: string | null;
  handler: string;
  enabled: number;
}

export interface EnrichedVersion {
  version_id: number;
  config_id: number;
  version_num: number;
  model_provider: string;
  model_name: string;
  bankroll: number;
  prompt_template: string;
  mechanics_file: string | null;
  schedule_interval: string;
  diff_summary: string | null;
  created_at: string;
  rules: VersionRule[];
  capabilities: VersionCapability[];
}

interface Agent {
  agent_id: string;
  display_name: string | null;
  status: string;
  config_version_id: number | null;
}

function getConfigDetail(configId: number) {
  const db = getDb();
  const config = getConfig(db, configId);
  if (!config) return null;

  const versions = listVersions(db, configId);
  const enrichedVersions: EnrichedVersion[] = versions.map(v => ({
    ...v,
    rules: getVersionRules(db, v.version_id) as VersionRule[],
    capabilities: getVersionCapabilities(db, v.version_id) as VersionCapability[],
  }));

  const agents = db.prepare(
    `SELECT agent_id, display_name, status, config_version_id
     FROM agents
     WHERE config_version_id IN (SELECT version_id FROM config_versions WHERE config_id = ?)
     ORDER BY created_at DESC`
  ).all(configId) as Agent[];

  return { config, versions: enrichedVersions, agents };
}

export default function ConfigDetailPage({ params }: { params: { id: string } }) {
  const configId = parseInt(params.id, 10);
  if (isNaN(configId)) notFound();

  const data = getConfigDetail(configId);
  if (!data) notFound();

  return (
    <main className="p-8 max-w-[1400px] mx-auto">
      <ConfigDetailClient
        config={data.config}
        versions={data.versions}
        agents={data.agents}
      />
    </main>
  );
}
