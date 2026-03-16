import fs from 'node:fs';
import path from 'node:path';

// Generate a tools SDK file for an agent's workspace
// The SDK exposes all tools as callable functions that hit the /api/tools/execute endpoint
export function generateAgentSDK(agentId: string, toolNames: string[], port = 3000): void {
  const workspaceDir = path.join(process.cwd(), 'data', 'workspaces', agentId);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const functions = toolNames.map(name => {
    const camelName = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return `
async function ${camelName}(args = {}) {
  const res = await fetch('http://localhost:${port}/api/tools/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: '${agentId}', tool_name: '${name}', args }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Tool call failed');
  return data.result;
}`;
  }).join('\n');

  const exportNames = toolNames.map(n => n.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));

  // Write .mjs (ESM)
  const esm = `// Auto-generated tool SDK for ${agentId}
// Usage: import { pmMarkets, cryptoPrice } from './tools.mjs';
${functions}

export { ${exportNames.join(', ')} };
`;
  fs.writeFileSync(path.join(workspaceDir, 'tools.mjs'), esm);

  // Write .cjs (CommonJS)
  const cjs = `// Auto-generated tool SDK for ${agentId}
// Usage: const tools = require('./tools.cjs');
${functions}

module.exports = { ${exportNames.join(', ')} };
`;
  fs.writeFileSync(path.join(workspaceDir, 'tools.cjs'), cjs);
}
