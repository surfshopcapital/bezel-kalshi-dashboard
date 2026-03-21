/**
 * Unit tests for lib/math/volatility.ts
 */
import {
  computeLogReturns,
  computeSimpleReturns,
  stdDev,
  mean,
  annualizeVol,
  computeRollingVols,
  percentile,
  estimateDrift,
} from '@/lib/math/volatility';

describe('computeLogReturns', () => {
  it('returns empty array for fewer than 2 prices', () => {
    expect(computeLogReturns([])).toEqual([]);
    expect(computeLogReturns([100])).toEqual([]);
  });

  it('computes log returns correctly', () => {
    const [r0, r1] = computeLogReturns([100, 110, 105]);
    expect(r0).toBeCloseTo(Math.log(110 / 100), 10);
    expect(r1).toBeCloseTo(Math.log(105 / 110), 10);
  });
});

describe('computeSimpleReturns', () => {
  it('computes simple returns', () => {
    const [r0, r1] = computeSimpleReturns([100, 110, 99]);
    expect(r0).toBeCloseTo(0.1, 10);
    expect(r1).toBeCloseTo(-0.1, 5);
  });
});

describe('stdDev', () => {
  it('returns 0 for empty or single element', () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
  });

  it('computes sample std dev (ddof=1)', () => {
    // stdDev([2,4,4,4,5,5,7,9]) = 2.0
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1);
  });

  it('returns 0 for constant array', () => {
    expect(stdDev([5, 5, 5, 5])).toBe(0);
  });
});

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('computes arithmetic mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
});

describe('annualizeVol', () => {
  it('multiplies by sqrt(252)', () => {
    expect(annualizeVol(0.01)).toBeCloseTo(0.01 * Math.sqrt(252), 10);
  });
});

describe('computeRollingVols', () => {
  const prices = Array.from({ length: 70 }, (_, i) => 100 * Math.exp(0.01 * i));

  it('returns null for windows larger than available data', () => {
    const vols = computeRollingVols([100, 101, 102], [5, 10]);
    expect(vols[5]).toBeNull();
    expect(vols[10]).toBeNull();
  });

  it('returns positive values when data is sufficient', () => {
    const vols = computeRollingVols(prices, [5, 10, 20, 30, 60]);
    [5, 10, 20, 30, 60].forEach((w) => {
      expect(vols[w as 5 | 10 | 20 | 30 | 60]).not.toBeNull();
      expect(vols[w as 5 | 10 | 20 | 30 | 60]!).toBeGreaterThan(0);
    });
  });
});

describe('percentile', () => {
  it('returns min for p=0 and max for p=100', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(percentile(arr, 0)).toBeCloseTo(1, 0);
    expect(percentile(arr, 100)).toBeCloseTo(5, 0);
  });

  it('returns median for p=50', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBeCloseTo(3, 0);
  });
});

describe('estimateDrift', () => {
  it('returns object with mean and tStat', () => {
    const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
    const { mean: m, tStat } = estimateDrift(returns);
    expect(typeof m).toBe('number');
    expect(typeof tStat).toBe('number');
  });
});
