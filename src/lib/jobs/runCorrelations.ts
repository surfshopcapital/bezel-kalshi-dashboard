// Run with: tsx src/lib/jobs/runCorrelations.ts
import { computeCorrelationsJob } from './computeCorrelations';
import prisma from '@/lib/db';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info('=== Correlation computation starting ===');
  try {
    const result = await computeCorrelationsJob();
    logger.info('Correlation computation complete', result);
    if (result.failed > 0) {
      logger.warn('Correlation job had failures', { errors: result.errors });
      process.exit(1);
    }
  } catch (err) {
    logger.error('Correlation computation failed', { error: String(err) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
