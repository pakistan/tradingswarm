// ---- Order book / fill types ----

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
