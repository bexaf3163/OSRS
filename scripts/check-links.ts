// Проверяет, что все ссылки на вики из steps.json, f2p-items.json и osrs-guide.md ведут на существующие статьи и файлы.
// Нужна сеть. Запуск: npm run check-links

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Step, WikiItemDetail } from '../src/types/index.ts';
import { MAP_VERSION, tileUrl } from '../src/lib/map.ts';
import type { NpcSpot } from '../src/lib/stepPlaces.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const steps = JSON.parse(readFileSync(`${root}src/data/steps.json`, 'utf8')) as Step[];
const items = JSON.parse(readFileSync(`${root}src/data/f2p-items.json`, 'utf8')) as WikiItemDetail[];
const guide = readFileSync(`${root}osrs-guide.md`, 'utf8');
const npcs = (JSON.parse(readFileSync(`${root}src/data/npcLocations.json`, 'utf8')) as { npcs: Record<string, NpcSpot[]> }).npcs;
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
// Где стоят NPC шагов: статья вики, с карты которой взята точка.
for (const [name, rows] of Object.entries(npcs)) for (const r of rows) add(`NPC ${name}`, `https://oldschool.runescape.wiki/w/${encodeURIComponent(r.page.replace(/ /g, '_'))}`);
// Гайд: ссылки в тексте — на навыки (и подписки), квесты, гайды прокачки, по которым сверялся план.
for (const [, url] of guide.matchAll(/\]\((https:\/\/oldschool\.runescape\.wiki\/[^)\s]+)\)/g)) add('гайд', url);

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

// Тайлы карты: превью и карта мира берут их с maps.runescape.wiki по версии рендера из src/lib/map.ts.
const mapProblems: string[] = [];
const planes = new Set([...steps.flatMap((s) => [s.mapLocation, ...(s.resourceSpots ?? [])]).filter(Boolean).map((p) => p!.plane),
  ...Object.values(npcs).flat().map((r) => r.plane)]);
for (const plane of planes) {
  // Тайл Lumbridge на масштабе 2 — есть на любом этаже.
  const res = await fetch(tileUrl(2, plane, 50, 50), { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) mapProblems.push(`тайл этажа ${plane}: HTTP ${res.status}`);
}
// Вики сама рисует превью карт из тайлов своей текущей версии — сверяемся с ней.
const page = await (await fetch('https://oldschool.runescape.wiki/w/Lumbridge', { headers: { 'User-Agent': UA } })).text();
const current = page.match(/maps\.runescape\.wiki\/osrs\/versions\/([\w-]+)\/tiles/)?.[1];
console.log(`Тайлы карты: версия ${MAP_VERSION}, на вики сейчас ${current ?? 'не найдена'}, этажей в маршруте ${planes.size}`);
if (mapProblems.length) for (const m of mapProblems) console.log(`  ✗ ${m}`);
else console.log('  ✓ тайлы отдаются');
if (current && current !== MAP_VERSION) console.log(`  ! вики перешла на ${current} — обнови MAP_VERSION в src/lib/map.ts (старые тайлы пока работают)`);

console.log(`Проверено ссылок на вики: ${titles.length}`);
if (missing.length || mapProblems.length) {
  for (const t of missing) {
    const from = [...(refs.get(t) ?? refs.get(t.replace(/^File:/, 'File:')) ?? [])].join(', ');
    console.log(`  ✗ нет на вики: ${t}${from ? ` — ${from}` : ''}`);
  }
  process.exit(1);
}
console.log('  ✓ все статьи и файлы существуют');
