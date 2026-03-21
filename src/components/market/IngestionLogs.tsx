'use client';
import { formatDate } from '@/lib/utils/formatters';

export interface IngestionLogEntry {
  id: string | number;
  timestamp: string | Date;
  jobName: string;
  status: 'success' | 'error' | 'warning' | 'running' | 'skipped' | string;
  source?: string | null;
  recordsProcessed?: number | null;
  errorMessage?: string | null;
  durationMs?: number | null;
}

interface IngestionLogsProps {
  logs: IngestionLogEntry[];
  maxRows?: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string }
> = {
  success: { label: 'Success', bgClass: 'bg-green-900/50', textClass: 'text-green-400' },
  error: { label: 'Error', bgClass: 'bg-red-900/50', textClass: 'text-red-400' },
  warning: { label: 'Warning', bgClass: 'bg-yellow-900/50', textClass: 'text-yellow-400' },
  running: { label: 'Running', bgClass: 'bg-blue-900/50', textClass: 'text-blue-400' },
  skipped: { label: 'Skipped', bgClass: 'bg-slate-700', textClass: 'text-slate-400' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bgClass: 'bg-slate-700',
    textClass: 'text-slate-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass}`}
    >
      {config.label}
    </span>
  );
}

function truncateError(msg: string | null | undefined, maxLen = 80): string {
  if (!msg) return '';
  return msg.length > maxLen ? msg.slice(0, maxLen - 1) + '…' : msg;
}

export function IngestionLogs({ logs, maxRows = 50 }: IngestionLogsProps) {
  // Sort most recent first
  const sorted = [...logs]
    .sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    })
    .slice(0, maxRows);

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 py-10 text-center">
        <p className="text-sm text-slate-500">No ingestion logs available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Ingestion Logs</h3>
        <span className="text-xs text-slate-500">{sorted.length} entries</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                Time
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                Job
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                Source
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                Records
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                Duration
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                Error
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sorted.map((log) => (
              <tr key={String(log.id)} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-3 py-2 text-xs font-mono text-slate-400 whitespace-nowrap">
                  {formatDate(log.timestamp, 'relative')}
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-slate-300 whitespace-nowrap">
                    {log.jobName}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={log.status} />
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
                  {log.source ?? '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                  {log.recordsProcessed != null ? log.recordsProcessed.toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-400 whitespace-nowrap">
                  {log.durationMs != null ? `${log.durationMs.toLocaleString()}ms` : '—'}
                </td>
                <td className="px-3 py-2 max-w-xs">
                  {log.errorMessage ? (
                    <span
                      className="text-xs text-red-400 font-mono"
                      title={log.errorMessage}
                    >
                      {truncateError(log.errorMessage)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
