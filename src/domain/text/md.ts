// Inline guide markup: **bold**, `code`, [link](url).

export function stripMd(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Normalisation for search: case. */
export function fold(text: string): string {
  return text.toLowerCase();
}

const UK_FLOOR: Record<string, string> = { '0': 'Ground floor', '1': '1st floor', '2': '2nd floor', '3': '3rd floor' };

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#91': '[', '#93': ']', '#39': "'" };

/**
 * Wiki markup to plain text: [[A|B]] → B, {{FloorNumber|uk=1}} → "1st floor".
 * Bucket gives already expanded templates with HTML entities: "1st&nbsp;floor&#91;UK&#93;2nd&nbsp;floor&#91;US&#93;"
 * — this too is turned into "1st floor" (the game's own UK numbering; the US name is dropped).
 */
export function cleanWikiText(s: string): string {
  return s
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m)
    // The wiki sometimes gives a non-breaking space (U+00A0 or &#160;): without replacing it "floor[UK]" was not recognized.
    .replace(/&#160;|\u00a0/g, ' ')
    .replace(/\b(Ground|\d+(?:st|nd|rd|th)) floor\[UK\](?:Ground|\d+(?:st|nd|rd|th)) floor\[US\]/g,
      (_m, uk: string) => `${uk} floor`)
    .replace(/\{\{FloorNumber\|(?:[^}]*?\|)?uk=(\d)[^}]*\}\}/gi, (_m, n: string) => UK_FLOOR[n] ?? `${n} floor`)
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
