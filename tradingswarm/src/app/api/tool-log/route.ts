import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { getToolLog, getToolLogAgents, getToolLogToolNames } from '@/lib/db/observability';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent_id = searchParams.get('agent_id') || undefined;
  const tool_name = searchParams.get('tool_name') || undefined;
  const limit = parseInt(searchParams.get('limit') ?? '200', 10);
  const after = searchParams.get('after') || undefined;

  const db = getDb();
  const logs = getToolLog(db, { agent_id, tool_name, limit, after });
  const agents = getToolLogAgents(db);
  const toolNames = getToolLogToolNames(db);

  return NextResponse.json({ logs, agents, toolNames });
}
