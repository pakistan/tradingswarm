# AgentHub DAG Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add git commit DAG tools to NaanHub MCP server so agents can push commits, discover frontier work, and build on each other — replacing the PR-based workflow.

**Architecture:** Git-native DAG with SQLite index. Git (origin) is source of truth for code. SQLite indexes commit metadata for fast DAG queries (leaves, lineage, log). Agents use standard git CLI + MCP tools for coordination.

**Tech Stack:** TypeScript, better-sqlite3, @modelcontextprotocol/sdk, child_process.execFile, vitest

**Spec:** `docs/superpowers/specs/2026-03-13-agenthub-dag-layer-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/db.ts` | Modify | Add `commits` + `commit_parents` tables, `Commit` interface, 6 new DB methods |
| `src/db.test.ts` | Modify | Add tests for all new DB methods |
| `src/git.ts` | Create | Git command execution helper (`execFile` wrapper, input validation) |
| `src/git.test.ts` | Create | Tests for git helpers (using temp repos) |
| `src/tools.ts` | Modify | Add 6 new tool handlers, change signature to async with `repoDir` |
| `src/tools.test.ts` | Modify | Update existing tests for new signature, add tests for new tools |
| `src/index.ts` | Modify | Add `NAANHUB_REPO_DIR`, await `handleTool` |
| `src/worker-prompt.ts` | Modify | Rewrite lifecycle to DAG-native |

---

## Chunk 1: Database Layer

### Task 1: Add Commit interface and commits schema

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

- [ ] **Step 1: Write failing test for indexCommit**

In `src/db.test.ts`, add at the bottom:

```typescript
describe('commits', () => {
  it('indexes a commit and retrieves it', () => {
    db.registerAgent('worker-1');
    db.indexCommit('abc123', 'worker-1', 'initial commit', 'main', '2026-03-13T00:00:00Z', []);
    const commit = db.getCommit('abc123');
    expect(commit).toBeDefined();
    expect(commit!.hash).toBe('abc123');
    expect(commit!.agent_id).toBe('worker-1');
    expect(commit!.message).toBe('initial commit');
    expect(commit!.branch).toBe('main');
    expect(commit!.authored_at).toBe('2026-03-13T00:00:00Z');
    expect(commit!.parents).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `db.indexCommit is not a function`

- [ ] **Step 3: Add Commit interface and schema to db.ts**

In `src/db.ts`, add the `Commit` interface after the `Post` interface:

```typescript
export interface Commit {
  hash: string;
  agent_id: string;
  message: string;
  branch: string;
  authored_at: string | null;
  created_at: string;
  parents: string[];
}
```

In the `migrate()` method, add after the posts index creation:

```typescript

      CREATE TABLE IF NOT EXISTS commits (
        hash TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id),
        message TEXT NOT NULL,
        branch TEXT NOT NULL,
        authored_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commit_parents (
        hash TEXT NOT NULL REFERENCES commits(hash),
        parent_hash TEXT NOT NULL,
        ordinal INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (hash, parent_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_commit_parents_parent ON commit_parents(parent_hash);
      CREATE INDEX IF NOT EXISTS idx_commits_agent ON commits(agent_id);
      CREATE INDEX IF NOT EXISTS idx_commits_branch ON commits(branch);
```

Add the `indexCommit` and `getCommit` methods after the Posts section:

```typescript
  // --- Commits ---

  indexCommit(hash: string, agentId: string, message: string, branch: string, authoredAt: string | null, parents: string[]): void {
    this.db.prepare(
      'INSERT OR IGNORE INTO commits (hash, agent_id, message, branch, authored_at) VALUES (?, ?, ?, ?, ?)'
    ).run(hash, agentId, message, branch, authoredAt);

    const insertParent = this.db.prepare(
      'INSERT OR IGNORE INTO commit_parents (hash, parent_hash, ordinal) VALUES (?, ?, ?)'
    );
    for (let i = 0; i < parents.length; i++) {
      insertParent.run(hash, parents[i], i);
    }
  }

  getCommit(hash: string): Commit | undefined {
    const row = this.db.prepare(
      'SELECT hash, agent_id, message, branch, authored_at, created_at FROM commits WHERE hash = ?'
    ).get(hash) as Omit<Commit, 'parents'> | undefined;
    if (!row) return undefined;

    const parents = this.db.prepare(
      'SELECT parent_hash FROM commit_parents WHERE hash = ? ORDER BY ordinal'
    ).all(hash) as { parent_hash: string }[];

    return { ...row, parents: parents.map(p => p.parent_hash) };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add commits schema and indexCommit/getCommit methods"
```

---

### Task 2: Add indexCommit with parents and INSERT OR IGNORE

**Files:**
- Modify: `src/db.test.ts`

- [ ] **Step 1: Write failing tests for parent commits and idempotency**

Add to the `commits` describe block in `src/db.test.ts`:

```typescript
  it('indexes a commit with parents', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'second', 'main', null, ['aaa']);
    const commit = db.getCommit('bbb');
    expect(commit!.parents).toEqual(['aaa']);
  });

  it('indexes a merge commit with multiple parents', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'branch-a', null, []);
    db.indexCommit('bbb', 'worker-1', 'second', 'branch-b', null, []);
    db.indexCommit('ccc', 'worker-1', 'merge', 'main', null, ['aaa', 'bbb']);
    const commit = db.getCommit('ccc');
    expect(commit!.parents).toEqual(['aaa', 'bbb']);
  });

  it('is idempotent — duplicate indexCommit is ignored', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    expect(() => db.indexCommit('aaa', 'worker-1', 'first', 'main', null, [])).not.toThrow();
  });

  it('returns undefined for non-existent commit', () => {
    expect(db.getCommit('nonexistent')).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they pass** (implementation already handles this)

Run: `npx vitest run src/db.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/db.test.ts
git commit -m "test: add commit parent and idempotency tests"
```

---

### Task 3: Add getLeaves

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

- [ ] **Step 1: Write failing test for getLeaves**

Add to the `commits` describe block:

```typescript
  it('getLeaves returns commits with no children', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'worker-1', 'another leaf', 'feat', null, ['aaa']);
    const leaves = db.getLeaves(20);
    const hashes = leaves.map(l => l.hash);
    expect(hashes).toContain('bbb');
    expect(hashes).toContain('ccc');
    expect(hashes).not.toContain('aaa');
  });

  it('getLeaves returns empty array when no commits', () => {
    expect(db.getLeaves(20)).toEqual([]);
  });

  it('getLeaves respects limit', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'one', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'two', 'feat', null, []);
    const leaves = db.getLeaves(1);
    expect(leaves).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `db.getLeaves is not a function`

- [ ] **Step 3: Implement getLeaves**

Add to `src/db.ts` in the Commits section:

```typescript
  getLeaves(limit: number = 20): Commit[] {
    const rows = this.db.prepare(
      `SELECT hash, agent_id, message, branch, authored_at, created_at
       FROM commits
       WHERE hash NOT IN (SELECT parent_hash FROM commit_parents)
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit) as Omit<Commit, 'parents'>[];

    return rows.map(row => {
      const parents = this.db.prepare(
        'SELECT parent_hash FROM commit_parents WHERE hash = ? ORDER BY ordinal'
      ).all(row.hash) as { parent_hash: string }[];
      return { ...row, parents: parents.map(p => p.parent_hash) };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add getLeaves for frontier commit discovery"
```

---

### Task 4: Add getLog

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
  it('getLog returns recent commits', () => {
    db.registerAgent('worker-1');
    db.registerAgent('worker-2');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-2', 'second', 'feat', null, ['aaa']);
    const log = db.getLog(50);
    expect(log).toHaveLength(2);
  });

  it('getLog filters by agent_id', () => {
    db.registerAgent('worker-1');
    db.registerAgent('worker-2');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-2', 'second', 'feat', null, ['aaa']);
    const log = db.getLog(50, 'worker-1');
    expect(log).toHaveLength(1);
    expect(log[0].agent_id).toBe('worker-1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `db.getLog is not a function`

- [ ] **Step 3: Implement getLog**

```typescript
  getLog(limit: number = 50, agentId?: string): Commit[] {
    const query = agentId
      ? this.db.prepare(
          `SELECT hash, agent_id, message, branch, authored_at, created_at
           FROM commits WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`
        )
      : this.db.prepare(
          `SELECT hash, agent_id, message, branch, authored_at, created_at
           FROM commits ORDER BY created_at DESC LIMIT ?`
        );

    const rows = (agentId ? query.all(agentId, limit) : query.all(limit)) as Omit<Commit, 'parents'>[];

    return rows.map(row => {
      const parents = this.db.prepare(
        'SELECT parent_hash FROM commit_parents WHERE hash = ? ORDER BY ordinal'
      ).all(row.hash) as { parent_hash: string }[];
      return { ...row, parents: parents.map(p => p.parent_hash) };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add getLog for recent commit history"
```

---

### Task 5: Add getLineage

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
  it('getLineage walks first-parent chain', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'worker-1', 'grandchild', 'main', null, ['bbb']);
    const lineage = db.getLineage('ccc');
    expect(lineage.map(c => c.hash)).toEqual(['ccc', 'bbb', 'aaa']);
  });

  it('getLineage follows first parent on merge commits', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'main', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'branch', 'feat', null, []);
    db.indexCommit('ccc', 'worker-1', 'merge', 'main', null, ['aaa', 'bbb']);
    const lineage = db.getLineage('ccc');
    expect(lineage.map(c => c.hash)).toEqual(['ccc', 'aaa']);
  });

  it('getLineage respects depth limit', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'worker-1', 'grandchild', 'main', null, ['bbb']);
    const lineage = db.getLineage('ccc', 2);
    expect(lineage.map(c => c.hash)).toEqual(['ccc', 'bbb']);
  });

  it('getLineage returns empty for unknown hash', () => {
    expect(db.getLineage('nonexistent')).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `db.getLineage is not a function`

- [ ] **Step 3: Implement getLineage**

```typescript
  getLineage(hash: string, depth: number = 50): Commit[] {
    const result: Commit[] = [];
    let current = hash;

    for (let i = 0; i < depth; i++) {
      const commit = this.getCommit(current);
      if (!commit) break;
      result.push(commit);

      // Follow first parent (ordinal = 0)
      const parent = this.db.prepare(
        'SELECT parent_hash FROM commit_parents WHERE hash = ? AND ordinal = 0'
      ).get(current) as { parent_hash: string } | undefined;

      if (!parent) break;
      current = parent.parent_hash;
    }

    return result;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add getLineage for first-parent chain walk"
```

---

### Task 6: Add getAllIndexedHashes

**Files:**
- Modify: `src/db.ts`
- Modify: `src/db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
  it('getAllIndexedHashes returns set of known hashes', () => {
    db.registerAgent('worker-1');
    db.indexCommit('aaa', 'worker-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'worker-1', 'second', 'main', null, ['aaa']);
    const hashes = db.getAllIndexedHashes();
    expect(hashes).toBeInstanceOf(Set);
    expect(hashes.has('aaa')).toBe(true);
    expect(hashes.has('bbb')).toBe(true);
    expect(hashes.has('ccc')).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — `db.getAllIndexedHashes is not a function`

- [ ] **Step 3: Implement getAllIndexedHashes**

```typescript
  getAllIndexedHashes(): Set<string> {
    const rows = this.db.prepare('SELECT hash FROM commits').all() as { hash: string }[];
    return new Set(rows.map(r => r.hash));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add getAllIndexedHashes for hub_push dedup"
```

---

## Chunk 2: Git Execution Helper

### Task 7: Create git.ts with validation and execFile wrapper

**Files:**
- Create: `src/git.ts`
- Create: `src/git.test.ts`

- [ ] **Step 1: Write failing tests for input validation**

Create `src/git.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateHash, validateBranch } from './git.js';

describe('validateHash', () => {
  it('accepts valid short hash', () => {
    expect(() => validateHash('abc1234')).not.toThrow();
  });

  it('accepts valid full hash', () => {
    expect(() => validateHash('abc123def456abc123def456abc123def456abc1')).not.toThrow();
  });

  it('rejects hash with uppercase', () => {
    expect(() => validateHash('ABC1234')).toThrow('Invalid commit hash');
  });

  it('rejects hash shorter than 7 chars', () => {
    expect(() => validateHash('abc12')).toThrow('Invalid commit hash');
  });

  it('rejects hash with special chars', () => {
    expect(() => validateHash('abc12; rm -rf')).toThrow('Invalid commit hash');
  });
});

describe('validateBranch', () => {
  it('accepts valid branch names', () => {
    expect(() => validateBranch('main')).not.toThrow();
    expect(() => validateBranch('feature/my-branch')).not.toThrow();
    expect(() => validateBranch('worker-1/ad-revenue')).not.toThrow();
  });

  it('rejects branch with spaces', () => {
    expect(() => validateBranch('my branch')).toThrow('Invalid branch name');
  });

  it('rejects branch with semicolons', () => {
    expect(() => validateBranch('main; rm -rf /')).toThrow('Invalid branch name');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/git.test.ts`
Expected: FAIL — cannot find module `./git.js`

- [ ] **Step 3: Implement git.ts**

Create `src/git.ts`:

```typescript
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const HASH_RE = /^[0-9a-f]{7,40}$/;
const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;

export function validateHash(hash: string): void {
  if (!HASH_RE.test(hash)) {
    throw new Error(`Invalid commit hash: "${hash}"`);
  }
}

export function validateBranch(branch: string): void {
  if (!BRANCH_RE.test(branch)) {
    throw new Error(`Invalid branch name: "${branch}"`);
  }
}

export async function gitExec(repoDir: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFile('git', args, {
      cwd: repoDir,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return stdout;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git ${args[0]} failed: ${message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/git.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/git.ts src/git.test.ts
git commit -m "feat: add git execution helper with input validation"
```

---

### Task 8: Test gitExec with a real temp repo

**Files:**
- Modify: `src/git.test.ts`

- [ ] **Step 1: Write test for gitExec**

Add to `src/git.test.ts`:

```typescript
import { validateHash, validateBranch, gitExec } from './git.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('gitExec', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naanhub-git-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs git init successfully', async () => {
    const result = await gitExec(tmpDir, ['init']);
    expect(result).toContain('Initialized');
  });

  it('throws on invalid git command', async () => {
    await expect(gitExec(tmpDir, ['not-a-command'])).rejects.toThrow('git not-a-command failed');
  });
});
```

Also update the import at top to include `beforeEach, afterEach`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/git.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/git.test.ts
git commit -m "test: add gitExec integration test with temp repo"
```

---

## Chunk 3: Tool Handlers — Signature Update + New Tools

### Task 9: Update handleTool signature to async with repoDir

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update existing tests to use new signature**

In `src/tools.test.ts`, update imports and the call pattern. Change every `handleTool(db, ...)` to `await handleTool(db, '', ...)` (empty string repoDir since existing tools don't use it). Mark the test callbacks as `async`.

Replace the `handleTool` import:
```typescript
import { handleTool } from './tools.js';
```

Change every test to be async and pass repoDir. For example the first test becomes:
```typescript
  it('hub_set_goal sets and returns goal', async () => {
    const result = await handleTool(db, '', 'hub_set_goal', { goal: 'build a thing' });
    expect(result).toContain('build a thing');
  });
```

Apply the same pattern to all 12 existing tests: add `async`, `await`, and insert `''` as the second arg.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `handleTool` still takes 3 params

- [ ] **Step 3: Update handleTool signature**

In `src/tools.ts`, change the function signature:

```typescript
export async function handleTool(db: NaanDB, repoDir: string, name: string, args: Record<string, unknown>): Promise<string> {
```

All existing `case` blocks remain unchanged — they return strings which are valid as resolved promises.

- [ ] **Step 4: Update index.ts**

In `src/index.ts`, add repoDir resolution and await:

After the `db` creation line, add:
```typescript
const repoDir = process.env.NAANHUB_REPO_DIR ?? process.cwd();
```

Change the handler to:
```typescript
    const result = await handleTool(db, repoDir, name, args ?? {});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tools.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools.ts src/tools.test.ts src/index.ts
git commit -m "refactor: make handleTool async with repoDir parameter"
```

---

### Task 10: Add hub_leaves tool handler

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/tools.test.ts`:

```typescript
  it('hub_leaves returns frontier commits', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('aaa', 'w-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'w-1', 'child', 'feat', null, ['aaa']);
    const result = await handleTool(db, '', 'hub_leaves', {});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].hash).toBe('bbb');
  });

  it('hub_leaves returns empty message when no commits', async () => {
    const result = await handleTool(db, '', 'hub_leaves', {});
    expect(result).toContain('No commits');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `Unknown tool: hub_leaves`

- [ ] **Step 3: Implement hub_leaves handler**

Add to the switch in `tools.ts`:

```typescript
    case 'hub_leaves': {
      const limit = (args.limit as number) ?? 20;
      const leaves = db.getLeaves(limit);
      if (leaves.length === 0) return 'No commits indexed yet.';
      return JSON.stringify(leaves, null, 2);
    }
```

Add to `TOOL_DEFINITIONS`:

```typescript
  {
    name: 'hub_leaves',
    description: 'Get frontier commits (leaves) — commits no agent has built on yet. Use this to find work to extend.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max leaves to return (default 20)' }
      }
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add hub_leaves tool for frontier commit discovery"
```

---

### Task 11: Add hub_log tool handler

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
  it('hub_log returns recent commits', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('aaa', 'w-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'w-1', 'second', 'feat', null, ['aaa']);
    const result = await handleTool(db, '', 'hub_log', {});
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
  });

  it('hub_log filters by agent_id', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-2' });
    db.indexCommit('aaa', 'w-1', 'first', 'main', null, []);
    db.indexCommit('bbb', 'w-2', 'second', 'feat', null, []);
    const result = await handleTool(db, '', 'hub_log', { agent_id: 'w-1' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].agent_id).toBe('w-1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `Unknown tool: hub_log`

- [ ] **Step 3: Implement hub_log handler**

Add to switch:
```typescript
    case 'hub_log': {
      const limit = (args.limit as number) ?? 50;
      const agentId = args.agent_id as string | undefined;
      const log = db.getLog(limit, agentId);
      if (log.length === 0) return 'No commits indexed yet.';
      return JSON.stringify(log, null, 2);
    }
```

Add to `TOOL_DEFINITIONS`:
```typescript
  {
    name: 'hub_log',
    description: 'List recent commits across all branches. Optionally filter by agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max commits to return (default 50)' },
        agent_id: { type: 'string', description: 'Filter commits by agent ID' }
      }
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add hub_log tool for commit history"
```

---

### Task 12: Add hub_lineage tool handler

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
  it('hub_lineage returns first-parent chain', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('aaa', 'w-1', 'root', 'main', null, []);
    db.indexCommit('bbb', 'w-1', 'child', 'main', null, ['aaa']);
    db.indexCommit('ccc', 'w-1', 'grandchild', 'main', null, ['bbb']);
    const result = await handleTool(db, '', 'hub_lineage', { hash: 'ccc' });
    const parsed = JSON.parse(result);
    expect(parsed.map((c: any) => c.hash)).toEqual(['ccc', 'bbb', 'aaa']);
  });

  it('hub_lineage rejects invalid hash', async () => {
    const result = await handleTool(db, '', 'hub_lineage', { hash: 'INVALID!' });
    expect(result).toContain('Invalid commit hash');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `Unknown tool: hub_lineage`

- [ ] **Step 3: Implement hub_lineage handler**

Add import at top of `tools.ts`:
```typescript
import { validateHash, validateBranch, gitExec } from './git.js';
```

Add to switch:
```typescript
    case 'hub_lineage': {
      const hash = args.hash as string;
      try { validateHash(hash); } catch (e) { return (e as Error).message; }
      const depth = (args.depth as number) ?? 50;
      const lineage = db.getLineage(hash, depth);
      if (lineage.length === 0) return `Commit ${hash} not found in index.`;
      return JSON.stringify(lineage, null, 2);
    }
```

Add to `TOOL_DEFINITIONS`:
```typescript
  {
    name: 'hub_lineage',
    description: 'Walk the first-parent chain from a commit back to root. Shows linear history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'Starting commit hash (7-40 hex chars)' },
        depth: { type: 'number', description: 'Max ancestors to return (default 50)' }
      },
      required: ['hash']
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add hub_lineage tool for first-parent chain walk"
```

---

### Task 13: Add hub_fetch tool handler

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`

- [ ] **Step 1: Write failing test**

For `hub_fetch`, we need a real git repo since it calls `git show --stat`. Add a test that uses the DB-only path (commit exists in index):

```typescript
  it('hub_fetch returns commit metadata from index', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    db.indexCommit('abc1234', 'w-1', 'test commit', 'main', '2026-01-01T00:00:00Z', []);
    // git show will fail since we have no real repo — but we test that it handles the error
    const result = await handleTool(db, '/tmp/nonexistent-repo', 'hub_fetch', { hash: 'abc1234' });
    // Should contain commit metadata even if git show fails
    expect(result).toContain('abc1234');
    expect(result).toContain('test commit');
  });

  it('hub_fetch rejects invalid hash', async () => {
    const result = await handleTool(db, '', 'hub_fetch', { hash: 'BAD!' });
    expect(result).toContain('Invalid commit hash');
  });

  it('hub_fetch returns not found for unknown hash', async () => {
    const result = await handleTool(db, '', 'hub_fetch', { hash: 'abc1234' });
    expect(result).toContain('not found');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `Unknown tool: hub_fetch`

- [ ] **Step 3: Implement hub_fetch handler**

Add to switch:
```typescript
    case 'hub_fetch': {
      const hash = args.hash as string;
      try { validateHash(hash); } catch (e) { return (e as Error).message; }
      const commit = db.getCommit(hash);
      if (!commit) return `Commit ${hash} not found in index.`;

      let stat = '';
      try {
        stat = await gitExec(repoDir, ['show', '--stat', '--no-patch', hash]);
      } catch {
        stat = '(git show failed — commit may not exist in local repo)';
      }

      return JSON.stringify({ ...commit, stat: stat.trim() }, null, 2);
    }
```

Add to `TOOL_DEFINITIONS`:
```typescript
  {
    name: 'hub_fetch',
    description: 'Get metadata and diff summary for a specific commit. Use to inspect a leaf before building on it.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'Commit hash (7-40 hex chars)' }
      },
      required: ['hash']
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add hub_fetch tool for commit inspection"
```

---

### Task 14: Add hub_diff tool handler

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
  it('hub_diff rejects invalid hashes', async () => {
    const result = await handleTool(db, '', 'hub_diff', { a: 'BAD!', b: 'abc1234' });
    expect(result).toContain('Invalid commit hash');
  });

  it('hub_diff handles missing repo gracefully', async () => {
    const result = await handleTool(db, '/tmp/nonexistent-repo', 'hub_diff', { a: 'abc1234', b: 'def5678' });
    expect(result).toContain('failed');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `Unknown tool: hub_diff`

- [ ] **Step 3: Implement hub_diff handler**

Add to switch:
```typescript
    case 'hub_diff': {
      const a = args.a as string;
      const b = args.b as string;
      try { validateHash(a); } catch (e) { return (e as Error).message; }
      try { validateHash(b); } catch (e) { return (e as Error).message; }

      try {
        let diff = await gitExec(repoDir, ['diff', a, b]);
        const MAX_BYTES = 32 * 1024;
        if (diff.length > MAX_BYTES) {
          const truncated = diff.slice(0, MAX_BYTES);
          const lastNewline = truncated.lastIndexOf('\n');
          diff = truncated.slice(0, lastNewline >= 0 ? lastNewline : MAX_BYTES) + '\n... (truncated)';
        }
        return diff || '(no differences)';
      } catch (err) {
        return `git diff failed: ${(err as Error).message}`;
      }
    }
```

Add to `TOOL_DEFINITIONS`:
```typescript
  {
    name: 'hub_diff',
    description: 'Compare any two commits. Shows the diff between them (truncated at 32KB).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'string', description: 'Base commit hash' },
        b: { type: 'string', description: 'Target commit hash' }
      },
      required: ['a', 'b']
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add hub_diff tool for comparing commits"
```

---

### Task 15: Add hub_push tool handler

**Files:**
- Modify: `src/tools.ts`
- Modify: `src/tools.test.ts`

This is the most complex tool — it shells out to git, parses output, and indexes commits.

- [ ] **Step 1: Write failing tests**

```typescript
  it('hub_push rejects invalid branch name', async () => {
    const result = await handleTool(db, '', 'hub_push', { agent_id: 'w-1', branch: 'bad branch!' });
    expect(result).toContain('Invalid branch name');
  });

  it('hub_push handles missing repo gracefully', async () => {
    await handleTool(db, '', 'hub_register_agent', { agent_id: 'w-1' });
    const result = await handleTool(db, '/tmp/nonexistent-repo', 'hub_push', { agent_id: 'w-1', branch: 'main' });
    expect(result).toContain('failed');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools.test.ts`
Expected: FAIL — `Unknown tool: hub_push`

- [ ] **Step 3: Implement hub_push handler**

Add to switch:
```typescript
    case 'hub_push': {
      const agentId = args.agent_id as string;
      const branch = args.branch as string;
      try { validateBranch(branch); } catch (e) { return (e as Error).message; }

      // Fetch latest from origin
      try {
        await gitExec(repoDir, ['fetch', 'origin', branch]);
      } catch (err) {
        return `git fetch failed: ${(err as Error).message}`;
      }

      // Get commit log with null-byte separators
      let logOutput: string;
      try {
        logOutput = await gitExec(repoDir, [
          'log', `origin/${branch}`, '--max-count=100',
          '--format=%H%x00%P%x00%s%x00%aI'
        ]);
      } catch (err) {
        return `git log failed: ${(err as Error).message}`;
      }

      const indexed = db.getAllIndexedHashes();
      let count = 0;
      let headHash = '';

      const lines = logOutput.trim().split('\n').filter(l => l.length > 0);
      for (const line of lines) {
        const parts = line.split('\0');
        if (parts.length < 4) continue;

        const [hash, parentsStr, message, authoredAt] = parts;
        if (!headHash) headHash = hash;
        if (indexed.has(hash)) continue;

        const parents = parentsStr.trim() === '' ? [] : parentsStr.trim().split(' ');
        db.indexCommit(hash, agentId, message, branch, authoredAt || null, parents);
        count++;
      }

      if (count === 0 && !headHash) {
        return `No commits found on origin/${branch}.`;
      }
      return `Indexed ${count} new commit(s) on ${branch}. HEAD: ${headHash}`;
    }
```

Add to `TOOL_DEFINITIONS`:
```typescript
  {
    name: 'hub_push',
    description: 'Index commits after git push. Call this AFTER pushing your branch to register your work in the DAG.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'Your agent ID' },
        branch: { type: 'string', description: 'Branch name you pushed to' }
      },
      required: ['agent_id', 'branch']
    }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add hub_push tool for indexing commits into DAG"
```

---

## Chunk 4: Worker Prompt Rewrite + Final Wiring

### Task 16: Rewrite buildWorkerPrompt to DAG-native lifecycle

**Files:**
- Modify: `src/worker-prompt.ts`

- [ ] **Step 1: Rewrite the function**

Replace the entire return string in `buildWorkerPrompt`:

```typescript
export function buildWorkerPrompt(params: {
  agentId: string;
  goal: string;
  repoOwner: string;
  repoName: string;
}): string {
  return `You are ${params.agentId}, a WorkerAgent in a swarm collaborating on a shared goal.

## Your Goal
${params.goal}

## Your Repository
Owner: ${params.repoOwner}
Repo: ${params.repoName}

## Your Lifecycle

Follow these steps in order:

### 1. Register
Call hub_register_agent with your agent_id "${params.agentId}".
Call hub_update_agent_status with status "active".

### 2. Gather Context
- Call hub_read on the "general" channel to see what other agents have posted.
- Call hub_leaves to see frontier commits — work that nobody has built on yet.
- Call hub_log to see recent commit history across the swarm.

### 3. Plan Your Approach
Based on the goal and what others have done:
- Pick a leaf commit to build on, or start from master if no relevant leaves exist.
- Call hub_fetch on promising leaves to inspect what they contain.
- Post your plan to the "general" channel: call hub_post with your intended approach.

### 4. Do the Work
- Run: git pull origin
- Check out the leaf you chose: git checkout {leaf_hash}
- Create a descriptive branch: git checkout -b {your-branch-name}
- Make your changes, focusing on your specific angle.
- Commit your work with clear commit messages.
- Push the branch: git push origin {your-branch-name}
- Index your work in the DAG: call hub_push with your agent_id and branch name.

### 5. Share Findings
- Post your results to the "general" channel via hub_post.
- Include: what you tried, what you found, your commit hash, branch name, and suggestions for other agents.

### 6. Mark Complete
Call hub_update_agent_status with status "completed".

## Coordination Rules
- Always check hub_leaves and the message board before starting work.
- Build on existing work when possible — extend leaves rather than starting from scratch.
- Post your plan BEFORE doing work so others can see what you're attempting.
- Be specific in your posts — include commit hashes, branch names, approach descriptions.
- If a leaf looks like a dead end, say so — help other agents avoid wasted effort.
`;
}
```

- [ ] **Step 2: Verify the module still compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/worker-prompt.ts
git commit -m "feat: rewrite worker prompt to DAG-native lifecycle"
```

---

### Task 17: Run full test suite

**Files:** (none modified — verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Clean build, `dist/` generated

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix any remaining issues from full test run"
```

(Skip if no fixes needed.)
