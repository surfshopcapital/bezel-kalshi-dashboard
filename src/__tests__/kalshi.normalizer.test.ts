/**
 * Unit tests for lib/kalshi/normalizer.ts
 */
import { parseStrikeFromTitle, normalizeOrderbook } from '@/lib/kalshi/normalizer';

describe('parseStrikeFromTitle', () => {
  it('parses "above X" pattern', () => {
    const r = parseStrikeFromTitle('Will the Rolex Index be above 100 this month?');
    expect(r.strikeValue).toBe(100);
    expect(r.strikeDirection).toBe('above');
  });

  it('parses "below X" pattern', () => {
    const r = parseStrikeFromTitle('Will the Cartier Index be below 95.50?');
    expect(r.strikeValue).toBe(95.5);
    expect(r.strikeDirection).toBe('below');
  });

  it('parses "at or above X" pattern', () => {
    const r = parseStrikeFromTitle('Rolex Submariner at or above 14000');
    expect(r.strikeValue).toBe(14000);
    expect(r.strikeDirection).toBe('above');
  });

  it('parses "exceed X" pattern', () => {
    const r = parseStrikeFromTitle('Will the index exceed 105.00?');
    expect(r.strikeValue).toBe(105.0);
    expect(r.strikeDirection).toBe('above');
  });

  it('handles comma-formatted numbers', () => {
    const r = parseStrikeFromTitle('Submariner above 14,500');
    expect(r.strikeValue).toBe(14500);
    expect(r.strikeDirection).toBe('above');
  });

  it('returns nulls for up/down market (no strike)', () => {
    const r = parseStrikeFromTitle('Will the Rolex Index be up or down this month?');
    expect(r.strikeValue).toBeNull();
    expect(r.strikeDirection).toBeNull();
  });

  it('checks rules text when title has no strike', () => {
    const r = parseStrikeFromTitle(
      'Will Rolex be up or down?',
      'Market resolves YES if the Rolex index is above 100.00 on March 31.',
    );
    expect(r.strikeValue).toBe(100.0);
    expect(r.strikeDirection).toBe('above');
  });
});

describe('normalizeOrderbook', () => {
  it('normalizes a populated orderbook', () => {
    const raw = {
      market_ticker: 'KXROLEX-MAR',
      orderbook: {
        yes: [[60, 100], [58, 200]] as [number, number][],
        no: [[45, 150]] as [number, number][],
      },
    };
    const result = normalizeOrderbook(raw);
    expect(result.yesBids).toHaveLength(2);
    expect(result.noBids).toHaveLength(1);
    expect(result.bestYesBid).toBe(60);
    expect(result.bestNoBid).toBe(45);
  });

  it('handles empty orderbook gracefully', () => {
    const raw = { market_ticker: 'KXROLEX-MAR', orderbook: { yes: [], no: [] } };
    const result = normalizeOrderbook(raw);
    expect(result.bestYesBid).toBeNull();
    expect(result.bestNoBid).toBeNull();
    expect(result.spread).toBeNull();
    expect(result.midpoint).toBeNull();
  });
});
