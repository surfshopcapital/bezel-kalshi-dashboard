'use client';
import { AlertTriangle } from 'lucide-react';
import { formatDate, isStale } from '@/lib/utils/formatters';

interface StaleDataWarningProps {
  lastUpdated: Date | string | null;
  maxAgeMinutes?: number;
}

export function StaleDataWarning({ lastUpdated, maxAgeMinutes = 30 }: StaleDataWarningProps) {
  if (!isStale(lastUpdated, maxAgeMinutes)) return null;
  return (
    <div className="flex items-center gap-1 text-yellow-400 text-xs">
      <AlertTriangle className="w-3 h-3" />
      <span>Data may be stale — last updated {formatDate(lastUpdated, 'relative')}</span>
    </div>
  );
}
