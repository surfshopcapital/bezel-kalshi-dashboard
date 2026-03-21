'use client';
import { CheckCircle, Wifi, Code, AlertCircle } from 'lucide-react';

type SourceQuality =
  | 'official_api'
  | 'frontend_network_capture'
  | 'html_scrape'
  | 'manual_mapping_fallback'
  | string
  | null;

interface SourceBadgeProps {
  quality: SourceQuality;
  className?: string;
}

const SOURCE_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  official_api: {
    label: 'Official API',
    bgClass: 'bg-green-900/50',
    textClass: 'text-green-400',
    Icon: CheckCircle,
  },
  frontend_network_capture: {
    label: 'Network Capture',
    bgClass: 'bg-blue-900/50',
    textClass: 'text-blue-400',
    Icon: Wifi,
  },
  html_scrape: {
    label: 'HTML Scrape',
    bgClass: 'bg-yellow-900/50',
    textClass: 'text-yellow-400',
    Icon: Code,
  },
  manual_mapping_fallback: {
    label: 'Manual Fallback',
    bgClass: 'bg-red-900/50',
    textClass: 'text-red-400',
    Icon: AlertCircle,
  },
};

export function SourceBadge({ quality, className = '' }: SourceBadgeProps) {
  const config =
    quality && SOURCE_CONFIG[quality]
      ? SOURCE_CONFIG[quality]
      : {
          label: quality ?? 'Unknown',
          bgClass: 'bg-slate-700',
          textClass: 'text-slate-400',
          Icon: AlertCircle,
        };

  const { label, bgClass, textClass, Icon } = config;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${bgClass} ${textClass} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
