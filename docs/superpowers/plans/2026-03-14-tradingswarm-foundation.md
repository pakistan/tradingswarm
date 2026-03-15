# TradingSwarm Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the TradingSwarm Next.js app, create the unified 22-table database schema, and extract core libraries from the existing polymarket-mcp codebase so all parallel workstreams (UI pages, agent runner) can build against a shared foundation.

**Architecture:** New Next.js 14 app (App Router) in `tradingswarm/` directory at repo root. Core business logic extracted from `polymarket-mcp/src/` into `tradingswarm/src/lib/` as importable modules. Single SQLite database with 22 tables. Existing MCP servers remain untouched — they're prototypes, not migrated.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript 5, Tailwind CSS, better-sqlite3, Vitest

---

## Dependency Graph

```
Plan 1: Foundation (this plan, sequential on main)
  ├── Task 1: Next.js scaffold
  ├── Task 2: Database schema (22 tables)
  ├── Task 3: Database CRUD layer
  ├── Task 4: Core library extraction (order engine, settlement, API client)
  └── Task 5: Shared UI components (layout, nav, design system)

After Plan 1 merges to main, these run in parallel worktrees:
  ├── Plan 2: Agent Runner (worktree)
  ├── Plan 3: UI Pages A — Dashboard, Agents, Admin (worktree)
  ├── Plan 4: UI Pages B — Configs, Config Editor, Channels (worktree)
  └── Plan 5: UI Pages C — Trade Inspector, Tool Log (worktree)
```

---

## File Structure

```
tradingswarm/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── vitest.config.ts
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout with nav
│   │   ├── page.tsx                  # Dashboard (Plan 3)
│   │   ├── agents/page.tsx           # Agents page (Plan 3)
│   │   ├── configs/page.tsx          # Configs page (Plan 4)
│   │   ├── channels/page.tsx         # Channels page (Plan 4)
│   │   ├── tool-log/page.tsx         # Tool log page (Plan 5)
│   │   ├── admin/page.tsx            # Admin page (Plan 3)
│   │   ├── trade/[id]/page.tsx       # Trade inspector (Plan 5)
│   │   └── api/                      # API routes (Plans 2-5)
│   │       ├── agents/route.ts
│   │       ├── configs/route.ts
│   │       ├── channels/route.ts
│   │       ├── trades/route.ts
│   │       ├── tool-log/route.ts
│   │       ├── snapshots/route.ts
│   │       ├── admin/route.ts
│   │       └── events/route.ts       # SSE streaming (Plan 2)
│   ├── components/                   # Shared UI components
│   │   ├── nav.tsx                   # Top navigation bar
│   │   ├── stat-card.tsx             # Stats display card
│   │   ├── status-badge.tsx          # Running/stopped badge
│   │   ├── toggle-switch.tsx         # On/off toggle
│   │   └── agent-badge.tsx           # Colored agent name badge
│   ├── lib/                          # Core business logic
│   │   ├── db/
│   │   │   ├── index.ts              # Database singleton + connection
│   │   │   ├── schema.ts             # 22-table migration
│   │   │   ├── schema.test.ts        # Schema tests
│   │   │   ├── configs.ts            # Config + version CRUD
│   │   │   ├── configs.test.ts
│   │   │   ├── agents.ts             # Agent CRUD
│   │   │   ├── agents.test.ts
│   │   │   ├── trades.ts             # Orders, positions, trade history
│   │   │   ├── trades.test.ts
│   │   │   ├── channels.ts           # Channels + posts CRUD
│   │   │   ├── channels.test.ts
│   │   │   ├── snapshots.ts          # Trade snapshots CRUD
│   │   │   ├── snapshots.test.ts
│   │   │   ├── observability.ts      # Tool log, agent events, daily snapshots
│   │   │   └── observability.test.ts
│   │   ├── trading/
│   │   │   ├── order-engine.ts       # Extracted from polymarket-mcp
│   │   │   ├── order-engine.test.ts  # Copied + adapted tests
│   │   │   ├── settlement.ts         # Extracted from polymarket-mcp
│   │   │   ├── settlement.test.ts
│   │   │   └── types.ts              # Trading types
│   │   ├── platforms/
│   │   │   ├── types.ts              # PlatformPlugin interface
│   │   │   └── polymarket/
│   │   │       ├── api.ts            # Extracted from polymarket-mcp
│   │   │       ├── api.test.ts       # Copied + adapted tests
│   │   │       └── types.ts          # Polymarket-specific types
│   │   └── types.ts                  # Shared types across all modules
│   └── styles/
│       └── globals.css               # Tailwind base + custom styles
```

---

## Chunk 1: Project Scaffold + Database Schema

### Task 1: Next.js Project Scaffold

**Files:**
- Create: `tradingswarm/package.json`
- Create: `tradingswarm/tsconfig.json`
- Create: `tradingswarm/next.config.ts`
- Create: `tradingswarm/tailwind.config.ts`
- Create: `tradingswarm/vitest.config.ts`
- Create: `tradingswarm/.env.example`
- Create: `tradingswarm/Dockerfile`
- Create: `tradingswarm/docker-compose.yml`
- Create: `tradingswarm/src/styles/globals.css`
- Create: `tradingswarm/src/app/layout.tsx`
- Create: `tradingswarm/src/app/page.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "tradingswarm",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "next lint"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: { DEFAULT: '#7c3aed', light: '#a78bfa', dark: '#6d28d9' },
        teal: { DEFAULT: '#0d9488', light: '#2dd4bf' },
        accent: { DEFAULT: '#ea580c', light: '#fb923c' },
        surface: '#faf9f7',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 6: Create .env.example**

```bash
# Database
DATABASE_PATH=./data/tradingswarm.db

# Model Providers (add your API keys)
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
MOONSHOT_API_KEY=
GOOGLE_AI_API_KEY=
```

- [ ] **Step 7: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Mono:wght@400;700&display=swap');

body {
  background: #faf9f7;
  font-family: 'DM Sans', system-ui, sans-serif;
}
```

- [ ] **Step 8: Create root layout**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'TradingSwarm',
  description: 'Autonomous AI trading agent swarm platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create placeholder home page**

```tsx
// src/app/page.tsx
export default function DashboardPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">TradingSwarm</h1>
      <p className="text-gray-500 mt-2">Dashboard coming soon</p>
    </main>
  );
}
```

- [ ] **Step 10: Create Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
ENV DATABASE_PATH=/app/data/tradingswarm.db
CMD ["npm", "start"]
```

- [ ] **Step 11: Create docker-compose.yml**

```yaml
services:
  tradingswarm:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    env_file:
      - .env
```

- [ ] **Step 12: Create postcss.config.mjs**

```javascript
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
export default config;
```

- [ ] **Step 13: Create .gitignore**

```
node_modules/
.next/
out/
data/
.env
.env.local
*.db
*.db-shm
*.db-wal
```

- [ ] **Step 14: Install dependencies and verify build**

```bash
cd tradingswarm && npm install && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 13: Commit**

```bash
git add tradingswarm/
git commit -m "feat(tradingswarm): scaffold Next.js project with Tailwind, Vitest, Docker"
```

---

### Task 2: Database Schema (22 tables)

**Files:**
- Create: `tradingswarm/src/lib/db/index.ts`
- Create: `tradingswarm/src/lib/db/schema.ts`
- Create: `tradingswarm/src/lib/db/schema.test.ts`

- [ ] **Step 1: Write schema test**

```typescript
// src/lib/db/schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './schema';
import fs from 'fs';
import path from 'path';
import os from 'os';

let db: Database.Database;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `ts-test-${Date.now()}.db`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('schema migration', () => {
  it('creates all 22 tables', () => {
    migrate(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('configs');
    expect(tableNames).toContain('config_versions');
    expect(tableNames).toContain('rules');
    expect(tableNames).toContain('config_version_rules');
    expect(tableNames).toContain('tools');
    expect(tableNames).toContain('tool_capabilities');
    expect(tableNames).toContain('config_version_capabilities');
    expect(tableNames).toContain('model_providers');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('markets');
    expect(tableNames).toContain('outcomes');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('positions');
    expect(tableNames).toContain('trade_history');
    expect(tableNames).toContain('resolutions');
    expect(tableNames).toContain('trade_snapshots');
    expect(tableNames).toContain('channels');
    expect(tableNames).toContain('posts');
    expect(tableNames).toContain('tool_log');
    expect(tableNames).toContain('agent_memory');
    expect(tableNames).toContain('agent_events');
    expect(tableNames).toContain('daily_snapshots');
    expect(tableNames).toHaveLength(22);
  });

  it('is idempotent', () => {
    migrate(db);
    migrate(db); // should not throw
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    expect(tables).toHaveLength(22);
  });

  it('enforces foreign keys', () => {
    migrate(db);
    expect(() => {
      db.prepare("INSERT INTO config_versions (config_id, version_num, model_provider, model_name, prompt_template) VALUES (999, 1, 'test', 'test', 'test')").run();
    }).toThrow();
  });

  it('enforces check constraints on agents', () => {
    migrate(db);
    expect(() => {
      db.prepare("INSERT INTO agents (agent_id, status) VALUES ('test', 'invalid')").run();
    }).toThrow();
  });

  it('has cycle_id columns on tool_log and agent_events', () => {
    migrate(db);
    db.prepare("INSERT INTO agents (agent_id) VALUES ('test-agent')").run();
    db.prepare("INSERT INTO tool_log (agent_id, tool_name, platform, cycle_id) VALUES ('test-agent', 'pm_markets', 'polymarket', 'cycle-123')").run();
    db.prepare("INSERT INTO agent_events (agent_id, event_type, cycle_id) VALUES ('test-agent', 'loop_start', 'cycle-123')").run();
    const log = db.prepare("SELECT cycle_id FROM tool_log WHERE cycle_id = 'cycle-123'").get() as { cycle_id: string };
    expect(log.cycle_id).toBe('cycle-123');
    const event = db.prepare("SELECT cycle_id FROM agent_events WHERE cycle_id = 'cycle-123'").get() as { cycle_id: string };
    expect(event.cycle_id).toBe('cycle-123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tradingswarm && npx vitest run src/lib/db/schema.test.ts
```
Expected: FAIL — `migrate` not found.

- [ ] **Step 3: Write schema migration**

```typescript
// src/lib/db/schema.ts
import type Database from 'better-sqlite3';

export function migrate(db: Database.Database): void {
  db.exec(`
    -- Configuration
    CREATE TABLE IF NOT EXISTS configs (
      config_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      description   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config_versions (
      version_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id     INTEGER NOT NULL REFERENCES configs(config_id),
      version_num   INTEGER NOT NULL,
      model_provider TEXT NOT NULL,
      model_name    TEXT NOT NULL,
      bankroll      REAL NOT NULL DEFAULT 10000.0,
      prompt_template TEXT NOT NULL,
      mechanics_file TEXT,
      schedule_interval TEXT DEFAULT '1h'
        CHECK (schedule_interval IN ('5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '24h')),
      diff_summary  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(config_id, version_num)
    );

    CREATE TABLE IF NOT EXISTS rules (
      rule_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      description   TEXT,
      prompt_text   TEXT NOT NULL,
      category      TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config_version_rules (
      version_id    INTEGER NOT NULL REFERENCES config_versions(version_id),
      rule_id       INTEGER NOT NULL REFERENCES rules(rule_id),
      enabled       INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (version_id, rule_id)
    );

    CREATE TABLE IF NOT EXISTS tools (
      tool_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      description   TEXT,
      platform      TEXT NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tool_capabilities (
      capability_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id       INTEGER NOT NULL REFERENCES tools(tool_id),
      name          TEXT NOT NULL,
      description   TEXT,
      handler       TEXT NOT NULL,
      UNIQUE(tool_id, name)
    );

    CREATE TABLE IF NOT EXISTS config_version_capabilities (
      version_id      INTEGER NOT NULL REFERENCES config_versions(version_id),
      capability_id   INTEGER NOT NULL REFERENCES tool_capabilities(capability_id),
      enabled         INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (version_id, capability_id)
    );

    CREATE TABLE IF NOT EXISTS model_providers (
      provider_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      api_base      TEXT,
      api_key       TEXT,
      default_model TEXT,
      enabled       INTEGER NOT NULL DEFAULT 1
    );

    -- Agents
    CREATE TABLE IF NOT EXISTS agents (
      agent_id          TEXT PRIMARY KEY,
      display_name      TEXT,
      config_version_id INTEGER REFERENCES config_versions(version_id),
      initial_balance   REAL NOT NULL DEFAULT 10000.0,
      current_cash      REAL NOT NULL DEFAULT 10000.0,
      status            TEXT NOT NULL DEFAULT 'stopped'
                        CHECK (status IN ('running', 'stopped', 'failed')),
      pid               INTEGER,
      last_run_at       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Trading
    CREATE TABLE IF NOT EXISTS markets (
      market_id     TEXT PRIMARY KEY,
      platform      TEXT NOT NULL DEFAULT 'polymarket',
      question      TEXT NOT NULL,
      category      TEXT,
      description   TEXT,
      resolution_source TEXT,
      volume        REAL,
      end_date      TEXT,
      active        INTEGER DEFAULT 1,
      raw_json      TEXT,
      last_synced   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outcomes (
      outcome_id    TEXT PRIMARY KEY,
      market_id     TEXT NOT NULL REFERENCES markets(market_id),
      name          TEXT NOT NULL,
      current_price REAL,
      last_synced   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trade_snapshots (
      snapshot_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      outcome_id    TEXT NOT NULL,
      agent_context TEXT NOT NULL,
      market_snapshot TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT NOT NULL REFERENCES agents(agent_id),
      outcome_id        TEXT NOT NULL,
      side              TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      order_type        TEXT NOT NULL CHECK (order_type IN ('market', 'limit')),
      requested_amount  REAL,
      requested_shares  REAL,
      limit_price       REAL,
      filled_amount     REAL DEFAULT 0,
      filled_shares     REAL DEFAULT 0,
      avg_fill_price    REAL,
      slippage          REAL,
      escrowed_entry_price REAL,
      snapshot_id       INTEGER REFERENCES trade_snapshots(snapshot_id),
      status            TEXT NOT NULL CHECK (status IN ('filled', 'partial', 'pending', 'cancelled')),
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      filled_at         TEXT
    );

    CREATE TABLE IF NOT EXISTS positions (
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      outcome_id    TEXT NOT NULL,
      shares        REAL NOT NULL DEFAULT 0,
      avg_entry_price REAL NOT NULL,
      current_price REAL,
      unrealized_pnl REAL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, outcome_id)
    );

    CREATE TABLE IF NOT EXISTS trade_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      outcome_id    TEXT NOT NULL,
      market_question TEXT NOT NULL,
      outcome_name  TEXT NOT NULL,
      entry_price   REAL NOT NULL,
      exit_price    REAL NOT NULL,
      shares        REAL NOT NULL,
      realized_pnl  REAL NOT NULL,
      reason        TEXT NOT NULL CHECK (reason IN ('sold', 'resolved_win', 'resolved_loss')),
      snapshot_id   INTEGER REFERENCES trade_snapshots(snapshot_id),
      opened_at     TEXT NOT NULL,
      closed_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resolutions (
      outcome_id    TEXT PRIMARY KEY,
      resolved_value REAL NOT NULL,
      resolved_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Coordination
    CREATE TABLE IF NOT EXISTS channels (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      description   TEXT,
      created_by    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id    INTEGER NOT NULL REFERENCES channels(id),
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      content       TEXT NOT NULL,
      parent_id     INTEGER REFERENCES posts(id),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Observability
    CREATE TABLE IF NOT EXISTS tool_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      tool_name     TEXT NOT NULL,
      platform      TEXT NOT NULL,
      cycle_id      TEXT,
      input_json    TEXT,
      output_json   TEXT,
      duration_ms   INTEGER,
      error         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_memory (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      topic         TEXT NOT NULL,
      content       TEXT NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, topic)
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      event_type    TEXT NOT NULL CHECK (event_type IN (
        'thinking', 'tool_call', 'tool_result', 'trade',
        'error', 'memory_update', 'channel_post', 'loop_start', 'loop_end'
      )),
      cycle_id      TEXT,
      data_json     TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      date          TEXT NOT NULL,
      cash          REAL NOT NULL,
      positions_value REAL NOT NULL,
      realized_pnl_cumulative REAL NOT NULL,
      unrealized_pnl REAL NOT NULL,
      total_portfolio_value REAL NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, date)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_config_versions_config ON config_versions(config_id);
    CREATE INDEX IF NOT EXISTS idx_agents_config_version ON agents(config_version_id);
    CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(agent_id);
    CREATE INDEX IF NOT EXISTS idx_orders_outcome ON orders(outcome_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_positions_agent ON positions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_trade_history_agent ON trade_history(agent_id);
    CREATE INDEX IF NOT EXISTS idx_trade_history_snapshot ON trade_history(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_outcomes_market ON outcomes(market_id);
    CREATE INDEX IF NOT EXISTS idx_tool_log_agent ON tool_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_tool_log_created ON tool_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_log_cycle ON tool_log(cycle_id);
    CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_events_created ON agent_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(agent_id, event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel_id);
  `);
}
```

- [ ] **Step 4: Write database connection singleton**

```typescript
// src/lib/db/index.ts
import Database from 'better-sqlite3';
import { migrate } from './schema';
import path from 'path';
import fs from 'fs';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'tradingswarm.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export { migrate };
```

- [ ] **Step 5: Run tests**

```bash
cd tradingswarm && npx vitest run src/lib/db/schema.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tradingswarm/src/lib/db/
git commit -m "feat(tradingswarm): add 22-table database schema with migration"
```

---

### Task 3: Database CRUD Layer

**Files:**
- Create: `tradingswarm/src/lib/db/configs.ts` + test
- Create: `tradingswarm/src/lib/db/agents.ts` + test
- Create: `tradingswarm/src/lib/db/trades.ts` + test
- Create: `tradingswarm/src/lib/db/channels.ts` + test
- Create: `tradingswarm/src/lib/db/snapshots.ts` + test
- Create: `tradingswarm/src/lib/db/observability.ts` + test
- Create: `tradingswarm/src/lib/types.ts`

This task creates CRUD methods for all 22 tables, organized by domain. Each file follows the pattern from `polymarket-mcp/src/db.ts`: parameterized queries, typed returns, transaction support.

Due to the size of this task (6 CRUD files + 6 test files + shared types), the implementation details are specified in each sub-file below. Each sub-file should be implemented TDD-style: write test, verify fail, implement, verify pass, commit.

- [ ] **Step 1: Create shared types**

```typescript
// src/lib/types.ts
// Row types for all 22 tables — see spec for column definitions.
// Export interfaces: ConfigRow, ConfigVersionRow, RuleRow, ToolRow,
// ToolCapabilityRow, ModelProviderRow, AgentRow, MarketRow, OutcomeRow,
// OrderRow, PositionRow, TradeHistoryRow, ResolutionRow, TradeSnapshotRow,
// ChannelRow, PostRow, ToolLogRow, AgentMemoryRow, AgentEventRow,
// DailySnapshotRow, ConfigVersionRuleRow, ConfigVersionCapabilityRow
```

Each interface maps directly to the table DDL in schema.ts. Fields use the same names and types (TEXT → string, INTEGER → number, REAL → number, nullable columns → `| null`).

- [ ] **Step 2: Implement configs.ts with tests**

CRUD for: configs, config_versions, config_version_rules, config_version_capabilities.

Key methods:
- `createConfig(name, description)` → ConfigRow
- `getConfig(configId)` → ConfigRow | undefined
- `listConfigs()` → ConfigRow[]
- `createVersion(configId, data)` → ConfigVersionRow (auto-increments version_num)
- `getVersion(versionId)` → ConfigVersionRow | undefined
- `getLatestVersion(configId)` → ConfigVersionRow | undefined
- `listVersions(configId)` → ConfigVersionRow[]
- `setVersionRules(versionId, rules: {ruleId, enabled}[])` → void
- `setVersionCapabilities(versionId, caps: {capabilityId, enabled}[])` → void
- `getVersionRules(versionId)` → (RuleRow & {enabled})[]
- `getVersionCapabilities(versionId)` → (ToolCapabilityRow & {enabled})[]

Tests: create config, create versions, version numbering, rules/capabilities toggling.

- [ ] **Step 3: Implement agents.ts with tests**

CRUD for: agents.

Key methods:
- `createAgent(agentId, displayName, configVersionId)` → AgentRow
- `getAgent(agentId)` → AgentRow | undefined
- `listAgents()` → AgentRow[]
- `updateAgentStatus(agentId, status, pid?)` → void
- `updateAgentCash(agentId, delta)` → void (throws on insufficient)
- `getAgentsByConfigVersion(versionId)` → AgentRow[]

Tests: create, get, list, status updates, cash management.

- [ ] **Step 4: Implement trades.ts with tests**

CRUD for: markets, outcomes, orders, positions, trade_history, resolutions.

Reuses patterns from `polymarket-mcp/src/db.ts` methods: upsertMarket, upsertOutcome, insertOrder, getPendingOrders, updateOrderFill, cancelOrder, upsertPosition, getPosition, getPositions, recordTrade, getTradeHistory, insertResolution, getLeaderboard.

Tests: market cache, order lifecycle, position updates, trade recording, leaderboard.

- [ ] **Step 5: Implement channels.ts with tests**

CRUD for: channels, posts.

Key methods:
- `createChannel(name, description, createdBy?)` → ChannelRow
- `listChannels()` → ChannelRow[]
- `createPost(channelId, agentId, content, parentId?)` → PostRow
- `getPosts(channelId, limit?, offset?)` → PostRow[]
- `getReplies(postId)` → PostRow[]

Tests: create channel, post messages, threaded replies, pagination.

- [ ] **Step 6: Implement snapshots.ts with tests**

CRUD for: trade_snapshots.

Key methods:
- `insertSnapshot(agentId, outcomeId, context, marketSnapshot)` → number (snapshot_id)
- `getSnapshot(snapshotId)` → TradeSnapshotRow | undefined
- `getSnapshotsForAgent(agentId)` → TradeSnapshotRow[]

Tests: insert, get, list by agent.

- [ ] **Step 7: Implement observability.ts with tests**

CRUD for: tool_log, agent_memory, agent_events, daily_snapshots.

Key methods:
- `insertToolLog(agentId, toolName, platform, cycleId, input, output, durationMs, error?)` → number
- `getToolLog(filters: {agentId?, toolName?, limit?})` → ToolLogRow[]
- `upsertMemory(agentId, topic, content)` → void
- `getMemory(agentId)` → AgentMemoryRow[]
- `deleteMemory(agentId, topic?)` → void
- `insertEvent(agentId, eventType, cycleId, data)` → number
- `getEvents(agentId, after?, limit?)` → AgentEventRow[]
- `insertDailySnapshot(agentId, date, data)` → void
- `getDailySnapshots(agentId, days?)` → DailySnapshotRow[]

Tests: tool log insert/query, memory upsert/get/delete, event streaming, daily snapshots.

- [ ] **Step 8: Run all DB tests**

```bash
cd tradingswarm && npx vitest run src/lib/db/
```
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add tradingswarm/src/lib/
git commit -m "feat(tradingswarm): add database CRUD layer for all 22 tables"
```

---

### Task 4: Core Library Extraction

**Files:**
- Create: `tradingswarm/src/lib/trading/order-engine.ts`
- Create: `tradingswarm/src/lib/trading/order-engine.test.ts`
- Create: `tradingswarm/src/lib/trading/settlement.ts`
- Create: `tradingswarm/src/lib/trading/settlement.test.ts`
- Create: `tradingswarm/src/lib/trading/types.ts`
- Create: `tradingswarm/src/lib/platforms/types.ts`
- Create: `tradingswarm/src/lib/platforms/polymarket/api.ts`
- Create: `tradingswarm/src/lib/platforms/polymarket/api.test.ts`
- Create: `tradingswarm/src/lib/platforms/polymarket/types.ts`

Extract pure business logic from `polymarket-mcp/src/` into the new lib structure. These files are mostly copy + adapt (update import paths, use new DB types).

- [ ] **Step 1: Copy and adapt trading types**

Copy `polymarket-mcp/src/types.ts` → `tradingswarm/src/lib/trading/types.ts`. Keep only the trading-related types (OrderBookLevel, OrderBook, FillResult). DB row types are already in `src/lib/types.ts`.

- [ ] **Step 2: Copy and adapt order engine**

Copy `polymarket-mcp/src/order-engine.ts` → `tradingswarm/src/lib/trading/order-engine.ts`. Update imports to reference `./types`. Copy tests similarly. Run tests.

```bash
cd tradingswarm && npx vitest run src/lib/trading/order-engine.test.ts
```
Expected: All tests pass.

- [ ] **Step 3: Copy and adapt settlement**

Copy `polymarket-mcp/src/settlement.ts` → `tradingswarm/src/lib/trading/settlement.ts`. Update imports. This will need adaptation since settlement calls DB methods — import from `@/lib/db/trades` instead of the old PolymarketDB class. The function signature changes from `settleMarket(db: PolymarketDB, detail)` to `settleMarket(db: Database.Database, detail)` using the imported CRUD functions.

- [ ] **Step 3b: Write settlement tests**

Write tests for `settleMarket`: winning resolution pays out shares at $1.00, losing resolution zeros positions, pending orders are cancelled with escrow released, already-resolved outcomes are skipped. Use a temp DB with the full schema migrated.

```bash
cd tradingswarm && npx vitest run src/lib/trading/settlement.test.ts
```
Expected: All settlement tests pass.

- [ ] **Step 4: Copy and adapt Polymarket API client**

Copy `polymarket-mcp/src/polymarket-api.ts` → `tradingswarm/src/lib/platforms/polymarket/api.ts`. Copy types. Copy tests. Update imports.

```bash
cd tradingswarm && npx vitest run src/lib/platforms/polymarket/api.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Create platform plugin interface**

```typescript
// src/lib/platforms/types.ts
// Phase 1 subset — scoped for prediction markets only.
// Will be extended in Plan 2 (Agent Runner) to include tools[], capabilities[],
// and handleTool() per the full spec interface. Phase 2 platforms (Coinbase,
// Binance) will require a redesigned interface for spot/futures markets.
import type { OrderBook } from '@/lib/trading/types';

export interface PlatformPlugin {
  name: string;
  getMarkets(params: { limit?: number; query?: string }): Promise<unknown[]>;
  getOrderBook(outcomeId: string): Promise<OrderBook>;
  getMidpointPrice(outcomeId: string): Promise<number>;
}
```

- [ ] **Step 6: Run all lib tests**

```bash
cd tradingswarm && npx vitest run src/lib/
```
Expected: All tests pass (schema + CRUD + order engine + API client).

- [ ] **Step 7: Commit**

```bash
git add tradingswarm/src/lib/trading/ tradingswarm/src/lib/platforms/
git commit -m "feat(tradingswarm): extract core trading libraries from polymarket-mcp"
```

---

### Task 5: Shared UI Components

**Files:**
- Create: `tradingswarm/src/components/nav.tsx`
- Create: `tradingswarm/src/components/stat-card.tsx`
- Create: `tradingswarm/src/components/status-badge.tsx`
- Create: `tradingswarm/src/components/toggle-switch.tsx`
- Create: `tradingswarm/src/components/agent-badge.tsx`
- Modify: `tradingswarm/src/app/layout.tsx` (add nav)

- [ ] **Step 1: Create Nav component**

```tsx
// src/components/nav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/agents', label: 'Agents' },
  { href: '/configs', label: 'Configs' },
  { href: '/channels', label: 'Channels' },
  { href: '/tool-log', label: 'Tool Log' },
  { href: '/admin', label: 'Admin' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-3 bg-white/70 backdrop-blur-xl border-b border-black/5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-teal to-accent flex items-center justify-center shadow-lg shadow-primary/20">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900">TradingSwarm</h1>
      </div>
      <div className="flex gap-0.5 bg-black/[.03] rounded-2xl p-1">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              pathname === link.href
                ? 'text-gray-900 bg-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-4 text-sm font-medium">
        <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          0 agents live
        </span>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create StatCard component**

```tsx
// src/components/stat-card.tsx
interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: 'green' | 'purple' | 'teal' | 'orange' | 'default';
  hero?: boolean;
}

const colorClasses = {
  green: 'text-emerald-600',
  purple: 'text-primary',
  teal: 'text-teal',
  orange: 'text-accent',
  default: 'text-gray-900',
};

export function StatCard({ label, value, sub, color = 'default', hero }: StatCardProps) {
  return (
    <div className={`bg-white/70 border border-black/5 rounded-2xl p-5 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 ${hero ? 'bg-gradient-to-br from-primary/[.04] to-teal/[.04] border-primary/10' : ''}`}>
      <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold">{label}</div>
      <div className={`font-mono font-bold mt-2 ${hero ? 'text-3xl' : 'text-xl'} ${colorClasses[color]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create StatusBadge, ToggleSwitch, AgentBadge**

```tsx
// src/components/status-badge.tsx
export function StatusBadge({ status }: { status: 'running' | 'stopped' | 'failed' }) {
  const styles = {
    running: 'bg-emerald-50 text-emerald-600',
    stopped: 'bg-gray-100 text-gray-400',
    failed: 'bg-red-50 text-red-500',
  };
  return <span className={`text-xs font-semibold px-3 py-1 rounded-full ${styles[status]}`}>{status}</span>;
}

// src/components/toggle-switch.tsx
export function ToggleSwitch({ on, onChange }: { on: boolean; onChange?: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-gray-300'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

// src/components/agent-badge.tsx
const colors = ['purple', 'green', 'red', 'teal', 'pink', 'orange'] as const;
const colorMap: Record<string, string> = {
  purple: 'bg-primary/10 text-primary',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-500',
  teal: 'bg-teal/10 text-teal',
  pink: 'bg-fuchsia-50 text-fuchsia-500',
  orange: 'bg-accent/10 text-accent',
};

export function AgentBadge({ name, variant }: { name: string; variant?: string }) {
  const color = variant ?? colors[Math.abs(hashCode(name)) % colors.length];
  return <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg ${colorMap[color] ?? colorMap.purple}`}>{name}</span>;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
```

- [ ] **Step 4: Update root layout with Nav**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'TradingSwarm',
  description: 'Autonomous AI trading agent swarm platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create placeholder pages for all routes**

Create minimal placeholder pages for: `/agents`, `/configs`, `/channels`, `/tool-log`, `/admin`.

```tsx
// src/app/agents/page.tsx (same pattern for all)
export default function AgentsPage() {
  return <main className="p-8"><h1 className="text-2xl font-bold">Agents</h1></main>;
}
```

- [ ] **Step 6: Build and verify**

```bash
cd tradingswarm && npm run build
```
Expected: Build succeeds. All routes render with nav.

- [ ] **Step 7: Run all tests**

```bash
cd tradingswarm && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add tradingswarm/src/components/ tradingswarm/src/app/
git commit -m "feat(tradingswarm): add shared UI components and page routing"
```

---

## Summary

After executing this plan:
- ✅ Next.js 14 app scaffolded with Tailwind, Vitest, Docker
- ✅ 22-table SQLite schema with full CRUD layer
- ✅ Core trading libraries extracted (order engine, settlement, Polymarket API)
- ✅ Platform plugin interface defined
- ✅ Shared UI components (Nav, StatCard, StatusBadge, ToggleSwitch, AgentBadge)
- ✅ All routes wired with placeholder pages
- ✅ All tests passing

Ready for parallel worktrees: Agent Runner, UI Pages A/B/C.
