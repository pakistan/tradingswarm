import { getDb } from '@/lib/db/index';
import { getToolLog, getToolLogAgents, getToolLogToolNames } from '@/lib/db/observability';
import { ToolLogClient } from './client';

export default function ToolLogPage() {
  const db = getDb();
  const logs = getToolLog(db, { limit: 200 });
  const agents = getToolLogAgents(db);
  const toolNames = getToolLogToolNames(db);

  return (
    <main className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tool Activity Log</h1>
        <p className="text-sm text-gray-400 mt-1">All tool calls across all agents</p>
      </div>

      <ToolLogClient
        initialLogs={logs}
        agents={agents}
        toolNames={toolNames}
      />
    </main>
  );
}
