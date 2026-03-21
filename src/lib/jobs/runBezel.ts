// Run with: tsx src/lib/jobs/runBezel.ts
import { bezelIngestionJob } from './refreshBezel';
import prisma from '@/lib/db';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info('=== Bezel ingestion starting ===');
  try {
    const result = await bezelIngestionJob();
    logger.info('Bezel ingestion complete', result);
    if (result.failed > 0) {
      logger.warn('Some Bezel entities failed', { errors: result.errors });
      process.exit(1);
    }
  } catch (err) {
    logger.error('Bezel ingestion failed', { error: String(err) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}
main();
