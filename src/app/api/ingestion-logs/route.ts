/**
 * GET /api/ingestion-logs?limit=50&jobName=refresh-kalshi&status=success
 *
 * Returns recent IngestionLog rows, optionally filtered by job name and/or
 * status.  Used by the market detail page's "Logs" tab and the admin view.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRecentIngestionLogs } from '@/lib/db/queries';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['running', 'success', 'partial', 'failed']);

export async function GET(request: NextRequest) {
  const start = Date.now();

  try {
    const url = new URL(request.url);

    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
    );

    const jobName = url.searchParams.get('jobName') ?? undefined;

    const rawStatus = url.searchParams.get('status') ?? undefined;
    const status = rawStatus && VALID_STATUSES.has(rawStatus) ? rawStatus : undefined;

    const logs = await getRecentIngestionLogs(limit, jobName, status);

    return NextResponse.json(
      {
        data: logs.map((log) => ({
          id: log.id,
          jobName: log.jobName,
          startedAt: log.startedAt,
          finishedAt: log.finishedAt,
          status: log.status,
          sourceType: log.sourceType,
          entityId: log.entityId,
          entityTicker: log.entityTicker,
          recordsWritten: log.recordsWritten,
          errorMessage: log.errorMessage,
          metadata: log.metadata,
          durationMs:
            log.finishedAt && log.startedAt
              ? log.finishedAt.getTime() - log.startedAt.getTime()
              : null,
        })),
        meta: {
          count: logs.length,
          limit,
          jobName: jobName ?? null,
          status: status ?? null,
          timestamp: new Date().toISOString(),
          responseTimeMs: Date.now() - start,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Response-Time': `${Date.now() - start}ms`,
        },
      },
    );
  } catch (err) {
    logger.error('GET /api/ingestion-logs failed', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
