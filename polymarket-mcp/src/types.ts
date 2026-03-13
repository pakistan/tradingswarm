// ---- Database row types ----

export interface AgentRow {
  agent_id: string;
  initial_balance: number;
  current_cash: number;
  created_at: string;
}

export interface MarketRow {
  market_id: string;
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
  opened_at: string;
  closed_at: string;
}

export interface ResolutionRow {
  outcome_id: string;
  resolved_value: number;
  resolved_at: string;
}

// ---- API response types ----

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  asset_id: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  mid_price: number;
  timestamp: string;
}

export interface FillResult {
  filled_amount: number;
  filled_shares: number;
  avg_fill_price: number;
  slippage: number;
  levels_consumed: number;
}

export interface GammaMarket {
  id: string;
  question: string;
  category: string | null;
  description: string | null;
  resolutionSource: string | null;
  volume: string | null;
  volumeNum: number | null;
  endDate: string | null;
  active: boolean | null;
  closed: boolean | null;
  outcomes: string | null;
  outcomePrices: string | null;
  clobTokenIds: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  spread: number | null;
  oneDayPriceChange: number | null;
  acceptingOrders: boolean | null;
}

export interface PricePoint {
  t: number;
  p: number;
}
