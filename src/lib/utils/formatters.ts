/**
 * Formatting utilities for prices, percentages, dates, and volatility.
 */
import { formatDistanceToNow, format, parseISO, isValid } from 'date-fns';

export function formatCurrency(
  value: number,
  currency = 'USD',
  decimals = 0,
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Format a signed change value with explicit + prefix for positives. */
export function formatChange(value: number, type: 'absolute' | 'percent' = 'absolute'): string {
  const sign = value >= 0 ? '+' : '';
  if (type === 'percent') {
    return `${sign}${(value * 100).toFixed(2)}%`;
  }
  return `${sign}${value.toFixed(2)}`;
}

/** Format a date from Date, ISO string, or null. */
export function formatDate(
  date: Date | string | null | undefined,
  style: 'short' | 'long' | 'relative' = 'short',
): string {
  if (!date) return '—';

  const parsed = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsed)) return '—';

  switch (style) {
    case 'relative':
      return formatDistanceToNow(parsed, { addSuffix: true });
    case 'long':
      return format(parsed, 'MMMM d, yyyy HH:mm z');
    case 'short':
    default:
      return format(parsed, 'MMM d, yyyy');
  }
}

/** Return "X days" remaining until expiration, or "Expired" if past. */
export function formatDaysRemaining(expirationDate: Date | string | null): string {
  if (!expirationDate) return '—';
  const exp = typeof expirationDate === 'string' ? parseISO(expirationDate) : expirationDate;
  const now = new Date();
  const diffMs = exp.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expired';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** Format annualized volatility as a percentage string. */
export function formatVolatility(vol: number): string {
  return `${(vol * 100).toFixed(1)}% ann.`;
}

/** Format a probability in [0, 1] as a percentage with 1 decimal. */
export function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

/** Truncate a string to a maximum length with ellipsis. */
export function truncate(str: string, length = 60): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 1) + '…';
}

/** Returns true if the last-updated timestamp is older than maxAgeMinutes. */
export function isStale(lastUpdated: Date | string | null, maxAgeMinutes = 30): boolean {
  if (!lastUpdated) return true;
  const date = typeof lastUpdated === 'string' ? parseISO(lastUpdated) : lastUpdated;
  if (!isValid(date)) return true;
  const ageMs = Date.now() - date.getTime();
  return ageMs > maxAgeMinutes * 60 * 1000;
}

/** Format a Kalshi price (0–100 cents) as a percentage display. */
export function formatKalshiPrice(cents: number): string {
  return `${cents.toFixed(0)}¢`;
}

/** Format edge as basis points (modelProb - impliedProb) * 10000 bps. */
export function formatEdge(edge: number | null): string {
  if (edge === null) return '—';
  const bps = Math.round(edge * 10000);
  const sign = bps >= 0 ? '+' : '';
  return `${sign}${bps} bps`;
}
