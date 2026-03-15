import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAgent } from '@/lib/db/agents';
import { getAgentManager } from '@/lib/agent/singleton';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const agent = getAgent(db, params.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (!agent.config_version_id) {
      return NextResponse.json(
        { error: 'Agent has no config version assigned' },
        { status: 400 }
      );
    }

    const manager = getAgentManager();
    manager.restart(params.id);
    return NextResponse.json({ status: 'restarted', agent_id: params.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
