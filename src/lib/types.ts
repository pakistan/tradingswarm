export interface ConfigRow {
  config_id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigVersionRow {
  version_id: number;
  config_id: number;
  version_num: number;
  model_provider: string;
  model_name: string;
  bankroll: number;
  prompt_template: string;
  mechanics_file: string | null;
  schedule_interval: string;
  diff_summary: string | null;
  created_at: string;
}

export interface RuleRow {
  rule_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  category: string | null;
  created_at: string;
}

export interface ToolRow {
  tool_id: number;
  name: string;
  description: string | null;
  platform: string;
  enabled: number;
  created_at: string;
}

export interface ToolCapabilityRow {
  capability_id: number;
  tool_id: number;
  name: string;
  description: string | null;
  handler: string;
}

export interface ModelProviderRow {
  provider_id: number;
  name: string;
  display_name: string;
  api_base: string | null;
  api_key: string | null;
  default_model: string | null;
  enabled: number;
}

export interface AgentRow {
  agent_id: string;
  display_name: string | null;
  config_version_id: number | null;
  initial_balance: number;
  current_cash: number;
  status: 'running' | 'stopped' | 'failed';
  pid: number | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketRow {
  market_id: string;
  platform: string;
  question: string;
  category: string | null;
  description: string | null;
  resolution_source: string | null;
  volume: number | null;
  end_date: string | null;
  active: number;
  raw_json: string | null;
  last_synced: string;
}

export interface OutcomeRow {
  outcome_id: string;
  market_id: string;
  name: string;
  current_price: number | null;
  last_synced: string;
}

export interface OrderRow {
  order_id: number;
  agent_id: string;
  outcome_id: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  requested_amount: number | null;
  requested_shares: number | null;
  limit_price: number | null;
  filled_amount: number;
  filled_shares: number;
  avg_fill_price: number | null;
  slippage: number | null;
  escrowed_entry_price: number | null;
  snapshot_id: number | null;
  status: 'filled' | 'partial' | 'pending' | 'cancelled';
  created_at: string;
  filled_at: string | null;
}

export interface PositionRow {
  agent_id: string;
  outcome_id: string;
  shares: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  updated_at: string;
}

export interface TradeHistoryRow {
  id: number;
  agent_id: string;
  outcome_id: string;
  market_question: string;
  outcome_name: string;
  entry_price: number;
  exit_price: number;
  shares: number;
  realized_pnl: number;
  reason: 'sold' | 'resolved_win' | 'resolved_loss';
  snapshot_id: number | null;
  opened_at: string;
  closed_at: string;
}

export interface ResolutionRow {
  outcome_id: string;
  resolved_value: number;
  resolved_at: string;
}

export interface TradeSnapshotRow {
  snapshot_id: number;
  agent_id: string;
  outcome_id: string;
  agent_context: string;
  market_snapshot: string;
  created_at: string;
}

export interface ChannelRow {
  id: number;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PostRow {
  id: number;
  channel_id: number;
  agent_id: string;
  content: string;
  parent_id: number | null;
  created_at: string;
}

export interface ToolLogRow {
  id: number;
  agent_id: string;
  tool_name: string;
  platform: string;
  cycle_id: string | null;
  input_json: string | null;
  output_json: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface AgentMemoryRow {
  id: number;
  agent_id: string;
  topic: string;
  content: string;
  updated_at: string;
}

export interface AgentEventRow {
  id: number;
  agent_id: string;
  event_type: string;
  cycle_id: string | null;
  data_json: string | null;
  created_at: string;
}

export interface DailySnapshotRow {
  id: number;
  agent_id: string;
  date: string;
  cash: number;
  positions_value: number;
  realized_pnl_cumulative: number;
  unrealized_pnl: number;
  total_portfolio_value: number;
  created_at: string;
}
