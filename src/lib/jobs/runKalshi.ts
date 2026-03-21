// Run with: tsx src/lib/jobs/runKalshi.ts
import { refreshKalshiJob } from './refreshKalshi';
import prisma from '@/lib/db';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info('=== Kalshi refresh starting ===');
  try {
    const result = await refreshKalshiJob();
    logger.info('Kalshi refresh complete', result);
    if (result.failed > 0) {
      logger.warn('Some markets failed', { errors: result.errors });
      process.exit(1);
    }
  } catch (err) {
    logger.error('Kalshi refresh failed', { error: String(err) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
