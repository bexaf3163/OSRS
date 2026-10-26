// Builds src/data/styleGear.json from the OSRS Wiki: what to wear for magic and ranged in the free version — the block
// "Recommended equipment" of the articles "Free-to-play Magic training" and "Free-to-play Ranged training". It needs a network.
// Run: npm run build-style-gear. In the wiki block the variants of each slot go from the best to the available; next to them in <small> are the requirements.
// Only the markup parsing is from us.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wikitext } from './wiki.ts';
import { parseEquipment } from './style-gear-parse.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/styleGear.json`;


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
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
