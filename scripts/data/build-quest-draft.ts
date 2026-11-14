// Drafts one quest from Quest Helper and the OSRS Wiki into src/data/drafts/ (see quest-draft.ts). Needs a network,
// Python 3 and the Quest Helper sources (tools/qh-machines: python qhm/fetch_qh.py, python qhm/dump_consts.py).
//   npm run quest-draft -- "Druidic Ritual"          add --force to rebuild a draft that was already edited
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wikiArticle } from './wiki.ts';
import type { WikiItemDetail } from '../../src/types/index.ts';
import { fetchItemDetail, type MappingEntry } from '../../src/services/wikiApi.ts';
import { buildDraft, cardItems, type QhFacts } from './quest-draft.ts';

const title = process.argv[2];
if (!title) throw new Error('usage: npm run quest-draft -- "<Wiki quest title>" [--force]');
const root = fileURLToPath(new URL('../..', import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(`${root}${path}`, 'utf8'));
const dir = `${root}src/data/drafts/`;
const slug = title.replace(/[^A-Za-z0-9]+/g, '');
const file = `${dir}${slug}.json`;
if (existsSync(file) && !process.argv.includes('--force')) throw new Error(`${file} exists: its edits would be lost (--force rebuilds it)`);
mkdirSync(dir, { recursive: true });
execFileSync('python', [`${root}tools/qh-machines/qhm/draft.py`, title, `${dir}${slug}.qh.json`], { stdio: 'inherit' });
const qh = json(`src/data/drafts/${slug}.qh.json`) as QhFacts;
const article = await wikiArticle(title);
const guide = await wikiArticle(`${title}/Quick guide`).catch(() => null);
// Item facts: the item database first, the item's own Wiki card for the rest (as npm run build-items reads it).
const items = new Map((json('src/data/generated/f2p-items.json') as WikiItemDetail[]).map((i) => [i.nameEn.toLowerCase(), i]));
const fetchFn = (url: string) => fetch(url, { headers: { 'User-Agent': 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)' } });
const mapping = new Map(((await (await fetchFn('https://prices.runescape.wiki/api/v1/osrs/mapping')).json()) as MappingEntry[]).map((m) => [m.id, m]));
for (const name of cardItems(article)) {
  if (items.has(name.toLowerCase())) continue;
  const detail = await fetchItemDetail(fetchFn, name, (id) => mapping.get(id)).catch(() => null);
  if (detail) items.set(name.toLowerCase(), detail);
}
const foes = new Set((json('src/data/generated/combatFoes.json') as { foes: { name: string }[] }).foes.map((f) => f.name));
const draft = buildDraft({ qh, article, guide, retrievedAt: new Date().toISOString(), items, foes, tradeable: new Set(mapping.keys()) });
writeFileSync(file, JSON.stringify(draft, null, 1) + '\n');
const lines = draft.stages.stages.reduce((n, s) => n + s.do.length, 0);
console.log(`${draft.quest}: ${draft.stages.stages.length} stages, ${lines} lines, ${draft.step.itemsRequired.length} items, ${draft.unknown.length} unknown -> ${file}`);
