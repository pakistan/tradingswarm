import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'node:events';
import { migrate } from '@/lib/db/schema';
import { createAgent, getAgent } from '@/lib/db/agents';
import { createConfig, createVersion, createModelProvider } from '@/lib/db/configs';
import { AgentManager } from './agent-manager';

// Mock child_process.fork
vi.mock('node:child_process', () => {
  const forkMock = vi.fn();
  return { fork: forkMock, __mockFork: forkMock };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getForkMock(): Promise<any> {
  const mod = await import('node:child_process');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).__mockFork;
}

function createMockChild(pid = 12345): EventEmitter & { pid: number; kill: ReturnType<typeof vi.fn>; killed: boolean } {
  const child = new EventEmitter() as EventEmitter & { pid: number; kill: ReturnType<typeof vi.fn>; killed: boolean };
  child.pid = pid;
  child.kill = vi.fn();
  child.killed = false;
  return child;
}

let db: Database.Database;
let dbPath: string;

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `ts-mgr-${Date.now()}-${Math.random()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);

  providerCreated = false;

  const forkMock = await getForkMock();
  forkMock.mockReset();
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

let providerCreated = false;

function ensureProvider() {
  if (!providerCreated) {
    createModelProvider(db, 'anthropic', 'Anthropic', undefined, 'test-key', 'claude-3-5-sonnet');
    providerCreated = true;
  }
}

function setupAgent(agentId: string) {
  const cfg = createConfig(db, `config-${agentId}`);
  const ver = createVersion(db, cfg.config_id, {
    model_provider: 'anthropic',
    model_name: 'claude-3-5-sonnet',
    prompt_template: 'Test prompt',
  });
  ensureProvider();
  createAgent(db, agentId, `Agent ${agentId}`, ver.version_id);
  return ver;
}

describe('AgentManager', () => {
  it('spawns an agent and updates status to running', async () => {
    setupAgent('spawn-1');
    const forkMock = await getForkMock();
    const child = createMockChild(111);
    forkMock.mockReturnValueOnce(child);

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('spawn-1');

    const agent = getAgent(db, 'spawn-1')!;
    expect(agent.status).toBe('running');
    expect(agent.pid).toBe(111);
    expect(manager.getRunningAgents()).toContain('spawn-1');
  });

  it('throws when spawning already running agent', async () => {
    setupAgent('double-spawn');
    const forkMock = await getForkMock();
    forkMock.mockReturnValue(createMockChild());

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('double-spawn');
    expect(() => manager.spawn('double-spawn')).toThrow('already running');
  });

  it('throws when spawning nonexistent agent', () => {
    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    expect(() => manager.spawn('nonexistent')).toThrow('Agent not found');
  });

  it('throws when agent has no config version', () => {
    createAgent(db, 'no-config', 'No Config');
    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    expect(() => manager.spawn('no-config')).toThrow('no config version');
  });

  it('stops an agent and sends SIGTERM', async () => {
    setupAgent('stop-1');
    const forkMock = await getForkMock();
    const child = createMockChild();
    forkMock.mockReturnValueOnce(child);

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('stop-1');
    manager.stop('stop-1');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.getRunningAgents()).not.toContain('stop-1');

    const agent = getAgent(db, 'stop-1')!;
    expect(agent.status).toBe('stopped');
  });

  it('stop is safe for non-running agent', () => {
    setupAgent('safe-stop');
    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.stop('safe-stop'); // Should not throw

    const agent = getAgent(db, 'safe-stop')!;
    expect(agent.status).toBe('stopped');
  });

  it('restarts an agent', async () => {
    setupAgent('restart-1');
    const forkMock = await getForkMock();
    const child1 = createMockChild(100);
    const child2 = createMockChild(200);
    forkMock.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('restart-1');

    expect(manager.status('restart-1')).toBe('running');
    expect(getAgent(db, 'restart-1')!.pid).toBe(100);

    manager.restart('restart-1');

    expect(child1.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.status('restart-1')).toBe('running');
    expect(getAgent(db, 'restart-1')!.pid).toBe(200);
  });

  it('reports correct status', async () => {
    setupAgent('status-1');
    const forkMock = await getForkMock();
    forkMock.mockReturnValue(createMockChild());

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    expect(manager.status('status-1')).toBe('stopped');

    manager.spawn('status-1');
    expect(manager.status('status-1')).toBe('running');

    manager.stop('status-1');
    expect(manager.status('status-1')).toBe('stopped');
  });

  it('lists running agents', async () => {
    setupAgent('list-1');
    setupAgent('list-2');
    const forkMock = await getForkMock();
    forkMock.mockReturnValue(createMockChild());

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('list-1');
    manager.spawn('list-2');

    const running = manager.getRunningAgents();
    expect(running).toContain('list-1');
    expect(running).toContain('list-2');
    expect(running).toHaveLength(2);
  });

  it('stopAll stops all running agents', async () => {
    setupAgent('all-1');
    setupAgent('all-2');
    const forkMock = await getForkMock();
    const child1 = createMockChild(1);
    const child2 = createMockChild(2);
    forkMock.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('all-1');
    manager.spawn('all-2');

    manager.stopAll();

    expect(child1.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child2.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.getRunningAgents()).toHaveLength(0);
  });

  it('recovers running agents from DB', async () => {
    setupAgent('recover-1');
    // Manually set status to running (simulating server crash)
    db.prepare(`UPDATE agents SET status = 'running' WHERE agent_id = ?`).run('recover-1');

    const forkMock = await getForkMock();
    forkMock.mockReturnValue(createMockChild());

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.recoverRunningAgents();

    expect(manager.getRunningAgents()).toContain('recover-1');
  });

  it('auto-restarts agent on unexpected exit with backoff', async () => {
    vi.useFakeTimers();
    setupAgent('crash-1');
    const forkMock = await getForkMock();
    const child1 = createMockChild(100);
    const child2 = createMockChild(200);
    forkMock.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('crash-1');

    // Simulate unexpected exit
    child1.emit('exit', 1, null);

    // Agent should be scheduled for restart
    expect(manager.getRunningAgents()).not.toContain('crash-1');

    // Fast-forward past backoff (1s for first retry)
    await vi.advanceTimersByTimeAsync(1100);

    // Agent should be re-spawned
    expect(manager.getRunningAgents()).toContain('crash-1');

    vi.useRealTimers();
  });

  it('marks agent as failed after too many retries', async () => {
    vi.useFakeTimers();
    setupAgent('fail-1');
    const forkMock = await getForkMock();

    // Create mock children that we track
    const children: Array<EventEmitter & { pid: number; kill: ReturnType<typeof vi.fn>; killed: boolean }> = [];
    for (let i = 0; i < 10; i++) {
      const child = createMockChild(i + 100);
      children.push(child);
      forkMock.mockReturnValueOnce(child);
    }

    const manager = new AgentManager(db, dbPath, '/fake/worker.ts');
    manager.spawn('fail-1'); // uses children[0]

    // Simulate 6 crashes (> MAX_RETRIES_IN_WINDOW = 5)
    // After each crash + backoff, a new child is spawned
    for (let i = 0; i < 6; i++) {
      children[i].emit('exit', 1, null);
      // Fast-forward past backoff to trigger restart
      await vi.advanceTimersByTimeAsync(10000);
    }

    // After 6 crashes, agent should be marked as failed
    const agent = getAgent(db, 'fail-1')!;
    expect(agent.status).toBe('failed');

    vi.useRealTimers();
  });
});
