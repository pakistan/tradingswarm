// ---- Polymarket-specific API types ----

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
