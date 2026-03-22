/**
 * Bezel normalizer — parse raw API/scraper payloads into typed structures.
 *
 * Design contract:
 *  - No function throws. All parse failures return null / safe defaults.
 *  - Unexpected shapes are logged to console.warn so they can be debugged
 *    without crashing a production ingestion job.
 */

import type { BezelNormalizedPrice, BezelEntityType, DataSourceQuality } from './types';

// ---------------------------------------------------------------------------
// Primitive parsers
// ---------------------------------------------------------------------------

/**
 * Parse a price from a string or number.
 * Strips leading currency symbols ($, £, €), commas, and whitespace.
 * Returns null when the input is undefined, empty, or non-numeric.
 *
 * @example
 *   parseBezelPrice("$12,345.00") // 12345
 *   parseBezelPrice(9800)         // 9800
 *   parseBezelPrice("N/A")        // null
 */
export function parseBezelPrice(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  const cleaned = String(raw)
    .trim()
    .replace(/[$£€]/g, '')
    .replace(/,/g, '')
    .trim();

  if (cleaned === '' || cleaned === 'N/A' || cleaned === '--' || cleaned === '-') {
    return null;
  }

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a change string into absolute-dollar change and percentage change.
 *
 * Handles inputs such as:
 *   "+$150"    → { change: 150,   changePct: null }
 *   "-$150"    → { change: -150,  changePct: null }
 *   "+150"     → { change: 150,   changePct: null }
 *   "-2.5%"    → { change: null,  changePct: -2.5 }
 *   "+0.50%"   → { change: null,  changePct: 0.5  }
 *   "150 (1.5%)" → { change: 150, changePct: 1.5  }
 *   "N/A"      → { change: null,  changePct: null }
 *   undefined  → { change: null,  changePct: null }
 *
 * @returns An object with change (absolute $) and changePct (percentage, e.g. -2.5 for -2.5%).
 */
export function parseBezelChange(
  raw: string | number | undefined,
): { change: number | null; changePct: number | null } {
  const EMPTY = { change: null, changePct: null };

  if (raw === undefined || raw === null) return EMPTY;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { change: raw, changePct: null } : EMPTY;
  }

  const str = String(raw).trim();

  if (str === '' || str === 'N/A' || str === '--' || str === '-') return EMPTY;

  // Pattern: "150 (1.5%)" or "+$150 (+1.5%)" — combined format
  const combinedMatch = str.match(
    /([+-]?\$?[\d,]+\.?\d*)\s*\(([+-]?[\d,]+\.?\d*)%\)/,
  );
  if (combinedMatch) {
    const changeVal = parseBezelPrice(combinedMatch[1]);
    const pctVal = parseFloat(combinedMatch[2].replace(/,/g, ''));
    return {
      change: changeVal,
      changePct: Number.isFinite(pctVal) ? pctVal : null,
    };
  }

  // Pure percentage: "-2.5%" or "+0.50%"
  const pctMatch = str.match(/^([+-]?)([\d,]+\.?\d*)%$/);
  if (pctMatch) {
    const sign = pctMatch[1] === '-' ? -1 : 1;
    const val = parseFloat(pctMatch[2].replace(/,/g, ''));
    return { change: null, changePct: Number.isFinite(val) ? sign * val : null };
  }

  // Dollar or plain number: "+$150", "-150", "150"
  const numMatch = str.match(/^([+-]?)[\s$£€]*([\d,]+\.?\d*)$/);
  if (numMatch) {
    const sign = numMatch[1] === '-' ? -1 : 1;
    const val = parseFloat(numMatch[2].replace(/,/g, ''));
    return { change: Number.isFinite(val) ? sign * val : null, changePct: null };
  }

  console.warn('[BezelNormalizer] parseBezelChange: unrecognised format:', raw);
  return EMPTY;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pluck `value` from various candidate keys in an object. */
function extractValue(obj: Record<string, unknown>): number | null {
  // Handle Bezel internal API format: { valueCents: integer } — divide by 100 for dollars.
  // Checked first because the Bezel API uses this exclusively (e.g. /beztimate/indexes/{id}/value).
  if (obj['valueCents'] !== undefined && obj['valueCents'] !== null) {
    const cents = Number(obj['valueCents']);
    if (Number.isFinite(cents) && cents > 0) return cents / 100;
  }

  for (const key of ['value', 'price', 'currentPrice', 'current_price', 'marketPrice', 'market_price']) {
    const v = obj[key];
    if (v !== undefined && v !== null) {
      const parsed = parseBezelPrice(v as string | number);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/** Pluck a name string from various candidate keys. */
function extractName(obj: Record<string, unknown>): string {
  for (const key of ['name', 'title', 'label', 'brand', 'index', 'indexName', 'index_name']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/** Pluck absolute change from various candidate keys. */
function extractChange(obj: Record<string, unknown>): string | number | undefined {
  for (const key of ['change', 'dailyChange', 'daily_change', 'priceChange', 'price_change', 'delta']) {
    const v = obj[key];
    if (v !== undefined && v !== null) return v as string | number;
  }
  return undefined;
}

/** Pluck percentage change from various candidate keys. */
function extractChangePct(obj: Record<string, unknown>): string | number | undefined {
  for (const key of ['changePct', 'change_pct', 'changePct', 'pctChange', 'pct_change', 'changePercent', 'change_percent', 'dailyChangePct', 'daily_change_pct']) {
    const v = obj[key];
    if (v !== undefined && v !== null) return v as string | number;
  }
  return undefined;
}

/** Pluck volume from an entry. */
function extractVolume(obj: Record<string, unknown>): number | null {
  for (const key of ['volume', 'vol', 'tradeVolume', 'trade_volume']) {
    const v = obj[key];
    if (v !== undefined && v !== null) {
      const parsed = parseBezelPrice(v as string | number);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/**
 * Given an entry object and a slug, attempt to match and build a BezelNormalizedPrice.
 * The slug's first segment (e.g. "cartier" from "cartier-index") is checked against
 * the entry's name field (case-insensitive contains check).
 */
function buildNormalizedPrice(
  entry: Record<string, unknown>,
  slug: string,
  entityType: BezelEntityType,
  quality: DataSourceQuality,
  rawPayload: unknown,
): BezelNormalizedPrice | null {
  const name = extractName(entry);
  const price = extractValue(entry);

  if (price === null) return null;

  // Slug-matching: the first non-empty segment, e.g. "cartier" or "rolex"
  const slugKeyword = slug.split('-')[0].toLowerCase();
  if (slugKeyword && name && !name.toLowerCase().includes(slugKeyword)) {
    // This entry doesn't correspond to our slug — skip it
    return null;
  }

  // Change: prefer explicit pct field; fall back to parsing the change string
  const rawChange = extractChange(entry);
  const rawChangePct = extractChangePct(entry);

  let change: number | null = null;
  let changePct: number | null = null;

  if (rawChangePct !== undefined) {
    const parsed = parseBezelChange(rawChangePct);
    changePct = parsed.changePct ?? (typeof rawChangePct === 'number' && Number.isFinite(rawChangePct) ? rawChangePct : null);
  }

  if (rawChange !== undefined) {
    const parsed = parseBezelChange(rawChange);
    change = parsed.change;
    // If we didn't get a pct yet, use whatever parseBezelChange returned
    if (changePct === null) changePct = parsed.changePct;
  }

  return {
    slug,
    entityType,
    name: name || slug,
    price,
    dailyChange: change,
    dailyChangePct: changePct,
    volume: extractVolume(entry),
    capturedAt: new Date().toISOString(),
    dataSourceQuality: quality,
    rawPayload,
  };
}

/**
 * Try to extract an array of candidate entries from an unknown JSON response.
 * Checks: direct array, { data }, { indexes }, { results }, { items }, { entries },
 * or wraps a plain object in a single-element array.
 */
function extractCandidateArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((v) => v !== null && typeof v === 'object') as Record<string, unknown>[];
  }

  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;

    for (const key of ['data', 'indexes', 'results', 'items', 'entries', 'markets', 'prices']) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) {
        return candidate.filter((v) => v !== null && typeof v === 'object') as Record<string, unknown>[];
      }
    }

    // Treat the object itself as a single entry
    return [obj];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public normalizers
// ---------------------------------------------------------------------------

/**
 * Try to normalise an unknown JSON response as a Bezel index price for `slug`.
 *
 * Response shapes handled:
 *   - Array of { name, value, change, changePct, date }
 *   - { data: [...] }
 *   - { indexes: [...] }
 *   - { results: [...] }
 *   - Direct object with name/value fields
 *
 * The entry is matched to `slug` by checking whether entry.name (lowercased)
 * contains the first segment of the slug (e.g. "cartier" from "cartier-index").
 *
 * Returns null if no matching, parseable entry is found.
 */
export function normalizeBezelIndexResponse(
  raw: unknown,
  slug: string,
): BezelNormalizedPrice | null {
  try {
    const candidates = extractCandidateArray(raw);

    if (candidates.length === 0) {
      console.warn('[BezelNormalizer] normalizeBezelIndexResponse: no candidate entries in payload for slug:', slug);
      return null;
    }

    for (const entry of candidates) {
      const normalized = buildNormalizedPrice(
        entry,
        slug,
        'index',
        'frontend_network_capture',
        raw,
      );
      if (normalized !== null) return normalized;
    }

    // If slug-matching eliminated everything, try without the keyword filter
    // (useful when name fields are missing but value fields are present)
    for (const entry of candidates) {
      const price = extractValue(entry);
      if (price === null) continue;

      const name = extractName(entry) || slug;
      const rawChange = extractChange(entry);
      const rawChangePct = extractChangePct(entry);
      const { change, changePct } = rawChange !== undefined
        ? parseBezelChange(rawChange)
        : rawChangePct !== undefined
          ? parseBezelChange(rawChangePct)
          : { change: null, changePct: null };

      return {
        slug,
        entityType: 'index',
        name,
        price,
        dailyChange: change,
        dailyChangePct: changePct,
        volume: extractVolume(entry),
        capturedAt: new Date().toISOString(),
        dataSourceQuality: 'frontend_network_capture',
        rawPayload: raw,
      };
    }

    console.warn('[BezelNormalizer] normalizeBezelIndexResponse: could not extract price for slug:', slug, '— payload shape:', typeof raw);
    return null;
  } catch (err) {
    console.warn('[BezelNormalizer] normalizeBezelIndexResponse threw unexpectedly:', err);
    return null;
  }
}

/**
 * Try to normalise an unknown JSON response as a Bezel model price for `slug`.
 *
 * Handles the same multi-shape approach as normalizeBezelIndexResponse but
 * uses entityType='model'. Model pages typically return a single object
 * rather than an array.
 *
 * Returns null if no parseable price is found.
 */
export function normalizeBezelModelResponse(
  raw: unknown,
  slug: string,
): BezelNormalizedPrice | null {
  try {
    const candidates = extractCandidateArray(raw);

    if (candidates.length === 0) {
      console.warn('[BezelNormalizer] normalizeBezelModelResponse: no candidate entries for slug:', slug);
      return null;
    }

    // For model pages a single-object response is common — try each candidate
    for (const entry of candidates) {
      const price = extractValue(entry);
      if (price === null) continue;

      const name = extractName(entry) || slug;
      const rawChange = extractChange(entry);
      const rawChangePct = extractChangePct(entry);

      let change: number | null = null;
      let changePct: number | null = null;

      if (rawChange !== undefined) {
        const parsed = parseBezelChange(rawChange);
        change = parsed.change;
        changePct = parsed.changePct;
      }
      if (changePct === null && rawChangePct !== undefined) {
        const parsed = parseBezelChange(rawChangePct);
        changePct = parsed.changePct ?? (typeof rawChangePct === 'number' ? rawChangePct : null);
      }

      return {
        slug,
        entityType: 'model',
        name,
        price,
        dailyChange: change,
        dailyChangePct: changePct,
        volume: extractVolume(entry),
        capturedAt: new Date().toISOString(),
        dataSourceQuality: 'frontend_network_capture',
        rawPayload: raw,
      };
    }

    console.warn('[BezelNormalizer] normalizeBezelModelResponse: could not extract price for slug:', slug, '— payload shape:', typeof raw);
    return null;
  } catch (err) {
    console.warn('[BezelNormalizer] normalizeBezelModelResponse threw unexpectedly:', err);
    return null;
  }
}
