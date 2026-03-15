'use client';

import type { TradeHistoryRow } from '@/lib/types';

interface MarketSnapshotData {
  best_bid?: number;
  best_ask?: number;
  spread?: number;
  mid_price?: number;
  bids?: Array<{ price: number; size: number }>;
  asks?: Array<{ price: number; size: number }>;
  total_bid_depth?: number;
  total_ask_depth?: number;
}

interface TradeInspectorClientProps {
  trade: TradeHistoryRow;
  agentContext: string | null;
  marketSnapshot: MarketSnapshotData | null;
  pnl: number;
  pnlPercent: number;
  holdingDays: number;
  holdingHours: number;
  reasonLabel: string;
}

function formatPrice(price: number): string {
  return price.toFixed(4);
}

function formatCurrency(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}$${amount.toFixed(2)}`;
}

function OrderBookVisualization({ marketSnapshot }: { marketSnapshot: MarketSnapshotData }) {
  const asks = (marketSnapshot.asks ?? []).slice(0, 5).reverse();
  const bids = (marketSnapshot.bids ?? []).slice(0, 5);
  const allSizes = [...asks, ...bids].map(l => l.size);
  const maxSize = Math.max(...allSizes, 1);

  return (
    <div className="space-y-1">
      <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold mb-2">Order Book</div>
      {/* Asks (sells) - shown in reverse so lowest ask is nearest the spread */}
      {asks.map((level, i) => (
        <div key={`ask-${i}`} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-right font-mono text-red-400">{formatPrice(level.price)}</span>
          <div className="flex-1 flex justify-end">
            <div
              className="h-5 bg-red-100 rounded-sm"
              style={{ width: `${Math.max((level.size / maxSize) * 100, 2)}%` }}
            />
          </div>
          <span className="w-16 text-right font-mono text-gray-400">{level.size.toFixed(1)}</span>
        </div>
      ))}
      {/* Spread indicator */}
      <div className="flex items-center gap-2 text-xs py-1 border-y border-dashed border-gray-200">
        <span className="w-16 text-right font-mono text-gray-600 font-semibold">
          {marketSnapshot.mid_price ? formatPrice(marketSnapshot.mid_price) : '--'}
        </span>
        <span className="text-gray-400 text-[10px]">
          spread: {marketSnapshot.spread ? (marketSnapshot.spread * 100).toFixed(2) + '%' : '--'}
        </span>
      </div>
      {/* Bids (buys) */}
      {bids.map((level, i) => (
        <div key={`bid-${i}`} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-right font-mono text-emerald-500">{formatPrice(level.price)}</span>
          <div className="flex-1">
            <div
              className="h-5 bg-emerald-100 rounded-sm"
              style={{ width: `${Math.max((level.size / maxSize) * 100, 2)}%` }}
            />
          </div>
          <span className="w-16 text-right font-mono text-gray-400">{level.size.toFixed(1)}</span>
        </div>
      ))}
      {/* Depth summary */}
      <div className="flex justify-between text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
        <span>Bid depth: {marketSnapshot.total_bid_depth?.toFixed(0) ?? '--'}</span>
        <span>Ask depth: {marketSnapshot.total_ask_depth?.toFixed(0) ?? '--'}</span>
      </div>
    </div>
  );
}

function PriceMovementVisualization({ entryPrice, exitPrice }: { entryPrice: number; exitPrice: number }) {
  const min = Math.min(entryPrice, exitPrice) * 0.95;
  const max = Math.max(entryPrice, exitPrice) * 1.05;
  const range = max - min || 1;
  const entryPct = ((entryPrice - min) / range) * 100;
  const exitPct = ((exitPrice - min) / range) * 100;
  const isProfit = exitPrice >= entryPrice;

  return (
    <div className="relative h-12 bg-gray-50 rounded-lg overflow-hidden">
      {/* Connection line */}
      <div
        className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${isProfit ? 'bg-emerald-300' : 'bg-red-300'}`}
        style={{
          left: `${Math.min(entryPct, exitPct)}%`,
          width: `${Math.abs(exitPct - entryPct)}%`,
        }}
      />
      {/* Entry marker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
        style={{ left: `${entryPct}%` }}
      >
        <div className="w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm" />
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-primary whitespace-nowrap">
          {formatPrice(entryPrice)}
        </div>
      </div>
      {/* Exit marker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
        style={{ left: `${exitPct}%` }}
      >
        <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${isProfit ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono whitespace-nowrap ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
          {formatPrice(exitPrice)}
        </div>
      </div>
    </div>
  );
}

export function TradeInspectorClient({
  trade,
  agentContext,
  marketSnapshot,
  pnl,
  pnlPercent,
  holdingDays,
  holdingHours,
  reasonLabel,
}: TradeInspectorClientProps) {
  const isProfit = pnl >= 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column - What the agent thought */}
      <div className="space-y-6">
        <div className="bg-white/70 border border-black/5 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            What the agent thought
          </h2>

          {agentContext ? (
            <div className="font-mono text-xs bg-black/[.02] rounded-lg p-4 text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {agentContext}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No agent context captured for this trade.</p>
          )}
        </div>

        {/* Market conditions */}
        <div className="bg-white/70 border border-black/5 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-teal/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </span>
            Market conditions at trade time
          </h2>

          {marketSnapshot ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Best Bid</div>
                  <div className="font-mono text-sm font-bold text-emerald-600 mt-1">
                    {marketSnapshot.best_bid != null ? formatPrice(marketSnapshot.best_bid) : '--'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Best Ask</div>
                  <div className="font-mono text-sm font-bold text-red-400 mt-1">
                    {marketSnapshot.best_ask != null ? formatPrice(marketSnapshot.best_ask) : '--'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Mid Price</div>
                  <div className="font-mono text-sm font-bold text-gray-900 mt-1">
                    {marketSnapshot.mid_price != null ? formatPrice(marketSnapshot.mid_price) : '--'}
                  </div>
                </div>
              </div>

              {(marketSnapshot.bids?.length || marketSnapshot.asks?.length) ? (
                <OrderBookVisualization marketSnapshot={marketSnapshot} />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No market snapshot captured for this trade.</p>
          )}
        </div>
      </div>

      {/* Right Column - What happened */}
      <div className="space-y-6">
        {/* Trade Outcome */}
        <div className="bg-white/70 border border-black/5 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${isProfit ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <svg className={`w-3.5 h-3.5 ${isProfit ? 'text-emerald-600' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            Trade outcome
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Entry Price</div>
              <div className="font-mono text-sm font-bold text-gray-900 mt-1">{formatPrice(trade.entry_price)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Exit Price</div>
              <div className="font-mono text-sm font-bold text-gray-900 mt-1">{formatPrice(trade.exit_price)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Shares</div>
              <div className="font-mono text-sm font-bold text-gray-900 mt-1">{trade.shares.toFixed(2)}</div>
            </div>
            <div className={`rounded-lg p-3 ${isProfit ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">P&L</div>
              <div className={`font-mono text-sm font-bold mt-1 ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatCurrency(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
              </div>
            </div>
          </div>

          {/* Price Movement */}
          <div className="text-[0.65rem] uppercase tracking-widest text-gray-400 font-semibold mb-3">Price Movement</div>
          <div className="px-4 pt-2 pb-8">
            <PriceMovementVisualization entryPrice={trade.entry_price} exitPrice={trade.exit_price} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>Entry</span>
            <span>Exit</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white/70 border border-black/5 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            Timeline
          </h2>

          <div className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />

            {/* Entry */}
            <div className="relative mb-6">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm" />
              <div className="text-xs font-semibold text-gray-900">Entered position</div>
              <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                {new Date(trade.opened_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Bought {trade.shares.toFixed(2)} shares at {formatPrice(trade.entry_price)}
              </div>
            </div>

            {/* Holding period */}
            <div className="relative mb-6">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-gray-300 border-2 border-white shadow-sm" />
              <div className="text-xs font-semibold text-gray-500">
                Held for {holdingDays > 0 ? `${holdingDays}d ` : ''}{holdingHours}h
              </div>
            </div>

            {/* Exit */}
            <div className="relative">
              <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${isProfit ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <div className="text-xs font-semibold text-gray-900">{reasonLabel}</div>
              <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                {new Date(trade.closed_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
              <div className={`text-[11px] mt-1 ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
                Exit at {formatPrice(trade.exit_price)} for {formatCurrency(pnl)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
