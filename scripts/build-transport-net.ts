// Builds src/data/transportNet.json — the transport networks the route planner (src/lib/travel.ts) uses besides the hand-written transport.json:
// fairy rings (code and tile), charter ship ports with the full fare table, and the teleport tablets.
// It needs a network. Run: npm run build-transport-net (a few seconds).
//
// Nothing here is typed from memory: the rings come from the {{Map}} pins of the "Fairy ring" article, the ports and requirements from the
// "Charter ship" map, the fares from {{Charter ship fares}}. A row that cannot be read is skipped and counted, never guessed.
// By hand here are only the tablets (item name -> the spell whose destination it shares).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchWikitext } from '../src/services/wikiApi.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/transportNet.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const fetchFn = (url: string) => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });

/** [[Link|Shown]] -> Shown, [[Link]] -> Link, '''bold''' and templates removed. */
function plain(s: string): string {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FairyRing { code: string; x: number; y: number; place: string; note: string; underground: boolean }

function parseFairyRings(text: string): { rings: FairyRing[]; skipped: string[] } {
  const rings: FairyRing[] = [];
  const skipped: string[] = [];
  // Each ring is a table row: |- id="AIQ" | code | {{Map|...|x,y|...}} | location | notes
  for (const row of text.split(/\n\|- id="/).slice(1)) {
    const code = /^([A-Z]{3})"/.exec(row)?.[1];
    if (!code) continue;
    const pin = /\{\{Map\|[^}]*?\|(\d{3,5}),(\d{3,5})\|/.exec(row);
    const cells = row.split(/\n\|(?!\||-)/).slice(1);
    const place = cells[2] ? plain(cells[2]) : '';
    if (!pin || !place) {
      skipped.push(code);
      continue;
    }
    const y = Number(pin[2]);
    const note = cells[3] ? plain(cells[3]) : '';
    // The first sentence that names a condition, if there is one.
    const cond = note.split(/(?<=[.!?])\s+/).find((t) => /\b(Requires?|Completion|Having|after|must|needed)\b/i.test(t)) ?? '';
    rings.push({ code, x: Number(pin[1]), y, place, note: cond.slice(0, 200), underground: y >= 4000 });
  }
  return { rings, skipped };
}

interface Port { id: string; name: string; x: number; y: number; note: string }

function parseCharter(map: string, fares: string): { ports: Port[]; fares: (number | null)[][]; skipped: string[] } {
  const ports: Port[] = [];
  const skipped: string[] = [];
  for (const line of map.split('\n')) {
    const m = /^\|x:(\d+),y:(\d+),title:(.+?),desc:(.*?)(?:,icon:\w+)?$/.exec(line.trim());
    if (!m) continue;
    const name = plain(m[3]);
    ports.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, x: Number(m[1]), y: Number(m[2]), note: plain(m[4]) });
  }
  // The fare table: the header row names the destinations, each following row starts with the origin.
  const header = fares.split('\n|-\n')[1] ?? '';
  const order = [...header.matchAll(/^!\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/gm)].map((x) => plain(x[1]));
  const matrix: (number | null)[][] = [];
  const rows = fares.split('\n|-\n').slice(2);
  const originOrder: string[] = [];
  for (const r of rows) {
    const origin = /!\s*(?:style="[^"]*"\s*\|)?\s*\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/.exec(r)?.[1];
    if (!origin) continue;
    const cells = [...r.matchAll(/^\|(.*)$/gm)].map((c) => c[1].trim());
    if (cells.length !== order.length) {
      skipped.push(plain(origin));
      continue;
    }
    originOrder.push(plain(origin));
    matrix.push(cells.map((c) => (/^\{\{NA\}\}/.test(c) ? null : Number(c.replace(/[,*]/g, '')) || null)));
  }
  // Put the matrix in the order of the ports list: fares[i][j] is from ports[i] to ports[j]; null — no such route.
  const index = (name: string) => ports.findIndex((p) => p.name === name);
  const out: (number | null)[][] = ports.map(() => ports.map(() => null));
  originOrder.forEach((o, ri) => {
    const i = index(o);
    if (i < 0) return;
    order.forEach((d, ci) => {
      const j = index(d);
      if (j >= 0) out[i][j] = matrix[ri][ci];
    });
  });
  return { ports, fares: out, skipped };
}

async function main() {
  const fr = await fetchWikitext(fetchFn, 'Fairy ring');
  const ch = await fetchWikitext(fetchFn, 'Charter ship');
  const ff = await fetchWikitext(fetchFn, 'Template:Charter ship fares');
  if (!fr || !ch || !ff) throw new Error('A wiki page did not load: nothing was written.');
  const rings = parseFairyRings(fr.text);
  const mapBlock = /\{\{Map\n([\s\S]*?)\n\|mtype=pin/.exec(ch.text)?.[1] ?? '';
  const charter = parseCharter(mapBlock, ff.text);
  if (rings.rings.length < 45) throw new Error(`Only ${rings.rings.length} fairy rings were read: the article changed, nothing was written.`);
  if (charter.ports.length < 15) throw new Error(`Only ${charter.ports.length} charter ports were read: the article changed, nothing was written.`);

  const data = {
    source: 'OSRS Wiki: "Fairy ring" ({{Map}} pins), "Charter ship" (map), Template:Charter ship fares',
    checked: new Date().toISOString().slice(0, 10),
    note: 'Generated by scripts/build-transport-net.ts; do not edit by hand. Tiles are the wiki pins (x, y); y >= 4000 is underground. A fare of null means there is no such route. The tablets are the only hand-written part.',
    fairyRings: rings.rings,
    charter: { ports: charter.ports, fares: charter.fares },
    tablets: [
      { id: 'varrock-tab', item: 'Varrock teleport', spell: 'varrock-teleport' },
      { id: 'lumbridge-tab', item: 'Lumbridge teleport', spell: 'lumbridge-teleport' },
      { id: 'falador-tab', item: 'Falador teleport', spell: 'falador-teleport' },
    ],
  };
  writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`fairy rings: ${rings.rings.length} (${rings.rings.filter((r) => r.underground).length} underground), skipped: ${rings.skipped.join(', ') || 'none'}`);
  console.log(`charter ports: ${charter.ports.length}, fare rows skipped: ${charter.skipped.join(', ') || 'none'}`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
