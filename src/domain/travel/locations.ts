// Place names to coordinates from the bundled dictionary (src/data/generated/majorLocations.json): exact, alias, normalized,
// substring and fuzzy matches. The wiki lookup with its cache lives in services/locationResolver.ts.

import { majorLocationsJson as majorLocations } from '../../data';
import type { WikiPoint } from '../../services/wikiApi';
import { cleanWikiText } from '../text/md';

export interface ResolvedPoint extends WikiPoint {
  label: string;
  source: 'dictionary' | 'wiki';
  /** How it was found: the exact name, a synonym, without case, by mention, a similar spelling, a spawn, an article. */
  match: 'exact' | 'alias' | 'normalized' | 'substring' | 'fuzzy' | 'spawn' | 'article';
  /** The wiki article whose map gave the point. */
  page?: string;
}

export interface SearchFallback {
  source: 'search-fallback';
  label: string;
  searchUrl: string;
}

export type ResolvedLocation = ResolvedPoint | SearchFallback;

/** What else is known about the place: the shop and seller from the shop table, the item page for a spawn. */
export interface ResolveContext {
  shopName?: string;
  itemPage?: string;
  itemName?: string;
}

interface DictEntry extends WikiPoint {
  label: string;
  kind: string;
  aliases?: string[];
  page: string;
}

const DICT = (majorLocations as { locations: Record<string, DictEntry> }).locations;

/** Service words of place lines: "shop", "by", "south of"… Meaningful words of names are not touched. */
const STOP = /\b(?:shop|store|by|near|the|of|in|at|north|south|east|west|north-east|north-west|south-east|south-west|outside|inside|upstairs|downstairs|behind)\b/g;

/** A name without case, floor and members marks, punctuation and service words. */
export function normalizeName(s: string): string {
  return cleanWikiText(s)
    .toLowerCase()
    .replace(/\((?:members only|[^)]*floor[^)]*)\)/g, ' ')
    .replace(/\b(?:ground|\d+(?:st|nd|rd|th)) floor\b/g, ' ')
    .replace(/[’`]/g, "'")
    .replace(/[.,:;!?()"-]/g, ' ')
    .replace(/'s\b/g, '')
    .replace(/'/g, '')
    .replace(STOP, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexKey {
  key: string;
  norm: string;
  entry: DictEntry;
  alias: boolean;
}

const INDEX: IndexKey[] = Object.entries(DICT).flatMap(([name, entry]) => [
  { key: name, norm: normalizeName(name), entry, alias: false },
  ...(entry.aliases ?? []).map((a) => ({ key: a, norm: normalizeName(a), entry, alias: true })),
]).filter((k) => k.norm.length > 0);

function point(entry: DictEntry, match: ResolvedPoint['match']): ResolvedPoint {
  return { x: entry.x, y: entry.y, plane: entry.plane, label: entry.label, source: 'dictionary', match, page: entry.page };
}

/** An exact match: the name, a synonym, then without case and service words. */
export function matchStrict(text: string): ResolvedPoint | null {
  const raw = text.trim();
  if (!raw) return null;
  const exact = INDEX.find((k) => k.key === raw);
  if (exact) return point(exact.entry, exact.alias ? 'alias' : 'exact');
  const lower = raw.toLowerCase();
  const ci = INDEX.find((k) => k.key.toLowerCase() === lower);
  if (ci) return point(ci.entry, ci.alias ? 'alias' : 'exact');
  const norm = normalizeName(raw);
  const n = norm ? INDEX.find((k) => k.norm === norm) : undefined;
  return n ? point(n.entry, 'normalized') : null;
}

/** The Levenshtein distance — for typos and different spellings ("Draynor Vilage"). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * An approximate match: the longest known place mentioned in the line as whole words,
 * otherwise a similar spelling (no more than one mistake per five letters).
 */
export function matchLoose(text: string): ResolvedPoint | null {
  const norm = normalizeName(text);
  if (!norm) return null;
  const padded = ` ${norm} `;
  const contained = INDEX.filter((k) => k.norm.length >= 3 && padded.includes(` ${k.norm} `))
    .sort((a, b) => b.norm.length - a.norm.length);
  if (contained.length) return point(contained[0].entry, 'substring');
  let best: { k: IndexKey; d: number } | null = null;
  for (const k of INDEX) {
    const d = levenshtein(norm, k.norm);
    if (d <= Math.max(1, Math.floor(k.norm.length / 5)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? point(best.k.entry, 'fuzzy') : null;
}

export function isPoint(r: ResolvedLocation): r is ResolvedPoint {
  return r.source !== 'search-fallback';
}
