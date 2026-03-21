/**
 * Unit tests for lib/math/probability.ts
 */
import {
  normalCdf,
  normalInvCdf,
  computeProbability,
  kalshiImpliedProbability,
  computeScenarioTable,
  computeConfidenceScore,
} from '@/lib/math/probability';

describe('normalCdf', () => {
  it('returns 0.5 at z=0', () => expect(normalCdf(0)).toBeCloseTo(0.5, 5));
  it('returns ~0.8413 at z=1', () => expect(normalCdf(1)).toBeCloseTo(0.8413, 3));
  it('returns ~0.1587 at z=-1', () => expect(normalCdf(-1)).toBeCloseTo(0.1587, 3));
  it('returns ~0.9772 at z=2', () => expect(normalCdf(2)).toBeCloseTo(0.9772, 3));
  it('approaches 0 for z=-10', () => expect(normalCdf(-10)).toBeCloseTo(0, 5));
  it('approaches 1 for z=10', () => expect(normalCdf(10)).toBeCloseTo(1, 5));
});

describe('normalInvCdf', () => {
  it('returns 0 at p=0.5', () => expect(normalInvCdf(0.5)).toBeCloseTo(0, 3));
  it('returns ~1.645 at p=0.95', () => expect(normalInvCdf(0.95)).toBeCloseTo(1.645, 2));
  it('is inverse of normalCdf', () => {
    const z = 1.23;
    expect(normalInvCdf(normalCdf(z))).toBeCloseTo(z, 3);
  });
});

describe('kalshiImpliedProbability', () => {
  it('returns 0.65 prob above when YES=65 and direction=above', () => {
    expect(kalshiImpliedProbability(65, 'above')).toBeCloseTo(0.65, 5);
  });
  it('returns 0.35 prob above when YES=65 and direction=below', () => {
    expect(kalshiImpliedProbability(65, 'below')).toBeCloseTo(0.35, 5);
  });
});

describe('computeProbability — normal model', () => {
  const priceHistory = [100];
  for (let i = 1; i < 60; i++) {
    priceHistory.push(priceHistory[i - 1] * Math.exp((Math.random() - 0.5) * 0.02));
  }
  const currentPrice = priceHistory[priceHistory.length - 1];

  it('probabilities sum to 1', () => {
    const result = computeProbability({
      priceHistory,
      currentPrice,
      strike: currentPrice * 1.05,
      strikeDirection: 'above',
      daysToExpiry: 10,
      tradingDaysToExpiry: 7,
      volWindow: 20,
      modelType: 'normal',
    });
    expect(result.probabilityAbove + result.probabilityBelow).toBeCloseTo(1, 5);
  });

  it('high strike → low probability above', () => {
    const result = computeProbability({
      priceHistory,
      currentPrice,
      strike: currentPrice * 2.0,
      strikeDirection: 'above',
      daysToExpiry: 5,
      tradingDaysToExpiry: 4,
      volWindow: 20,
      modelType: 'normal',
    });
    expect(result.probabilityAbove).toBeLessThan(0.15);
  });

  it('strike well below current → high probability above', () => {
    const result = computeProbability({
      priceHistory,
      currentPrice,
      strike: currentPrice * 0.5,
      strikeDirection: 'above',
      daysToExpiry: 10,
      tradingDaysToExpiry: 7,
      volWindow: 20,
      modelType: 'normal',
    });
    expect(result.probabilityAbove).toBeGreaterThan(0.85);
  });
});

describe('computeScenarioTable', () => {
  it('returns rows for each vol assumption', () => {
    const rows = computeScenarioTable(100, 105, 10, 0);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(row.probAbove).toBeGreaterThanOrEqual(0);
      expect(row.probAbove).toBeLessThanOrEqual(1);
      expect(row.probBelow).toBeCloseTo(1 - row.probAbove, 5);
    });
  });
});

describe('computeConfidenceScore', () => {
  it('returns 0 for 0 samples', () => expect(computeConfidenceScore(0, 10)).toBe(0));
  it('returns higher score for more samples', () => {
    expect(computeConfidenceScore(60, 10)).toBeGreaterThan(computeConfidenceScore(10, 10));
  });
  it('stays in [0, 1]', () => {
    const s = computeConfidenceScore(100, 5);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
