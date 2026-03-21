'use client';

interface LoadingCardProps {
  className?: string;
}

export function LoadingCard({ className = '' }: LoadingCardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-800 p-4 animate-pulse ${className}`}
      aria-label="Loading market data"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 rounded-full bg-slate-700" />
          <div className="h-4 w-32 rounded bg-slate-700" />
        </div>
        <div className="h-5 w-14 rounded-full bg-slate-700" />
      </div>

      {/* Price row */}
      <div className="flex items-center gap-4 mb-3">
        <div className="h-5 w-12 rounded bg-slate-700" />
        <div className="h-5 w-12 rounded bg-slate-700" />
        <div className="h-5 w-20 rounded bg-slate-700" />
      </div>

      {/* Bezel price + sparkline row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="h-7 w-24 rounded bg-slate-700 mb-1" />
          <div className="h-4 w-16 rounded bg-slate-700" />
        </div>
        <div className="h-10 w-32 rounded bg-slate-700" />
      </div>

      {/* Strike info row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-4 w-28 rounded bg-slate-700" />
        <div className="h-4 w-20 rounded bg-slate-700" />
      </div>

      {/* Probability bars */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-14 rounded bg-slate-700" />
          <div className="h-3 flex-1 rounded bg-slate-700" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-14 rounded bg-slate-700" />
          <div className="h-3 flex-1 rounded bg-slate-700" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-slate-700" />
          <div className="h-4 w-4 rounded bg-slate-700" />
        </div>
        <div className="h-4 w-20 rounded bg-slate-700" />
      </div>
    </div>
  );
}
