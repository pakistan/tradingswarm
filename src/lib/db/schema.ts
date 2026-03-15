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
      config_json   TEXT,
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

  // Add config_json column if missing (migration for existing DBs)
  const cols = db.prepare("PRAGMA table_info(tools)").all() as { name: string }[];
  if (!cols.find(c => c.name === 'config_json')) {
    db.exec('ALTER TABLE tools ADD COLUMN config_json TEXT');
  }

  // Seed tools if empty
  const toolCount = (db.prepare('SELECT COUNT(*) as c FROM tools').get() as { c: number }).c;
  if (toolCount === 0) {
    seedTools(db);
  }

  // Seed web search tool if missing
  const hasWebSearch = db.prepare("SELECT 1 FROM tools WHERE name = 'Web Search'").get();
  if (!hasWebSearch) {
    seedWebSearchTool(db);
  }
}

function seedTools(db: Database.Database): void {
  const insert = db.prepare('INSERT INTO tools (name, platform, description) VALUES (?, ?, ?)');
  const insertCap = db.prepare('INSERT INTO tool_capabilities (tool_id, name, handler, description) VALUES (?, ?, ?, ?)');

  const tools: { name: string; platform: string; description: string; capabilities: { name: string; description: string }[] }[] = [
    { name: 'Polymarket Markets', platform: 'polymarket', description: 'Search and browse prediction markets', capabilities: [
      { name: 'pm_markets', description: 'List prediction markets with prices and volume' },
      { name: 'pm_market_detail', description: 'Get detailed info about a specific market' },
      { name: 'pm_orderbook', description: 'View order book depth before trading' },
      { name: 'pm_price_history', description: 'Get price history over time' },
      { name: 'pm_search', description: 'Search markets by keyword' },
    ]},
    { name: 'Polymarket Trading', platform: 'polymarket', description: 'Buy and sell prediction market outcomes', capabilities: [
      { name: 'pm_buy', description: 'Buy shares of a prediction market outcome' },
      { name: 'pm_sell', description: 'Sell shares of an outcome you hold' },
      { name: 'pm_orders', description: 'List pending orders' },
      { name: 'pm_cancel_order', description: 'Cancel a pending order' },
      { name: 'pm_cancel_all', description: 'Cancel all pending orders' },
    ]},
    { name: 'Polymarket Portfolio', platform: 'polymarket', description: 'View positions, balance, and trade history', capabilities: [
      { name: 'pm_balance', description: 'Get cash balance and portfolio summary' },
      { name: 'pm_positions', description: 'Get current positions with unrealized P&L' },
      { name: 'pm_history', description: 'Get trade history' },
      { name: 'pm_leaderboard', description: 'View agent leaderboard' },
      { name: 'pm_snapshot', description: 'Record trade reasoning and market state' },
    ]},
    { name: 'Coordination Channels', platform: 'hub', description: 'Post and read messages on the agent message board', capabilities: [
      { name: 'hub_list_channels', description: 'List coordination channels' },
      { name: 'hub_read', description: 'Read posts from a channel' },
      { name: 'hub_post', description: 'Post a message to a channel' },
    ]},
    { name: 'Agent Memory', platform: 'agent', description: 'Persistent memory across trading cycles', capabilities: [
      { name: 'memory_get', description: 'Get stored memory entries' },
      { name: 'memory_set', description: 'Store or update a memory entry' },
    ]},
    { name: 'Workspace', platform: 'workspace', description: 'Agent workspace for notes, analysis, and code execution', capabilities: [
      { name: 'notepad_read', description: 'Read files from workspace' },
      { name: 'notepad_write', description: 'Write files to workspace' },
      { name: 'notepad_list', description: 'List workspace files' },
      { name: 'run_code', description: 'Execute Python or Node.js scripts' },
    ]},
  ];

  const txn = db.transaction(() => {
    for (const tool of tools) {
      const result = insert.run(tool.name, tool.platform, tool.description);
      const toolId = Number(result.lastInsertRowid);
      for (const cap of tool.capabilities) {
        insertCap.run(toolId, cap.name, cap.name, cap.description);
      }
    }
  });
  txn();
}

function seedWebSearchTool(db: Database.Database): void {
  const result = db.prepare('INSERT INTO tools (name, platform, description, config_json) VALUES (?, ?, ?, ?)')
    .run('Web Search', 'web', 'Search the web for information using Brave Search API', JSON.stringify({ api_key: '' }));
  const toolId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO tool_capabilities (tool_id, name, handler, description) VALUES (?, ?, ?, ?)')
    .run(toolId, 'web_search', 'web_search', 'Search the web and return top results');
}
