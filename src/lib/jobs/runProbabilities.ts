// Run with: tsx src/lib/jobs/runProbabilities.ts
import { computeProbabilitiesJob } from './computeProbabilities';
import prisma from '@/lib/db';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info('=== Probability computation starting ===');
  try {
    const result = await computeProbabilitiesJob();
    logger.info('Probability computation complete', result);
    if (result.failed > 0) {
      logger.warn('Some probability runs failed', { errors: result.errors });
      process.exit(1);
    }
  } catch (err) {
    logger.error('Probability computation failed', { error: String(err) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
