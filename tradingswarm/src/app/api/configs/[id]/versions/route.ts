import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { getConfig, createVersion, setVersionRules, setVersionCapabilities } from '@/lib/db/configs';

export async function POST(
  request: Request,
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

  const body = await request.json();
  const {
    model_provider,
    model_name,
    bankroll,
    prompt_template,
    mechanics_file,
    schedule_interval,
    diff_summary,
    rules,
    capabilities,
  } = body;

  if (!prompt_template || !model_provider || !model_name) {
    return NextResponse.json(
      { error: 'model_provider, model_name, and prompt_template are required' },
      { status: 400 }
    );
  }

  const version = createVersion(db, configId, {
    model_provider,
    model_name,
    bankroll: bankroll ?? 10000,
    prompt_template,
    mechanics_file: mechanics_file ?? null,
    schedule_interval: schedule_interval ?? '1h',
    diff_summary: diff_summary ?? null,
  });

  if (rules && Array.isArray(rules)) {
    setVersionRules(db, version.version_id, rules);
  }

  if (capabilities && Array.isArray(capabilities)) {
    setVersionCapabilities(db, version.version_id, capabilities);
  }

  return NextResponse.json(version, { status: 201 });
}
