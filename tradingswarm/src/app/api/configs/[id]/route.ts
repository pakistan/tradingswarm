import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { getConfig, listVersions, getVersionRules, getVersionCapabilities } from '@/lib/db/configs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const configId = parseInt(params.id, 10);
  if (isNaN(configId)) {
    return NextResponse.json({ error: 'Invalid config id' }, { status: 400 });
  }

  const config = getConfig(db, configId);
  if (!config) {
    return NextResponse.json({ error: 'Config not found' }, { status: 404 });
  }

  const versions = listVersions(db, configId);

  const enrichedVersions = versions.map(v => {
    const rules = getVersionRules(db, v.version_id);
    const capabilities = getVersionCapabilities(db, v.version_id);
    return {
      ...v,
      rules,
      capabilities,
    };
  });

  // Get agents using this config
  const agents = db.prepare(
    `SELECT agent_id, display_name, status, config_version_id
     FROM agents
     WHERE config_version_id IN (SELECT version_id FROM config_versions WHERE config_id = ?)
     ORDER BY created_at DESC`
  ).all(configId);

  return NextResponse.json({
    ...config,
    versions: enrichedVersions,
    agents,
  });
}
