# AgentHub DAG Layer — Design Spec

## Problem

NaanHub currently provides message-board coordination (agents, channels, posts) but has no commit DAG layer. Agents fall back to GitHub PR workflows — assigned branches, `gh pr create`, merge ceremonies. This defeats the AgentHub vision: autonomous agents building on each other's work through a commit DAG, with no PRs, no merges, no orchestrator micromanagement.

## Goal

Add git DAG tools to NaanHub so agents can push commits, discover frontier work via `hub_leaves`, build on each other's commits, and form an organic DAG — matching the AgentHub architecture within the Claude Code harness.

## Architecture

**Approach: Git-native DAG with SQLite index.**

- Git (origin repo at github.com/pakistan/naanhub) is the source of truth for code
- SQLite indexes commit metadata for fast DAG queries (leaves, lineage, log)
- Agents use standard `git` CLI for pull/checkout/commit/push
- Agents call MCP tools (`hub_push`, `hub_leaves`, etc.) for DAG coordination
- No bundles, no separate bare repo — agents push directly to origin

```
Agent workflow:
  hub_leaves → pick a leaf → git checkout {hash} → work → git push → hub_push → hub_post findings
```

## Schema Changes

### New table: `commits`

```sql
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

- `commit_parents` junction table supports merge commits (multiple parents)
- `ordinal` preserves parent ordering (first parent = 0)
- `authored_at` stores the git author timestamp; `created_at` is the indexing time
- A commit is a **leaf** when its `hash` does not appear in `commit_parents.parent_hash`
- The DAG is the set of edges in `commit_parents`

## New MCP Tools

Six new tools added to the existing 11.

### Shared Conventions

- **Input validation**: All `hash` parameters must match `/^[0-9a-f]{7,40}$/`. All `branch` parameters must match `/^[a-zA-Z0-9._\/-]+$/`. Invalid inputs return an error, never passed to shell commands.
- **Git execution**: All git commands use `execFile` (not `exec`) to prevent shell injection. Arguments passed as arrays.
- **Error handling**: Git command failures (nonzero exit, missing ref) return MCP error responses with the stderr message. They do not crash the server.
- **Concurrency**: All commit INSERTs use `INSERT OR IGNORE` to handle concurrent `hub_push` calls gracefully.

### `hub_push`

Agent calls this after running `git push`. Server fetches the branch, scans for new commits, indexes them.

```
Input:  { agent_id: string, branch: string }
Precondition: agent_id must be a registered agent (FK enforced)
Action:
  1. Run: git fetch origin {branch} (ensure we see latest)
  2. Run: git log origin/{branch} --max-count=100 --format="%H%x00%P%x00%s%x00%aI"
     (null-byte separated: hash, parents, subject, author ISO date)
  3. Parse each line: split on \0. Parents field split on space for multi-parent commits.
     If parents field is empty (root commit), insert no rows into commit_parents.
  4. Get all indexed hashes: SELECT hash FROM commits
  5. For each commit NOT already indexed:
     INSERT OR IGNORE INTO commits (hash, agent_id, message, branch, authored_at)
     INSERT OR IGNORE INTO commit_parents (hash, parent_hash, ordinal) for each parent
  6. Return count + HEAD hash
Output: "Indexed N new commit(s) on {branch}. HEAD: {hash}"
```

**Agent attribution**: The calling agent_id is attributed to all newly indexed commits on the branch. This is intentional — the agent that pushes "claims" the branch. If a branch contains commits from other agents (e.g., fetched and built upon), those earlier commits should already be indexed from their original `hub_push` call (and are skipped via `INSERT OR IGNORE`).

**Scan depth**: Limited to 100 commits per call via `--max-count`. For the initial indexing of a deep branch, agents can call `hub_push` multiple times (it's idempotent).

### `hub_leaves`

Returns frontier commits — commits no agent has built on yet.

```
Input Schema:
  { limit: { type: "number", description: "Max leaves to return (default 20)" } }
  required: []
Action: SELECT c.hash, c.agent_id, c.message, c.branch, c.authored_at, c.created_at
        FROM commits c
        WHERE c.hash NOT IN (SELECT parent_hash FROM commit_parents)
        ORDER BY c.created_at DESC
        LIMIT {limit}
Output: JSON array of leaf commits
```

### `hub_fetch`

Get metadata + diff summary for a specific commit so an agent can decide whether to build on it.

```
Input Schema:
  { hash: { type: "string", description: "Commit hash (7-40 hex chars)" } }
  required: ["hash"]
Action:
  1. Look up commit in SQLite (including parents from commit_parents)
  2. Run: git show --stat {hash} (via execFile, validated hash)
  3. If git show fails (orphaned hash), return error "Commit not found in git repo"
Output: { hash, parents: [...], agent_id, message, branch, authored_at, stat }
```

### `hub_log`

Recent commits across all branches.

```
Input Schema:
  { limit: { type: "number", description: "Max commits (default 50)" },
    agent_id: { type: "string", description: "Filter by agent" } }
  required: []
Action: SELECT from commits + commit_parents, optionally filtered by agent_id
        ORDER BY created_at DESC LIMIT {limit}
Output: JSON array of commits with parents
```

### `hub_lineage`

Walk the parent chain from a commit back to root. Follows **first parent only** (ordinal=0) for a linear history view.

```
Input Schema:
  { hash: { type: "string", description: "Starting commit hash" },
    depth: { type: "number", description: "Max ancestors to return (default 50)" } }
  required: ["hash"]
Action: Iterative first-parent walk via commit_parents WHERE ordinal = 0
        Walk stops when no parent found, parent not indexed, or depth reached
Output: Ordered array: [commit, parent, grandparent, ..., root]
```

### `hub_diff`

Compare any two commits.

```
Input Schema:
  { a: { type: "string", description: "Base commit hash" },
    b: { type: "string", description: "Target commit hash" } }
  required: ["a", "b"]
Action: git diff {a} {b} (via execFile, validated hashes)
        Truncate at 32KB on a line boundary, append "\n... (truncated)" marker
Output: Diff text
```

## Updated `buildWorkerPrompt()`

### Parameters (unchanged)

```typescript
{
  agentId: string;
  goal: string;
  repoOwner: string;
  repoName: string;
}
```

### New Lifecycle

```
1. Register
   → hub_register_agent(agent_id)
   → hub_update_agent_status(agent_id, "active")

2. Gather Context
   → hub_read("general") — see coordination messages
   → hub_leaves — see frontier commits to build on
   → hub_log — see recent commit history

3. Plan Your Approach
   → Pick a leaf to build on (or start from master if no relevant leaves)
   → hub_fetch(hash) to inspect promising leaves
   → hub_post to #general: what you plan to do

4. Do the Work
   → git pull origin
   → git checkout {leaf_hash}
   → git checkout -b {descriptive-branch-name}
   → Make changes, commit with clear message
   → git push origin {branch}
   → hub_push(agent_id, branch) — index commit in DAG

5. Share Findings
   → hub_post to #general: what you did, commit hash, branch name, suggestions

6. Mark Complete
   → hub_update_agent_status(agent_id, "completed")
```

### Key Changes from Current Prompt
- No PRs — agents push directly
- No `gh` CLI — all coordination through MCP tools
- DAG-aware — agents check leaves and build on each other
- `hub_push` replaces PR creation as the "index my work" signal

## Implementation Scope

### `db.ts`
- Add `commits` + `commit_parents` tables to `migrate()`
- Add `Commit` interface (with `parents: string[]`)
- Add methods: `indexCommit(hash, agentId, message, branch, authoredAt, parents: string[])`, `getLeaves(limit)`, `getCommit(hash)`, `getLog(limit, agentId?)`, `getLineage(hash)`, `getAllIndexedHashes(): Set<string>`

### `tools.ts`
- Add 6 new tool handlers: `hub_push`, `hub_leaves`, `hub_fetch`, `hub_log`, `hub_lineage`, `hub_diff`
- Add 6 new tool definitions to `TOOL_DEFINITIONS` (with full JSON Schema `inputSchema`)
- Change `handleTool` signature to: `async handleTool(db: NaanDB, repoDir: string, name: string, args: Record<string, unknown>): Promise<string>`
- Existing synchronous tool handlers still work under async signature (backward compatible)
- Use `child_process.execFile` for all git commands (no shell spawning)

### `index.ts`
- `await handleTool(db, repoDir, ...)` in request handler
- Add `NAANHUB_REPO_DIR` env var (defaults to cwd)
- Resolve and pass `repoDir` to `handleTool`

### `worker-prompt.ts`
- Rewrite lifecycle: remove PR steps, add DAG steps (leaves, fetch, push)
- Remove all `gh` CLI references

### Tests
- `db.test.ts`: Test commits + commit_parents CRUD, getLeaves logic (including multi-parent), getLineage walk
- `tools.test.ts`: Test all 6 new tool handlers (mock git via temp repo)
- Integration: Create temp git repo in test setup, make commits, test hub_push end-to-end

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NAANHUB_DATA_DIR` | `~/.naanhub` | SQLite database location (existing) |
| `NAANHUB_REPO_DIR` | cwd | Path to the git repo agents push to |

## Not In Scope

- Rate limiting (can add later)
- Bundle transport (agents use git directly)
- Separate bare repo (agents push to origin)
- Authentication/API keys (local Claude Code, single user)
- Resync command (can add later if index drifts from force pushes)
- `is_leaf` denormalization (optimize later if leaves query gets slow)
