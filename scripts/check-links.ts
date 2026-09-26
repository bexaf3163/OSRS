// Проверяет, что все ссылки на вики из steps.json и f2p-items.json ведут на существующие статьи и файлы.
// Нужна сеть. Запуск: npm run check-links

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Step, WikiItemDetail } from '../src/types/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const steps = JSON.parse(readFileSync(`${root}src/data/steps.json`, 'utf8')) as Step[];
const items = JSON.parse(readFileSync(`${root}src/data/f2p-items.json`, 'utf8')) as WikiItemDetail[];
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';

/** Ссылка → заголовок страницы вики («File:…» для картинок). */
function titleOf(url: string): string | null {
  const page = url.match(/\/w\/([^#?]+)/);
  if (page) return decodeURIComponent(page[1]).replace(/_/g, ' ');
  const file = url.match(/\/images\/([^?#]+)/);
  if (file) return `File:${decodeURIComponent(file[1]).replace(/_/g, ' ')}`;
  return null;
}

const refs = new Map<string, Set<string>>();
const add = (where: string, url?: string) => {
  if (!url) return;
  const t = titleOf(url);
  if (!t) return;
  if (!refs.has(t)) refs.set(t, new Set());
  refs.get(t)!.add(where);
};

for (const s of steps) {
  add(s.id, s.wikiUrl);
  add(s.id, s.quickGuideUrl);
  add(s.id, s.imageUrl);
  add(`${s.id} NPC`, s.npc?.wikiUrl);
  if (s.mapUrl && !/World_map#\/m=\d+,\d+,\d$/.test(s.mapUrl)) console.log(`  ✗ ${s.id}: странная ссылка на карту ${s.mapUrl}`);
}
for (const i of items) {
  add(`предмет ${i.nameEn}`, i.wikiUrl);
  add(`иконка ${i.nameEn}`, i.iconUrl);
}

const titles = [...refs.keys()];
const missing: string[] = [];
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  const url = `${API}?${new URLSearchParams({ action: 'query', titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = (await res.json()) as { query: { pages: { title: string; missing?: boolean }[]; normalized?: { from: string; to: string }[] } };
  for (const p of data.query.pages) if (p.missing) missing.push(p.title);
  await new Promise((r) => setTimeout(r, 400));
}

console.log(`Проверено ссылок на вики: ${titles.length}`);
if (missing.length) {
  for (const t of missing) {
    const from = [...(refs.get(t) ?? refs.get(t.replace(/^File:/, 'File:')) ?? [])].join(', ');
    console.log(`  ✗ нет на вики: ${t}${from ? ` — ${from}` : ''}`);
  }
  process.exit(1);
}
console.log('  ✓ все статьи и файлы существуют');
