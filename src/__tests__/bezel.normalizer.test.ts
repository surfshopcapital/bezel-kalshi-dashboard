/**
 * Unit tests for lib/bezel/normalizer.ts
 */
import {
  parseBezelPrice,
  parseBezelChange,
  normalizeBezelIndexResponse,
  normalizeBezelModelResponse,
} from '@/lib/bezel/normalizer';

describe('parseBezelPrice', () => {
  it('parses plain number', () => expect(parseBezelPrice(12345)).toBe(12345));
  it('parses "$12,345.00"', () => expect(parseBezelPrice('$12,345.00')).toBe(12345));
  it('parses "14,500"', () => expect(parseBezelPrice('14,500')).toBe(14500));
  it('returns null for "N/A"', () => expect(parseBezelPrice('N/A')).toBeNull());
  it('returns null for undefined', () => expect(parseBezelPrice(undefined)).toBeNull());
  it('returns null for empty string', () => expect(parseBezelPrice('')).toBeNull());
});

describe('parseBezelChange', () => {
  it('parses "+$150"', () => {
    const { change } = parseBezelChange('+$150');
    expect(change).toBe(150);
  });
  it('parses "-$250.00"', () => {
    const { change } = parseBezelChange('-$250.00');
    expect(change).toBe(-250);
  });
  it('returns nulls for "--"', () => {
    const { change, changePct } = parseBezelChange('--');
    expect(change).toBeNull();
    expect(changePct).toBeNull();
  });
});

describe('normalizeBezelIndexResponse', () => {
  it('handles array shape', () => {
    const raw = [
      { name: 'Rolex Index', value: 100.5, change: 1.5, changePct: 1.5, date: '2024-01-15' },
      { name: 'Cartier Index', value: 95.0, change: -0.5, changePct: -0.5 },
    ];
    const result = normalizeBezelIndexResponse(raw, 'rolex-index');
    expect(result).not.toBeNull();
    expect(result?.price).toBe(100.5);
  });

  it('handles { data: [] } shape', () => {
    const raw = { data: [{ name: 'Cartier Index', value: 95.0, change: 0.5 }] };
    const result = normalizeBezelIndexResponse(raw, 'cartier-index');
    expect(result).not.toBeNull();
  });

  it('returns null for empty array', () => {
    expect(normalizeBezelIndexResponse([], 'rolex-index')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizeBezelIndexResponse(null, 'rolex-index')).toBeNull();
  });
});

describe('normalizeBezelModelResponse', () => {
  it('handles direct object shape', () => {
    const raw = {
      name: 'Rolex Submariner Date 41',
      referenceNumber: '126610LV',
      price: 14500,
      change: 200,
      changePct: 1.4,
      currency: 'USD',
    };
    const result = normalizeBezelModelResponse(raw, 'rolex-submariner-date-41-starbucks');
    expect(result).not.toBeNull();
    expect(result?.price).toBe(14500);
  });
});
