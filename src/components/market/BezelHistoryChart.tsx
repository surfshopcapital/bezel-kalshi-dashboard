'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

export interface BezelHistoryPoint {
  date: string;
  price: number;
  change?: number;
}

interface BezelHistoryChartProps {
  history: BezelHistoryPoint[];
  strike?: number;
  entityName: string;
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  active?: boolean;
  payload?: Array<{ value: number; payload: BezelHistoryPoint }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const price = payload[0].value;
  const change = point.change;

  return (
    <div className="rounded-md border border-slate-600 bg-slate-900 p-2.5 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{formatDate(label ?? '', 'short')}</p>
      <p className="font-mono font-bold text-slate-100">{formatCurrency(price)}</p>
      {change != null && (
        <p
          className={`font-mono font-medium ${
            change >= 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {change >= 0 ? '+' : ''}
          {formatCurrency(change)} ({change >= 0 ? '+' : ''}
          {price > 0 ? ((change / (price - change)) * 100).toFixed(2) : '0'}%)
        </p>
      )}
    </div>
  );
}

function formatAxisPrice(value: number): string {
  if (value >= 100_000) return `$${(value / 1000).toFixed(0)}K`;
  if (value >= 10_000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

function formatAxisDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function BezelHistoryChart({ history, strike, entityName }: BezelHistoryChartProps) {
  if (!history || history.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-slate-700 bg-slate-800 text-slate-500 text-sm">
        No price history available for {entityName}.
      </div>
    );
  }

  const prices = history.map((h) => h.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.08 || 500;
  const yMin = Math.max(0, minPrice - padding);
  const yMax = maxPrice + padding;

  // Tick reduction: at most 8 x-axis labels
  const tickInterval = Math.max(1, Math.floor(history.length / 8));
  const ticks = history
    .filter((_, i) => i % tickInterval === 0 || i === history.length - 1)
    .map((h) => h.date);

  const gradientId = `bezelGradient-${entityName.replace(/\s/g, '')}`;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{entityName} — Price History</h3>
        <span className="text-xs text-slate-500">{history.length} data points</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={history} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatAxisDate}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={formatAxisPrice}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          {strike != null && (
            <ReferenceLine
              y={strike}
              stroke="#f59e0b"
              strokeDasharray="6 3"
              strokeWidth={1.5}
              label={{
                value: `Strike $${strike.toLocaleString()}`,
                position: 'insideTopRight',
                fill: '#f59e0b',
                fontSize: 11,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="price"
            stroke="#3b82f6"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#1e40af', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
