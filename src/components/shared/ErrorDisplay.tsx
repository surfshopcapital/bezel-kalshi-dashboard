'use client';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface ErrorDisplayProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({
  message = 'An unexpected error occurred.',
  onRetry,
  className = '',
}: ErrorDisplayProps) {
  return (
    <div
      className={`rounded-lg border border-red-800 bg-red-950/30 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-300">Failed to load data</p>
          <p className="mt-1 text-sm text-red-400 break-words">{message}</p>
        </div>
      </div>
      {onRetry && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-800/50 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <RefreshCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
