/**
 * Seed script — creates initial BezelEntity, KalshiMarket, and MarketMapping records.
 * Idempotent: safe to run multiple times (uses upsert).
 *
 * Real Kalshi tickers (discovered from API, March 2026):
 *   KXCARTIER-MAR-5729        expires 2026-04-01T14:00:00Z  strike $5,729
 *   KXROLEX-MAR-12937         expires 2026-04-01T14:00:00Z  strike $12,937
 *   KXBEZELRSUB41LV-MAR-14026 expires 2026-03-31T14:00:00Z  strike $14,026
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ---------------------------------------------------------------------------
  // Bezel Entities
  // ---------------------------------------------------------------------------
  const cartierIndex = await prisma.bezelEntity.upsert({
    where: { slug: 'cartier-index' },
    update: {},
    create: {
      slug: 'cartier-index',
      entityType: 'index',
      name: 'Cartier Watch Index',
      brand: 'Cartier',
      bezelUrl: 'https://markets.getbezel.com/indexes',
    },
  });
  console.log(`BezelEntity upserted: ${cartierIndex.slug}`);

  const rolexIndex = await prisma.bezelEntity.upsert({
    where: { slug: 'rolex-index' },
    update: {},
    create: {
      slug: 'rolex-index',
      entityType: 'index',
      name: 'Rolex Watch Index',
      brand: 'Rolex',
      bezelUrl: 'https://markets.getbezel.com/indexes',
    },
  });
  console.log(`BezelEntity upserted: ${rolexIndex.slug}`);

  const rolexSub = await prisma.bezelEntity.upsert({
    where: { slug: 'rolex-submariner-date-41-starbucks' },
    update: {},
    create: {
      slug: 'rolex-submariner-date-41-starbucks',
      entityType: 'model',
      name: 'Rolex Submariner Date 41 "Starbucks" 126610LV',
      brand: 'Rolex',
      referenceNumber: '126610LV',
      bezelUrl: 'https://markets.getbezel.com/models/rolex-submariner-date-41-starbucks',
    },
  });
  console.log(`BezelEntity upserted: ${rolexSub.slug}`);

  // ---------------------------------------------------------------------------
  // Kalshi Markets
  // Tickers include the strike price suffix as returned by Kalshi API.
  // ---------------------------------------------------------------------------
  const cartierMarket = await prisma.kalshiMarket.upsert({
    where: { ticker: 'KXCARTIER-MAR-5729' },
    update: {
      title: 'Will the price of the Bezel Cartier Index be above $5729 at March 31, 2026?',
      resolvedStrike: 5729,
      strikeDirection: 'above',
      strikeCondition: 'above',
      expirationDate: new Date('2026-04-01T14:00:00Z'),
      status: 'open',
    },
    create: {
      ticker: 'KXCARTIER-MAR-5729',
      eventTicker: 'KXCARTIER-MAR',
      seriesTicker: 'KXCARTIER',
      title: 'Will the price of the Bezel Cartier Index be above $5729 at March 31, 2026?',
      rulesText:
        'If the value of the Bezel Cartier Index is above $5,729 on March 31, 2026, then the market resolves to Yes.',
      status: 'open',
      resolvedStrike: 5729,
      strikeDirection: 'above',
      strikeCondition: 'above',
      expirationDate: new Date('2026-04-01T14:00:00Z'),
      closeDate: new Date('2026-04-01T14:00:00Z'),
      kalshiUrl: 'https://kalshi.com/markets/kxcartier-mar/kxcartier-mar-5729',
    },
  });
  console.log(`KalshiMarket upserted: ${cartierMarket.ticker}`);

  const rolexMarket = await prisma.kalshiMarket.upsert({
    where: { ticker: 'KXROLEX-MAR-12937' },
    update: {
      title: 'Will the price of the Bezel Rolex Index be above $12937 at March 31, 2026?',
      resolvedStrike: 12937,
      strikeDirection: 'above',
      strikeCondition: 'above',
      expirationDate: new Date('2026-04-01T14:00:00Z'),
      status: 'open',
    },
    create: {
      ticker: 'KXROLEX-MAR-12937',
      eventTicker: 'KXROLEX-MAR',
      seriesTicker: 'KXROLEX',
      title: 'Will the price of the Bezel Rolex Index be above $12937 at March 31, 2026?',
      rulesText:
        'If the value of the Bezel Rolex Index is above $12,937 on March 31, 2026, then the market resolves to Yes.',
      status: 'open',
      resolvedStrike: 12937,
      strikeDirection: 'above',
      strikeCondition: 'above',
      expirationDate: new Date('2026-04-01T14:00:00Z'),
      closeDate: new Date('2026-04-01T14:00:00Z'),
      kalshiUrl: 'https://kalshi.com/markets/kxrolex-mar/kxrolex-mar-12937',
    },
  });
  console.log(`KalshiMarket upserted: ${rolexMarket.ticker}`);

  const subMarket = await prisma.kalshiMarket.upsert({
    where: { ticker: 'KXBEZELRSUB41LV-MAR-14026' },
    update: {
      title: 'Will the price of the Rolex Submariner Date 41 "Starbucks" 126610LV-0002 be above $14026 at March 31, 2026?',
      resolvedStrike: 14026,
      strikeDirection: 'above',
      strikeCondition: 'above',
      expirationDate: new Date('2026-03-31T14:00:00Z'),
      status: 'open',
    },
    create: {
      ticker: 'KXBEZELRSUB41LV-MAR-14026',
      eventTicker: 'KXBEZELRSUB41LV-MAR',
      seriesTicker: 'KXBEZELRSUB41LV',
      title: 'Will the price of the Rolex Submariner Date 41 "Starbucks" 126610LV-0002 be above $14026 at March 31, 2026?',
      rulesText:
        'If the value of the Rolex Submariner Date 41 "Starbucks" 126610LV-0002 is above $14,026 on March 31, 2026, then the market resolves to Yes.',
      status: 'open',
      resolvedStrike: 14026,
      strikeDirection: 'above',
      strikeCondition: 'above',
      expirationDate: new Date('2026-03-31T14:00:00Z'),
      closeDate: new Date('2026-03-31T14:00:00Z'),
      kalshiUrl: 'https://kalshi.com/markets/kxbezelrsub41lv-mar/kxbezelrsub41lv-mar-14026',
    },
  });
  console.log(`KalshiMarket upserted: ${subMarket.ticker}`);

  // ---------------------------------------------------------------------------
  // Market Mappings
  // ---------------------------------------------------------------------------
  await prisma.marketMapping.upsert({
    where: { kalshiTicker: 'KXCARTIER-MAR-5729' },
    update: {
      strikeValue: 5729,
      strikeDirection: 'above',
      strikeParsedFrom: 'seed',
    },
    create: {
      kalshiTicker: 'KXCARTIER-MAR-5729',
      kalshiMarketId: cartierMarket.id,
      bezelEntityId: cartierIndex.id,
      strikeDirection: 'above',
      strikeValue: 5729,
      strikeParsedFrom: 'seed',
      notes: 'Cartier Watch Index monthly contract resolving against Bezel Cartier index; strike $5,729',
    },
  });

  await prisma.marketMapping.upsert({
    where: { kalshiTicker: 'KXROLEX-MAR-12937' },
    update: {
      strikeValue: 12937,
      strikeDirection: 'above',
      strikeParsedFrom: 'seed',
    },
    create: {
      kalshiTicker: 'KXROLEX-MAR-12937',
      kalshiMarketId: rolexMarket.id,
      bezelEntityId: rolexIndex.id,
      strikeDirection: 'above',
      strikeValue: 12937,
      strikeParsedFrom: 'seed',
      notes: 'Rolex Watch Index monthly contract resolving against Bezel Rolex index; strike $12,937',
    },
  });

  await prisma.marketMapping.upsert({
    where: { kalshiTicker: 'KXBEZELRSUB41LV-MAR-14026' },
    update: {
      strikeValue: 14026,
      strikeDirection: 'above',
      strikeParsedFrom: 'seed',
    },
    create: {
      kalshiTicker: 'KXBEZELRSUB41LV-MAR-14026',
      kalshiMarketId: subMarket.id,
      bezelEntityId: rolexSub.id,
      strikeDirection: 'above',
      strikeValue: 14026,
      strikeParsedFrom: 'seed',
      notes: 'Rolex Submariner Date 41 "Starbucks" (126610LV) monthly contract; strike $14,026',
    },
  });

  console.log('Market mappings upserted.');
  console.log('\nSeed complete. Run `npm run jobs:kalshi` to fetch live Kalshi data.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
