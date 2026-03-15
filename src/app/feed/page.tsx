import { getDb } from '@/lib/db/index';
import { listAgents } from '@/lib/db/agents';
import { FeedClient } from './feed-client';

export default function FeedPage() {
  const db = getDb();
  const agents = listAgents(db);

  // Get all event types for filter options
  const eventTypes = (db.prepare(
    'SELECT DISTINCT event_type FROM agent_events ORDER BY event_type'
  ).all() as { event_type: string }[]).map(r => r.event_type);

  // Get all tool names for filter options
  const toolNames = (db.prepare(
    'SELECT DISTINCT tool_name FROM tool_log ORDER BY tool_name'
  ).all() as { tool_name: string }[]).map(r => r.tool_name);

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feed</h1>
        <p className="text-sm text-gray-400 mt-0.5">Real-time activity across all agents</p>
      </div>
      <FeedClient
        agentIds={agents.map(a => a.agent_id)}
        eventTypes={eventTypes}
        toolNames={toolNames}
      />
    </main>
  );
}
