'use client';
import { useState } from 'react';
import { correlationColor } from '@/lib/utils/formatters';

// correlationColor is imported from formatters — if it doesn't exist there, define locally:
// function correlationColor(v: number): string { ... }

interface CorrelationHeatmapProps {
  ids: string[];
  names: string[];
  matrix: number[][];
}

interface TooltipState {
  x: number;
  y: number;
  rowName: string;
  colName: string;
  value: number;
}

function getTextColor(bgColor: string): string {
  // Simple luminance check: if background is light (white-ish), use dark text
  const match = bgColor.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) return '#e2e8f0';
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0f172a' : '#f1f5f9';
}

export function CorrelationHeatmap({ ids, names, matrix }: CorrelationHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (!ids || ids.length === 0 || !matrix || matrix.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 rounded-lg border border-slate-700 bg-slate-800 text-slate-500 text-sm">
        No correlation data available.
      </div>
    );
  }

  const n = ids.length;

  // Truncate long names
  const shortNames = names.map((name) =>
    name.length > 18 ? name.slice(0, 17) + '…' : name,
  );

  return (
    <div className="relative rounded-lg border border-slate-700 bg-slate-800 p-4 overflow-auto">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Correlation Matrix</h3>

      {/* Color scale legend */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">-1.0</span>
        <div
          className="h-3 flex-1 rounded-full"
          style={{
            background:
              'linear-gradient(to right, rgb(204,51,51), rgb(255,255,255), rgb(51,204,51))',
          }}
        />
        <span className="text-xs text-slate-500">+1.0</span>
      </div>

      <div className="overflow-auto">
        <div
          className="inline-grid gap-0.5"
          style={{
            gridTemplateColumns: `120px repeat(${n}, minmax(48px, 1fr))`,
          }}
        >
          {/* Top-left empty cell */}
          <div />

          {/* Column headers */}
          {shortNames.map((name, colIdx) => (
            <div
              key={`col-header-${ids[colIdx]}`}
              className="flex items-end justify-center pb-1"
              style={{ minWidth: 48 }}
            >
              <span
                className="text-xs text-slate-400 font-medium"
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  whiteSpace: 'nowrap',
                  maxHeight: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {name}
              </span>
            </div>
          ))}

          {/* Rows */}
          {ids.map((rowId, rowIdx) => (
            <>
              {/* Row label */}
              <div
                key={`row-label-${rowId}`}
                className="flex items-center pr-2 py-0.5"
                style={{ minHeight: 40 }}
              >
                <span
                  className="text-xs text-slate-400 font-medium truncate"
                  title={names[rowIdx]}
                >
                  {shortNames[rowIdx]}
                </span>
              </div>

              {/* Cells */}
              {ids.map((colId, colIdx) => {
                const value =
                  rowIdx < matrix.length && colIdx < (matrix[rowIdx]?.length ?? 0)
                    ? matrix[rowIdx][colIdx]
                    : rowIdx === colIdx
                    ? 1
                    : 0;

                const bg = correlationColor(value);
                const textColor = getTextColor(bg);
                const isDiagonal = rowIdx === colIdx;

                return (
                  <div
                    key={`cell-${rowId}-${colId}`}
                    className="relative flex items-center justify-center rounded cursor-pointer transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: bg,
                      minWidth: 48,
                      minHeight: 40,
                      outline: isDiagonal ? '1px solid rgba(148,163,184,0.3)' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        rowName: names[rowIdx],
                        colName: names[colIdx],
                        value,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span
                      className="text-xs font-mono font-semibold select-none"
                      style={{ color: textColor }}
                    >
                      {value.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1.5 shadow-xl text-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-medium text-slate-200">
            {tooltip.rowName} × {tooltip.colName}
          </p>
          <p className="font-mono text-slate-300">
            ρ ={' '}
            <span
              className={
                tooltip.value > 0.3
                  ? 'text-green-400'
                  : tooltip.value < -0.3
                  ? 'text-red-400'
                  : 'text-slate-300'
              }
            >
              {tooltip.value.toFixed(4)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
