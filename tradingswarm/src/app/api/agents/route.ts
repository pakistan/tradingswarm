import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listAgents, createAgent } from '@/lib/db/agents';
import { getVersion } from '@/lib/db/configs';

export async function GET() {
  try {
    const db = getDb();
    const agents = listAgents(db);
    return NextResponse.json(agents);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, display_name, config_version_id } = body;

    if (!agent_id || typeof agent_id !== 'string') {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    const db = getDb();

    // Validate config version exists if provided
    if (config_version_id !== undefined) {
      const version = getVersion(db, config_version_id);
      if (!version) {
        return NextResponse.json(
          { error: `Config version ${config_version_id} not found` },
          { status: 400 }
        );
      }
    }

    const agent = createAgent(db, agent_id, display_name, config_version_id);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Agent ID already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
