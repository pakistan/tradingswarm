import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { buildToolRegistry } from '@/lib/agent/tool-registry';

export async function POST(request: Request) {
  try {
    const { agent_id, tool_name, args } = await request.json();
    if (!agent_id || !tool_name) {
      return NextResponse.json({ error: 'agent_id and tool_name required' }, { status: 400 });
    }

    const db = getDb();

    // Get agent's config version
    const agent = db.prepare('SELECT config_version_id FROM agents WHERE agent_id = ?').get(agent_id) as { config_version_id: number } | undefined;
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    // Build registry for this agent
    const registry = buildToolRegistry(db, agent_id, agent.config_version_id, () => 'script-' + Date.now());

    const handler = registry.getHandler(tool_name);
    if (!handler) return NextResponse.json({ error: `Unknown tool: ${tool_name}` }, { status: 404 });

    const result = await handler(args ?? {});

    // Try to parse as JSON, return raw if not
    try {
      return NextResponse.json({ ok: true, result: JSON.parse(result) });
    } catch {
      return NextResponse.json({ ok: true, result });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
