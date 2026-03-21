// Run with: tsx src/lib/jobs/runAll.ts
import { refreshKalshiJob } from './refreshKalshi';
import { bezelIngestionJob } from './refreshBezel';
import { computeProbabilitiesJob } from './computeProbabilities';
import { computeCorrelationsJob } from './computeCorrelations';
import prisma from '@/lib/db';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info('=== Full data refresh starting ===');
  try {
    const k = await refreshKalshiJob();
    logger.info('Kalshi done', k);
    const b = await bezelIngestionJob();
    logger.info('Bezel done', b);
    const p = await computeProbabilitiesJob();
    logger.info('Probabilities done', p);
    const c = await computeCorrelationsJob();
    logger.info('Correlations done', c);
    logger.info('=== Full refresh complete ===');
  } catch (err) {
    logger.error('Full refresh failed', { error: String(err) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
