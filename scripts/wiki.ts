// The OSRS Wiki for the data builders: one fetch (throttled, retried, redirects followed) and one parser for each template the builders read, so
// every builder reads the wiki the same way and a fix to a parser reaches all of them. Needs a network; the app itself never calls it.

const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';
/** Pause between requests: the wiki asks bots to stay slow. */
const GAP_MS = 400;

export interface Pt { x: number; y: number; plane: number; label?: string }

let last = 0;
/** The article's wikitext; a redirect is followed. Throws on a missing page or after repeated server errors. */
export async function wikitext(page: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${API}?${new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', formatversion: '2', redirects: '1' })}`, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const json = (await res.json()) as { parse?: { wikitext: string }; error?: { info: string } };
      if (!json.parse) throw new Error(`${page}: ${json.error?.info ?? 'no page'}`);
      return json.parse.wikitext;
    }
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${page}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

/** Every {{Name ...}} of the text with its parameters (named ones by name, positional ones by 1, 2, ...); nested templates stay as text inside. */
export function templates(text: string, name: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const open = new RegExp(`\\{\\{\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?=[|}\\n])`, 'gi');
  for (const m of text.matchAll(open)) {
    let depth = 0;
    let end = -1;
    for (let i = m.index!; i < text.length - 1; i++) {
      const two = text.slice(i, i + 2);
      if (two === '{{' || two === '[[') { depth++; i++; } else if (two === '}}' || two === ']]') { depth--; i++; if (depth === 0) { end = i - 1; break; } }
    }
    if (end < 0) continue;
    const body = text.slice(m.index! + m[0].length, end);
    // Split at the top level only: a | inside {{...}} or [[...]] belongs to that.
    const parts: string[] = [];
    let cur = '';
    let d = 0;
    for (let i = 0; i < body.length; i++) {
      const two = body.slice(i, i + 2);
      if (two === '{{' || two === '[[') { d++; cur += two; i++; continue; }
      if (two === '}}' || two === ']]') { d--; cur += two; i++; continue; }
      if (body[i] === '|' && d === 0) { parts.push(cur); cur = ''; continue; }
      cur += body[i];
    }
    parts.push(cur);
    const params: Record<string, string> = {};
    let pos = 0;
    for (const p of parts.slice(1)) {
      const eq = /^\s*([^=|{}[\]]+?)\s*=([\s\S]*)$/.exec(p);
      if (eq) params[eq[1].trim()] = eq[2].trim();
      else params[String(++pos)] = p.trim();
    }
    out.push(params);
  }
  return out;
}

/** A number as the wiki writes it: "1,300", "37.5". NaN when it is not one. */
export const num = (s: string | undefined): number => Number((s ?? '').replace(/,/g, '').trim());

/** One line of a {{Skilling success chart}}: the low and high values of the skilling success formula and the level it starts at. */
export interface ChartLine { label: string; low: number; high: number; req: number }
/** Every {{Skilling success chart}} of the text, in page order; cascade: the lines are rolled in order, the best first. */
export function successCharts(text: string): { label: string; cascade: boolean; lines: ChartLine[] }[] {
  return templates(text, 'Skilling success chart').map((t) => {
    const lines: ChartLine[] = [];
    for (let i = 1; t[`low${i}`] !== undefined; i++) lines.push({ label: t[`label${i}`] ?? '', low: num(t[`low${i}`]), high: num(t[`high${i}`]), req: num(t[`req${i}`]) });
    return { label: t.label ?? '', cascade: /^yes$/i.test(t.cascade ?? ''), lines };
  });
}

/** Coordinates as a LocLine or ObjectLocLine writes them: "x:3285,y:3369" or "3085,3235", separated by |. */
export function pointsOf(params: Record<string, string>, plane: number): Pt[] {
  const out: Pt[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!/^\d+$/.test(k)) continue;
    const m = /^(?:x:)?(\d+),(?:y:)?(\d+)/.exec(v.trim());
    if (m) out.push({ x: Number(m[1]), y: Number(m[2]), plane });
  }
  return out;
}

/** The spawn lines of an article ({{LocLine}} for NPCs, {{ObjectLocLine}} for scenery): the location as written, members, plane and the tiles. */
export function locLines(text: string, kind: 'LocLine' | 'ObjectLocLine' = 'LocLine'): { location: string; members: boolean; plane: number; pts: Pt[] }[] {
  return templates(text, kind).map((t) => {
    const plane = Number(t.plane ?? 0) || 0;
    return { location: t.location ?? '', members: /^yes$/i.test(t.members ?? ''), plane, pts: pointsOf(t, plane) };
  });
}

/** The tile nearest the middle of a set of tiles: a spot that really is one of them. */
export function middleOf(pts: readonly Pt[]): Pt {
  const mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  return pts.reduce((a, p) => (chebyshev(p, mid) < chebyshev(a, mid) ? p : a));
}

export const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
