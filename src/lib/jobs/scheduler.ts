/**
 * Node-cron scheduler for the Bezel-Kalshi dashboard.
 *
 * Schedule:
 *   - Kalshi refresh:       every 15 minutes
 *   - Bezel refresh:        every hour at :00
 *   - Probabilities:        every hour at :05 (runs after Bezel lands)
 *   - Correlations:         every 6 hours at :10 (00:10, 06:10, 12:10, 18:10)
 *
 * Run with: tsx src/lib/jobs/scheduler.ts
 *
 * The scheduler runs in-process — all jobs share the same Prisma client.
 * Unhandled job errors are caught and logged; the scheduler continues.
 */
import cron from 'node-cron';
import { refreshKalshiJob } from './refreshKalshi';
import { bezelIngestionJob } from './refreshBezel';
import { computeProbabilitiesJob } from './computeProbabilities';
import { computeCorrelationsJob } from './computeCorrelations';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Guard: prevent two instances of the same job from running concurrently
// ---------------------------------------------------------------------------

const running = new Set<string>();

async function runJobSafe<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (running.has(name)) {
    logger.warn(`Scheduler: ${name} already running — skipping this tick`);
    return null;
  }
  running.add(name);
  const start = Date.now();
  try {
    logger.info(`Scheduler: starting ${name}`);
    const result = await fn();
    logger.info(`Scheduler: ${name} finished in ${Date.now() - start}ms`, { result });
    return result;
  } catch (err) {
    logger.error(`Scheduler: ${name} failed`, { error: String(err), durationMs: Date.now() - start });
    return null;
  } finally {
    running.delete(name);
  }
}

// ---------------------------------------------------------------------------
// Schedule definitions
// ---------------------------------------------------------------------------

/** Kalshi: every 15 minutes */
cron.schedule('*/15 * * * *', () => {
  runJobSafe('refreshKalshi', refreshKalshiJob);
});

/** Bezel: every hour at :00 */
cron.schedule('0 * * * *', () => {
  runJobSafe('refreshBezel', bezelIngestionJob);
});

/** Probabilities: every hour at :05 */
cron.schedule('5 * * * *', () => {
  runJobSafe('computeProbabilities', computeProbabilitiesJob);
});

/** Correlations: every 6 hours at :10 (00:10, 06:10, 12:10, 18:10) */
cron.schedule('10 */6 * * *', () => {
  runJobSafe('computeCorrelations', computeCorrelationsJob);
});

// ---------------------------------------------------------------------------
// Boot: run each job once immediately on startup
// ---------------------------------------------------------------------------

async function runOnBoot() {
  logger.info('Scheduler booting — running initial data refresh');
  await runJobSafe('refreshKalshi', refreshKalshiJob);
  await runJobSafe('refreshBezel', bezelIngestionJob);
  await runJobSafe('computeProbabilities', computeProbabilitiesJob);
  await runJobSafe('computeCorrelations', computeCorrelationsJob);
  logger.info('Scheduler boot refresh complete');
}

runOnBoot().catch((err) => {
  logger.error('Scheduler boot failed', { error: String(err) });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string) {
  logger.info(`Scheduler: received ${signal}, shutting down`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

logger.info('Scheduler started', {
  jobs: ['refreshKalshi (*/15)', 'refreshBezel (0 *)', 'computeProbabilities (5 *)', 'computeCorrelations (10 */6)'],
});
