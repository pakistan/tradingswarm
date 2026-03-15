import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { listAgents, createAgent } from '@/lib/db/agents';

export async function GET() {
  const db = getDb();
  const agents = listAgents(db);
  return NextResponse.json(agents);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, display_name, config_version_id } = body;

    if (!agent_id || typeof agent_id !== 'string') {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    const db = getDb();
    const agent = createAgent(db, agent_id, display_name, config_version_id);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
