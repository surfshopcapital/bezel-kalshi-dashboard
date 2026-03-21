'use client';
import { formatDate } from '@/lib/utils/formatters';

interface OrderLevel {
  price: number;
  quantity: number;
}

interface OrderbookLadderProps {
  yesBids: OrderLevel[];
  noBids: OrderLevel[];
  bestYesBid: number | null;
  bestNoBid: number | null;
  spread: number | null;
  midpoint: number | null;
  lastUpdated?: Date | string | null;
}

function formatCents(price: number): string {
  return `${price.toFixed(0)}¢`;
}

function formatQty(qty: number): string {
  if (qty >= 1000) return `${(qty / 1000).toFixed(1)}K`;
  return String(qty);
}

interface LadderRowProps {
  level: OrderLevel;
  maxQty: number;
  side: 'yes' | 'no';
  isBest: boolean;
}

function LadderRow({ level, maxQty, side, isBest }: LadderRowProps) {
  const pct = maxQty > 0 ? (level.quantity / maxQty) * 100 : 0;
  const isYes = side === 'yes';

  return (
    <div
      className={`relative flex items-center h-8 px-2 rounded transition-colors ${
        isBest
          ? isYes
            ? 'bg-green-900/40 border border-green-700/50'
            : 'bg-red-900/40 border border-red-700/50'
          : 'hover:bg-slate-700/40'
      }`}
    >
      {/* Fill bar */}
      <div
        className={`absolute inset-y-0 rounded ${isYes ? 'right-0 bg-green-900/30' : 'left-0 bg-red-900/30'}`}
        style={{ width: `${pct}%` }}
      />

      {/* Content */}
      {isYes ? (
        <>
          <span
            className={`relative z-10 flex-1 text-right font-mono text-sm font-medium ${
              isBest ? 'text-green-300' : 'text-slate-300'
            }`}
          >
            {formatQty(level.quantity)}
          </span>
          <span
            className={`relative z-10 ml-3 w-12 text-right font-mono text-sm font-semibold ${
              isBest ? 'text-green-400' : 'text-green-500'
            }`}
          >
            {formatCents(level.price)}
          </span>
        </>
      ) : (
        <>
          <span
            className={`relative z-10 w-12 font-mono text-sm font-semibold ${
              isBest ? 'text-red-400' : 'text-red-500'
            }`}
          >
            {formatCents(level.price)}
          </span>
          <span
            className={`relative z-10 flex-1 text-left ml-3 font-mono text-sm font-medium ${
              isBest ? 'text-red-300' : 'text-slate-300'
            }`}
          >
            {formatQty(level.quantity)}
          </span>
        </>
      )}
    </div>
  );
}

export function OrderbookLadder({
  yesBids,
  noBids,
  bestYesBid,
  bestNoBid,
  spread,
  midpoint,
  lastUpdated,
}: OrderbookLadderProps) {
  const maxYesQty = Math.max(...(yesBids.map((b) => b.quantity)), 1);
  const maxNoQty = Math.max(...(noBids.map((b) => b.quantity)), 1);

  // Sort: YES bids descending by price, NO bids ascending by price
  const sortedYes = [...yesBids].sort((a, b) => b.price - a.price);
  const sortedNo = [...noBids].sort((a, b) => a.price - b.price);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Midpoint / Spread bar */}
      <div className="flex items-center justify-center gap-6 border-b border-slate-700 bg-slate-900/50 px-4 py-2.5">
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Midpoint</p>
          <p className="font-mono text-sm font-bold text-slate-200">
            {midpoint != null ? formatCents(midpoint) : '—'}
          </p>
        </div>
        <div className="h-8 w-px bg-slate-700" />
        <div className="text-center">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Spread</p>
          <p className="font-mono text-sm font-bold text-slate-200">
            {spread != null ? formatCents(spread) : '—'}
          </p>
        </div>
        {bestYesBid != null && (
          <>
            <div className="h-8 w-px bg-slate-700" />
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Best YES</p>
              <p className="font-mono text-sm font-bold text-green-400">
                {formatCents(bestYesBid)}
              </p>
            </div>
          </>
        )}
        {bestNoBid != null && (
          <>
            <div className="h-8 w-px bg-slate-700" />
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Best NO</p>
              <p className="font-mono text-sm font-bold text-red-400">
                {formatCents(bestNoBid)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 divide-x divide-slate-700 border-b border-slate-700">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Size</span>
          <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            YES Bids
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">
            NO Bids
          </span>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Size</span>
        </div>
      </div>

      {/* Ladder rows */}
      <div className="grid grid-cols-2 divide-x divide-slate-700">
        {/* YES bids */}
        <div className="p-2 space-y-0.5">
          {sortedYes.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">No YES bids</p>
          ) : (
            sortedYes.map((level, i) => (
              <LadderRow
                key={`yes-${level.price}-${i}`}
                level={level}
                maxQty={maxYesQty}
                side="yes"
                isBest={level.price === bestYesBid}
              />
            ))
          )}
        </div>

        {/* NO bids */}
        <div className="p-2 space-y-0.5">
          {sortedNo.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">No NO bids</p>
          ) : (
            sortedNo.map((level, i) => (
              <LadderRow
                key={`no-${level.price}-${i}`}
                level={level}
                maxQty={maxNoQty}
                side="no"
                isBest={level.price === bestNoBid}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      {lastUpdated && (
        <div className="border-t border-slate-700 px-3 py-1.5">
          <p className="text-xs text-slate-600">
            Last updated: {formatDate(lastUpdated, 'relative')}
          </p>
        </div>
      )}
    </div>
  );
}
