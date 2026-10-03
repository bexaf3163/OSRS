// Собирает src/data/styleGear.json с OSRS Wiki: что носить для магии и стрельбы в бесплатной версии — блок
// «Recommended equipment» статей «Free-to-play Magic training» и «Free-to-play Ranged training». Нужна сеть.
// Запуск: npm run build-style-gear. В блоке вики варианты каждого слота идут от лучшего к доступному; рядом в <small> — требования.
// От себя здесь только разбор разметки.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEquipment } from './style-gear-parse.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${root}src/data/styleGear.json`;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';

async function wikitext(page: string): Promise<string> {
  const url = `https://oldschool.runescape.wiki/api.php?${new URLSearchParams({ action: 'parse', page, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${page}: ${res.status}`);
  return ((await res.json()) as { parse: { wikitext: string } }).parse.wikitext;
}

const pages = { magic: 'Free-to-play Magic training', ranged: 'Free-to-play Ranged training' } as const;
const out: Record<string, unknown> = {
  source: 'OSRS Wiki: «Recommended equipment» в статьях Free-to-play Magic training и Free-to-play Ranged training',
  generatedAt: new Date().toISOString().slice(0, 10),
};
for (const [style, page] of Object.entries(pages)) {
  const slots = parseEquipment(await wikitext(page));
  console.log(`${style}: слотов ${Object.keys(slots).length}, вариантов ${Object.values(slots).reduce((n, s) => n + s.length, 0)}`);
  out[style] = slots;
}
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
