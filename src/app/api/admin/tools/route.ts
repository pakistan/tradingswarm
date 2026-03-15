import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listTools } from '@/lib/db/configs';

export async function GET() {
  const db = getDb();
  const tools = listTools(db);
  return NextResponse.json(tools);
}

export async function PUT(request: Request) {
  try {
    const { tool_id, config_json } = await request.json();
    if (!tool_id) return NextResponse.json({ error: 'tool_id required' }, { status: 400 });
    const db = getDb();
    db.prepare('UPDATE tools SET config_json = ? WHERE tool_id = ?').run(
      typeof config_json === 'string' ? config_json : JSON.stringify(config_json),
      tool_id,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
