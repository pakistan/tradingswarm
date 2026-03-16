import type { DomainModule, ToolContext, ToolHandler } from '@/lib/platforms/registry';
import type { ToolDef } from '@/lib/agent/llm-client';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ---- Tool Definitions ----

const definitions: Record<string, ToolDef> = {
  notepad_read: {
    name: 'notepad_read',
    description: 'Read a file from your workspace. Use for notes, analysis, code, or any scratch work.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to your workspace (e.g. "notes.md", "analysis/model.py")' },
      },
      required: ['path'],
    },
  },
  notepad_write: {
    name: 'notepad_write',
    description: 'Write a file to your workspace. Creates directories as needed. Use for notes, calculations, code, research logs.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to your workspace' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  notepad_list: {
    name: 'notepad_list',
    description: 'List all files in your workspace.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  run_code: {
    name: 'run_code',
    description: 'Execute a Python or Node.js script from your workspace. Use for calculations, data analysis, or any computation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Script path relative to your workspace (e.g. "calc.py", "analysis.js")' },
      },
      required: ['path'],
    },
  },
};

// ---- Handlers ----

function handlers(ctx: ToolContext): Record<string, ToolHandler> {
  const workspaceDir = path.join(process.cwd(), 'data', 'workspaces', ctx.agentId);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const safePath = (p: string) => {
    const resolved = path.resolve(workspaceDir, p);
    if (!resolved.startsWith(workspaceDir)) throw new Error('Path outside workspace');
    return resolved;
  };

  return {
    notepad_read: async (args) => {
      const filePath = safePath(String(args.path));
      if (!fs.existsSync(filePath)) return JSON.stringify({ error: 'File not found' });
      return fs.readFileSync(filePath, 'utf-8');
    },
    notepad_write: async (args) => {
      const filePath = safePath(String(args.path));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, String(args.content));
      return JSON.stringify({ ok: true, path: args.path });
    },
    notepad_list: async () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else files.push(path.relative(workspaceDir, full));
        }
      };
      walk(workspaceDir);
      return JSON.stringify(files);
    },
    run_code: async (args) => {
      const filePath = safePath(String(args.path));
      if (!fs.existsSync(filePath)) return JSON.stringify({ error: 'File not found' });
      const ext = path.extname(filePath);
      let cmd: string;
      if (ext === '.py') cmd = `python3 "${filePath}"`;
      else if (ext === '.js') cmd = `node "${filePath}"`;
      else return JSON.stringify({ error: `Unsupported file type: ${ext}. Use .py or .js` });
      try {
        const output = execSync(cmd, { cwd: workspaceDir, timeout: 30000, encoding: 'utf-8' });
        return output || '(no output)';
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        return JSON.stringify({ error: e.stderr || e.message || 'Execution failed' });
      }
    },
  };
}

// ---- Domain Export ----

export const workspaceDomain: DomainModule = {
  name: 'workspace',
  tools: { definitions, handlers },
};
