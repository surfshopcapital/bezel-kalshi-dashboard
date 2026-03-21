/**
 * Structured logger using winston.
 * In development: pretty-prints to console.
 * In production: emits JSON for log aggregators.
 */
import winston from 'winston';

const { combine, timestamp, errors, json, prettyPrint, colorize, simple } =
  winston.format;

const isDev = process.env.NODE_ENV === 'development';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    errors({ stack: true }),
    isDev ? prettyPrint() : json(),
  ),
  transports: [
    new winston.transports.Console({
      format: isDev
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    }),
  ],
});

/**
 * Create a child logger with persistent context fields.
 * @example
 *   const log = createChildLogger({ job: 'refreshKalshi', ticker: 'KXROLEX-MAR' });
 *   log.info('Fetching market...');
 */
export function createChildLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}
