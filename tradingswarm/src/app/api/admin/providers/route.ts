import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listModelProviders, updateModelProvider } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  const providers = listModelProviders(db);
  return NextResponse.json(providers);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { provider_id, api_key, default_model, enabled } = body;

    if (!provider_id || typeof provider_id !== 'number') {
      return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
    }

    const db = getDb();
    updateModelProvider(db, provider_id, { api_key, default_model, enabled });
    const providers = listModelProviders(db);
    return NextResponse.json(providers);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
