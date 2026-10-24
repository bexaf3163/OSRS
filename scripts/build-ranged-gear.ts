// Builds src/data/rangedGear.json from the OSRS Wiki: the free-to-play bows, arrows and ranged armour with what the whole-goal arrow count
// (lib/rangedAmmo.ts) needs of them: ranged attack and ranged strength bonuses, and a weapon's attack speed. gear.json keeps the melee pieces
// (their ranged attack bonus, often negative for metal armour, is read from there). It needs a network. Run: npm run build-ranged-gear.
// No numbers of our own: only the Infobox Bonuses of each article.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/rangedGear.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';

/** The bows and arrows of styleGear.json's ranged list and their longbows (rangedLoadout.ts), and the free ranged armour and amulets. */
const PAGES = [
  'Shortbow', 'Longbow', 'Oak shortbow', 'Oak longbow', 'Willow shortbow', 'Willow longbow', 'Maple shortbow', 'Maple longbow',
  'Bronze arrow', 'Iron arrow', 'Steel arrow', 'Mithril arrow', 'Adamant arrow',
  'Coif', 'Leather cowl', 'Leather body', 'Hardleather body', 'Studded body', "Green d'hide body", 'Leather chaps', 'Studded chaps',
  "Green d'hide chaps", 'Leather vambraces', "Green d'hide vambraces", 'Leather gloves', 'Leather boots', 'Amulet of accuracy', 'Amulet of power',
];

let last = 0;
async function wikitext(page: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 400 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${API}?${new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', formatversion: '2', redirects: '1' })}`, { headers: { 'User-Agent': UA } });
    if (res.ok) return ((await res.json()) as { parse: { wikitext: string } }).parse.wikitext;
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${page}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}

/** The bonuses as written: "|arange = +8"; a versioned article ("|arange1 = …") gives its first version. */
function fields(text: string): Map<string, string> {
  const box = /\{\{Infobox Bonuses([\s\S]*?)\n\}\}/.exec(text)?.[1] ?? '';
  const out = new Map<string, string>();
  for (const m of box.matchAll(/^\|\s*([a-z ]+?)(1?)\s*=\s*(.*)$/gim)) if (!out.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), m[3].trim());
  return out;
}

const num = (v: string | undefined): number | null => {
  const m = /^[+-]?\d+/.exec((v ?? '').replace(/,/g, '').trim());
  return m ? Number(m[0]) : null;
};

export interface RangedGearItem {
  name: string;
  /** The infobox slot: weapon, 2h, ammo, head, body, legs, hands, feet, neck. */
  slot: string;
  rangedAttack: number;
  rangedStrength: number;
  /** A weapon's ticks between attacks (before Rapid). */
  speed?: number;
}

const items: RangedGearItem[] = [];
const problems: string[] = [];
for (const page of PAGES) {
  const f = fields(await wikitext(page));
  const rangedAttack = num(f.get('arange'));
  const rangedStrength = num(f.get('rstr'));
  const slot = (f.get('slot') ?? '').toLowerCase();
  if (rangedAttack === null || rangedStrength === null || !slot) { problems.push(`${page}: no ${[rangedAttack === null && 'arange', rangedStrength === null && 'rstr', !slot && 'slot'].filter(Boolean).join(', ')}`); continue; }
  const speed = num(f.get('speed'));
  items.push({ name: page, slot, rangedAttack, rangedStrength, ...(speed !== null && /weapon|2h/.test(slot) ? { speed } : {}) });
}
if (problems.length) {
  console.error(`rangedGear.json was not written:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
writeFileSync(OUT, JSON.stringify({
  source: 'OSRS Wiki: Infobox Bonuses of each article (scripts/build-ranged-gear.ts)',
  generatedAt: new Date().toISOString().slice(0, 10),
  items,
}, null, 2) + '\n');
console.log(`Written ${items.length} items to ${OUT}`);
