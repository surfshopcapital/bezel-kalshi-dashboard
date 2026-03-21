/**
 * Seed script — creates initial BezelEntity, KalshiMarket, and MarketMapping records.
 * Idempotent: safe to run multiple times (uses upsert).
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
      name: 'Rolex Submariner Date 41 Starbucks',
      brand: 'Rolex',
      referenceNumber: '126610LV',
      bezelUrl: 'https://markets.getbezel.com/models/rolex-submariner-date-41-starbucks',
    },
  });
  console.log(`BezelEntity upserted: ${rolexSub.slug}`);

  // ---------------------------------------------------------------------------
  // Kalshi Markets
  // ---------------------------------------------------------------------------
  const cartierMarket = await prisma.kalshiMarket.upsert({
    where: { ticker: 'KXCARTIER-MAR' },
    update: {},
    create: {
      ticker: 'KXCARTIER-MAR',
      eventTicker: 'KXCARTIER',
      seriesTicker: 'KXCARTIER',
      title: 'Cartier Watch Index — March 2026',
      status: 'open',
      expirationDate: new Date('2026-03-31T23:59:59Z'),
      kalshiUrl: 'https://kalshi.com/markets/kxcartier/cartier-index/kxcartier-mar',
    },
  });
  console.log(`KalshiMarket upserted: ${cartierMarket.ticker}`);

  const rolexMarket = await prisma.kalshiMarket.upsert({
    where: { ticker: 'KXROLEX-MAR' },
    update: {},
    create: {
      ticker: 'KXROLEX-MAR',
      eventTicker: 'KXROLEX',
      seriesTicker: 'KXROLEX',
      title: 'Will the Rolex Index be up or down this month? — March 2026',
      status: 'open',
      expirationDate: new Date('2026-03-31T23:59:59Z'),
      kalshiUrl:
        'https://kalshi.com/markets/kxrolex/will-the-rolex-index-be-up-or-down-this-month-bezel/kxrolex-mar',
    },
  });
  console.log(`KalshiMarket upserted: ${rolexMarket.ticker}`);

  const subMarket = await prisma.kalshiMarket.upsert({
    where: { ticker: 'KXBEZELRSUB41LV-MAR' },
    update: {},
    create: {
      ticker: 'KXBEZELRSUB41LV-MAR',
      eventTicker: 'KXBEZELRSUB41LV',
      seriesTicker: 'KXBEZELRSUB41LV',
      title: 'Rolex Submariner Date 41 "Starbucks" — March 2026',
      status: 'open',
      expirationDate: new Date('2026-03-31T23:59:59Z'),
      kalshiUrl:
        'https://kalshi.com/markets/kxbezelrsub41lv/rolex-submariner-date-41-starbucks/kxbezelrsub41lv-mar',
    },
  });
  console.log(`KalshiMarket upserted: ${subMarket.ticker}`);

  // ---------------------------------------------------------------------------
  // Market Mappings
  // ---------------------------------------------------------------------------
  await prisma.marketMapping.upsert({
    where: { kalshiTicker: 'KXCARTIER-MAR' },
    update: {},
    create: {
      kalshiTicker: 'KXCARTIER-MAR',
      kalshiMarketId: cartierMarket.id,
      bezelEntityId: cartierIndex.id,
      strikeDirection: null,
      strikeValue: null,
      strikeParsedFrom: 'pending_live_fetch',
      notes: 'Cartier Watch Index monthly contract resolving against Bezel Cartier index',
    },
  });

  await prisma.marketMapping.upsert({
    where: { kalshiTicker: 'KXROLEX-MAR' },
    update: {},
    create: {
      kalshiTicker: 'KXROLEX-MAR',
      kalshiMarketId: rolexMarket.id,
      bezelEntityId: rolexIndex.id,
      strikeDirection: null,
      strikeValue: null,
      strikeParsedFrom: 'pending_live_fetch',
      notes: 'Rolex Watch Index monthly contract resolving against Bezel Rolex index',
    },
  });

  await prisma.marketMapping.upsert({
    where: { kalshiTicker: 'KXBEZELRSUB41LV-MAR' },
    update: {},
    create: {
      kalshiTicker: 'KXBEZELRSUB41LV-MAR',
      kalshiMarketId: subMarket.id,
      bezelEntityId: rolexSub.id,
      strikeDirection: null,
      strikeValue: null,
      strikeParsedFrom: 'pending_live_fetch',
      notes: 'Rolex Submariner Date 41 Starbucks (126610LV) monthly contract',
    },
  });

  console.log('Market mappings upserted.');
  console.log('\nSeed complete. Run `npm run jobs:all` to fetch initial data.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
