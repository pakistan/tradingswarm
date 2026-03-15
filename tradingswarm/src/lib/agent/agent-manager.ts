import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getAgent, updateAgentStatus, listAgents } from '@/lib/db/agents';
import { insertEvent } from '@/lib/db/observability';

// ---- Types ----

interface ManagedAgent {
  process: ChildProcess;
  agentId: string;
  configVersionId: number;
  intentionallyStopped: boolean;
}

interface RetryState {
  retryCount: number;
  retryTimestamps: number[];
  restartTimer?: ReturnType<typeof setTimeout>;
}

// ---- Constants ----

const BACKOFF_BASE_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const MAX_RETRIES_IN_WINDOW = 5;
const RETRY_WINDOW_MS = 30 * 60_000; // 30 minutes

// ---- Agent Manager ----

export class AgentManager {
  private agents = new Map<string, ManagedAgent>();
  private retryStates = new Map<string, RetryState>();
  private db: Database.Database;
  private dbPath: string;
  private workerPath: string;

  constructor(db: Database.Database, dbPath: string, workerPath?: string) {
    this.db = db;
    this.dbPath = dbPath;
    // Default worker path — resolved relative to this file
    this.workerPath = workerPath ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'worker.ts');
  }

  /**
   * Spawn an agent as a child process.
   */
  spawn(agentId: string): void {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already running`);
    }

    const agent = getAgent(this.db, agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    if (!agent.config_version_id) throw new Error(`Agent ${agentId} has no config version`);

    const configVersionId = agent.config_version_id;

    const child = fork(this.workerPath, [], {
      env: {
        ...process.env,
        AGENT_ID: agentId,
        CONFIG_VERSION_ID: String(configVersionId),
        DATABASE_PATH: this.dbPath,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const managed: ManagedAgent = {
      process: child,
      agentId,
      configVersionId,
      intentionallyStopped: false,
    };

    this.agents.set(agentId, managed);

    // Update DB status
    updateAgentStatus(this.db, agentId, 'running', child.pid ?? undefined);
    insertEvent(this.db, agentId, 'loop_start', undefined, JSON.stringify({
      message: 'Agent process spawned',
      pid: child.pid,
    }));

    // Monitor exit
    child.on('exit', (code, signal) => {
      this.handleExit(agentId, code, signal);
    });

    child.on('error', (err) => {
      insertEvent(this.db, agentId, 'error', undefined, JSON.stringify({
        message: 'Child process error',
        error: err.message,
      }));
    });
  }

  /**
   * Stop an agent gracefully (SIGTERM).
   */
  stop(agentId: string): void {
    // Clear any pending restart timer
    const retryState = this.retryStates.get(agentId);
    if (retryState?.restartTimer) {
      clearTimeout(retryState.restartTimer);
    }
    this.retryStates.delete(agentId);

    const managed = this.agents.get(agentId);
    if (!managed) {
      // Agent not running in this manager; just update DB
      updateAgentStatus(this.db, agentId, 'stopped');
      return;
    }

    // Mark as intentionally stopped to prevent auto-restart
    managed.intentionallyStopped = true;

    managed.process.kill('SIGTERM');
    this.agents.delete(agentId);
    updateAgentStatus(this.db, agentId, 'stopped');

    insertEvent(this.db, agentId, 'loop_end', undefined, JSON.stringify({
      message: 'Agent stopped by manager',
    }));
  }

  /**
   * Restart an agent (stop + spawn).
   */
  restart(agentId: string): void {
    // Clear retry state
    const retryState = this.retryStates.get(agentId);
    if (retryState?.restartTimer) {
      clearTimeout(retryState.restartTimer);
    }
    this.retryStates.delete(agentId);

    const managed = this.agents.get(agentId);
    if (managed) {
      managed.intentionallyStopped = true;
      managed.process.kill('SIGTERM');
      this.agents.delete(agentId);
    }

    // Reset agent status before re-spawn
    updateAgentStatus(this.db, agentId, 'stopped');

    // Spawn fresh
    this.spawn(agentId);
  }

  /**
   * Get agent status.
   */
  status(agentId: string): 'running' | 'stopped' | 'failed' {
    const managed = this.agents.get(agentId);
    if (managed) return 'running';

    const agent = getAgent(this.db, agentId);
    if (!agent) return 'stopped';
    return agent.status;
  }

  /**
   * Get list of currently running agent IDs.
   */
  getRunningAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Re-spawn agents that were marked as 'running' in the DB (server restart recovery).
   */
  recoverRunningAgents(): void {
    const allAgents = listAgents(this.db);
    for (const agent of allAgents) {
      if (agent.status === 'running' && !this.agents.has(agent.agent_id)) {
        try {
          // Reset status first, then spawn
          updateAgentStatus(this.db, agent.agent_id, 'stopped');
          this.spawn(agent.agent_id);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          insertEvent(this.db, agent.agent_id, 'error', undefined, JSON.stringify({
            message: 'Failed to recover agent',
            error: errorMsg,
          }));
          updateAgentStatus(this.db, agent.agent_id, 'failed');
        }
      }
    }
  }

  /**
   * Stop all running agents.
   */
  stopAll(): void {
    for (const agentId of this.agents.keys()) {
      this.stop(agentId);
    }
  }

  // ---- Private ----

  private getOrCreateRetryState(agentId: string): RetryState {
    let state = this.retryStates.get(agentId);
    if (!state) {
      state = { retryCount: 0, retryTimestamps: [] };
      this.retryStates.set(agentId, state);
    }
    return state;
  }

  private handleExit(agentId: string, code: number | null, signal: string | null): void {
    const managed = this.agents.get(agentId);
    if (!managed) return; // Already cleaned up (intentional stop)

    this.agents.delete(agentId);

    // If intentionally stopped, don't auto-restart
    if (managed.intentionallyStopped) return;

    insertEvent(this.db, agentId, 'error', undefined, JSON.stringify({
      message: 'Agent process exited',
      code,
      signal,
    }));

    // Get/create persistent retry state
    const retryState = this.getOrCreateRetryState(agentId);
    const now = Date.now();
    retryState.retryTimestamps.push(now);

    // Filter to retries within the window
    retryState.retryTimestamps = retryState.retryTimestamps.filter(t => now - t < RETRY_WINDOW_MS);

    if (retryState.retryTimestamps.length > MAX_RETRIES_IN_WINDOW) {
      // Too many retries — mark as failed
      updateAgentStatus(this.db, agentId, 'failed');
      insertEvent(this.db, agentId, 'error', undefined, JSON.stringify({
        message: `Agent marked as failed after ${MAX_RETRIES_IN_WINDOW} retries in ${RETRY_WINDOW_MS / 60_000} minutes`,
      }));
      this.retryStates.delete(agentId);
      return;
    }

    // Calculate backoff: 1s, 2s, 4s, 8s
    const backoff = Math.min(BACKOFF_BASE_MS * Math.pow(2, retryState.retryCount), MAX_BACKOFF_MS);
    retryState.retryCount++;

    updateAgentStatus(this.db, agentId, 'stopped');
    insertEvent(this.db, agentId, 'loop_start', undefined, JSON.stringify({
      message: `Scheduling restart in ${backoff}ms (retry ${retryState.retryCount})`,
    }));

    retryState.restartTimer = setTimeout(() => {
      try {
        this.spawn(agentId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        insertEvent(this.db, agentId, 'error', undefined, JSON.stringify({
          message: 'Failed to restart agent',
          error: errorMsg,
        }));
        updateAgentStatus(this.db, agentId, 'failed');
        this.retryStates.delete(agentId);
      }
    }, backoff);
  }
}
