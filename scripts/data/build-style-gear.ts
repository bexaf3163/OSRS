// Builds src/data/generated/styleGear.json from the OSRS Wiki: what to wear for magic and ranged in the free version — the block
// "Recommended equipment" of the articles "Free-to-play Magic training" and "Free-to-play Ranged training". It needs a network.
// Run: npm run build-style-gear. In the wiki block the variants of each slot go from the best to the available; next to them in <small> are the requirements.
// Only the markup parsing is from us.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wikitables, wikitext } from './wiki.ts';
import { parseEquipment } from './style-gear-parse.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${root}src/data/generated/styleGear.json`;


const pages = { magic: 'Free-to-play Magic training', ranged: 'Free-to-play Ranged training' } as const;
const out: Record<string, unknown> = {
  source: 'OSRS Wiki: "Recommended equipment" in the articles Free-to-play Magic training and Free-to-play Ranged training',
  generatedAt: new Date().toISOString().slice(0, 10),
};
for (const [style, page] of Object.entries(pages)) {
  const slots = parseEquipment(await wikitext(page));
  console.log(`${style}: slots ${Object.keys(slots).length}, variants ${Object.values(slots).reduce((n, s) => n + s.length, 0)}`);
  out[style] = slots;
}
// Members shortbows from the Bow article's table (level, the best arrow, members), ahead of the free ones. A new arrow is noted with
// the lowest bow that fires it, so no free bow gets it; a members bow fires every arrow up to its own (StyleOption.upTo).
const MEMBERS_BOWS = ['Yew shortbow', 'Magic shortbow'];
const arrowName = (s: string) => s.replace(/s$/, '').replace(/^./, (c) => c.toUpperCase());
const bowRows = wikitables(await wikitext('Bow')).flatMap((t) => t.rows);
const added = MEMBERS_BOWS.map((bow) => {
  const row = bowRows.find((r) => r.some((c) => c.includes(`{{plinkt|${bow}}}`)));
  const level = Number(row?.[0]), upTo = /Up to \[\[([^\]|]+)/.exec(row?.[3] ?? '')?.[1];
  if (!row || !(level > 0) || !upTo || !/yes/i.test(row[4] ?? '')) throw new Error(`Bow article: no level, best arrow or members cell for ${bow}: ${JSON.stringify(row)}`);
  return { bow, level, upTo: arrowName(upTo) };
}).sort((a, b) => b.level - a.level);
const ranged = out.ranged as Record<string, { names: string[]; note?: string }[]>;
ranged.weapon.unshift(...added.map((b) => ({ names: [b.bow], reqs: [{ skill: 'ranged', level: b.level }], quests: [], members: true, upTo: b.upTo })));
const known = new Set(ranged.ammo.flatMap((o) => o.names));
ranged.ammo.unshift(...added.filter((b) => !known.has(b.upTo)).map((b) => ({ names: [b.upTo], reqs: [], quests: [], note: `(${b.bow} or higher)` })));
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
