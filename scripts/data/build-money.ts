// Builds src/data/generated/fundingWiki.json from the OSRS Wiki: every free-to-play money-making guide ("Money making guide/
// Free-to-play") that the hand-modelled catalogue (authored/fundingMethods.json) does not cover and the coverage ledger does not
// // exclude, as a funding method the evaluator judges like any other. It needs a network. Run: npm run build-money (a few minutes).
// The levels the card lists gate the method, because its pace is measured at them; so does a combat card's, which keeps the wiki pace.
//
// Only the wiki's {{Mmgtable}} is read: the pace (kills or items an hour), inputs and outputs, levels, quests and place. No price is
// stored: the app values the flows at live exchange prices, so the order of the methods follows the market, not the build date.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Flow, FundingMethod, GuideAction, Place, Requirement } from '../../src/domain/economy/funding/types.ts';
import { articleMapPoint, mapTemplatePoints, representativePoint, templates, type WikiPoint } from '../../src/services/wikiApi.ts';
import { detailsOf, mmgFields, parseSkillsHtml, plain, wikiPlain } from './money-parse.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${root}src/data/generated/fundingWiki.json`;
const read = <T>(path: string): T => JSON.parse(readFileSync(`${root}${path}`, 'utf8')) as T;
const UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)';
const API = 'https://oldschool.runescape.wiki/api.php';
const TODAY = new Date().toISOString().slice(0, 10);

let last = 0;
async function getJson(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + 400 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
}
const parse = (params: Record<string, string>) =>
  getJson(`${API}?${new URLSearchParams({ action: 'parse', format: 'json', formatversion: '2', redirects: '1', ...params })}`)
    .then((d) => d.parse as { title: string; text?: string; wikitext?: string; revid?: number } | undefined);
const pages = new Map<string, Promise<{ title: string; text: string; revid?: number } | null>>();
const wikitext = (page: string) => {
  if (!pages.has(page)) pages.set(page, parse({ page, prop: 'wikitext|revid' })
    .then((p) => (p?.wikitext ? { title: p.title, text: p.wikitext, revid: p.revid } : null)).catch(() => null));
  return pages.get(page)!;
};
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const links = (s: string) => [...s.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()).filter((l) => !/^(File|Category):/i.test(l));

// --- What the build already knows: the ledger, the hand-modelled methods, items, places
const coverage = read<{ entries: { id: string }[] }>('src/data/authored/fundingCoverage.json');
const places = read<{ locations: Record<string, WikiPoint & { label: string; kind: string }> }>('src/data/generated/majorLocations.json').locations;
const BANKS = Object.entries(places).filter(([name, p]) => p.kind === 'bank' || name === 'Grand Exchange')
  .map(([name, p]) => ({ x: p.x, y: p.y, plane: p.plane, label: name }));
const mapping = await fetch('https://prices.runescape.wiki/api/v1/osrs/mapping', { headers: { 'User-Agent': UA } })
  .then((r) => r.json() as Promise<{ id: number; name: string }[]>);
const ITEMS = new Map(mapping.map((m) => [m.name.toLowerCase(), m]));
const category = async (name: string) => new Set((await getJson(`${API}?${new URLSearchParams({ action: 'query', list: 'categorymembers', cmtitle: name, cmlimit: '500', format: 'json', formatversion: '2' })}`)
  .then((d) => (d.query as { categorymembers: { title: string }[] }).categorymembers)).map((m) => m.title));
const QUESTS = await category('Category:Free-to-play quests');
const MINIQUESTS = await category('Category:Miniquests');
// shortcut: stackability by name (runes, ammunition, coins); replace with the item infobox if a noted product appears.
const STACKS = /(^coins$| rune$|arrows?$|bolts$|darts?$|knives$|seeds?$)/i;

/** A wiki quantity: a number or arithmetic of them ("9*(3/128)"); null when it is anything else. */
function quantity(s: string | undefined): number | null {
  const t = (s ?? '').replace(/<!--.*?-->/gs, '').replace(/\{\{#expr:([^{}]*)\}\}/gi, '($1)').replace(/,/g, '').replace(/\s/g, '');
  if (!t || !/^[\d.+\-*/()]+$/.test(t)) return null;
  const n = Number(Function(`return (${t})`)());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A "whichever pays most" card ({{MaxPrice|a|b}}, {{#ifexpr: price test | a | b}}) is built with its first option,
 * which the guide shows first; the evaluator values it at live prices. */
function firstOption(s: string): string {
  for (let i = s.search(/\{\{(MaxPrice|#ifexpr:)/i); i >= 0; i = s.search(/\{\{(MaxPrice|#ifexpr:)/i)) {
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s.startsWith('{{', j)) { depth++; j++; } else if (s.startsWith('}}', j)) { depth--; j++; if (!depth) break; }
    }
    const parts = [''];
    let d = 0;
    for (const ch of s.slice(i + 2, j - 1)) {
      d += Number(ch === '{' || ch === '[') - Number(ch === '}' || ch === ']');
      if (ch === '|' && d === 0) parts.push(''); else parts[parts.length - 1] += ch;
    }
    s = s.slice(0, i) + (parts.slice(1).find((p) => !/^\s*\w+\s*=/.test(p))?.trim() ?? '') + s.slice(j + 1);
  }
  return s;
}

/** An expected amount per unit as a flow: at 1/16 or more it is counted on, below that it is a drop chance (upside). */
// The app's own item database names an item the same everywhere: a rename on the price list (Rune sword → Rune shortsword) does not split it.
const OWN = new Map(read<{ id: number; nameEn: string }[]>('src/data/generated/f2p-items.json').map((i) => [i.id, i.nameEn]));

/** "steps 1-4" → "steps 2-5" when one step stands before the guide's own list. */
const shiftSteps = (text: string, by: number) => (by ? text.replace(/\b(steps?)\s+(\d+)(?:\s*([-–]|to|and)\s*(\d+))?/gi,
  (_, w: string, a: string, sep?: string, b?: string) => `${w} ${Number(a) + by}${b ? `${sep === '-' || sep === '–' ? '-' : ` ${sep} `}${Number(b) + by}` : ''}`) : text);

function flowOf(name: string, perUnit: number): Flow | null {
  const item = name.toLowerCase() === 'coins' ? { id: 995, name: 'Coins' } : ITEMS.get(name.toLowerCase());
  if (!item || !(perUnit > 0)) return null;
  const stack = STACKS.test(item.name) ? { stack: true } : {};
  const ref = { id: item.id, name: OWN.get(item.id) ?? item.name };
  return perUnit >= 1 / 16
    ? { item: ref, qty: Math.round(perUnit * 1e4) / 1e4, ...stack }
    : { item: ref, qty: 1, chance: [1, Math.round(1 / perUnit)], ...stack };
}

const overworld = (p: WikiPoint) => ({ x: p.x, y: p.y > 6400 ? p.y - 6400 : p.y });
const distance = (a: WikiPoint, b: WikiPoint) => {
  const [p, q] = [overworld(a), overworld(b)];
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
};

/** Where the work is: the monster's spawn named by the guide, else the map of the guide or of the place it links. */
async function spotOf(location: string, foe: string | null, guide: string): Promise<WikiPoint | null> {
  const named = links(location);
  if (foe) {
    const page = await wikitext(foe);
    const lines = page ? templates(page.text, 'LocLine') : [];
    const free = lines.filter((b) => !/\|\s*members\s*=\s*yes/i.test(b));
    const body = free.find((b) => named.some((n) => b.toLowerCase().includes(n.toLowerCase()))) ?? free[0];
    const point = body ? representativePoint(mapTemplatePoints(body)) : null;
    if (point) return point;
  }
  const own = articleMapPoint(guide);
  if (own) return own;
  for (const n of named) {
    const page = await wikitext(n);
    const point = page && articleMapPoint(page.text);
    if (point) return point;
  }
  const text = plain(wikiPlain(location)).toLowerCase();
  const known = Object.keys(places).find((n) => text.includes(n.toLowerCase()));
  // Work done at any bank (alching, superheating, a firecycle) has no place of its own: the Grand Exchange is used.
  return known ? places[known] : !text || /\bbank/.test(text) ? places['Grand Exchange'] : null;
}

// --- 1. The list: the name, the members column and the rendered levels cell
const listHtml = (await parse({ page: 'Money_making_guide/Free-to-play', prop: 'text' }))!.text!;
const entries: { title: string; page: string; members: boolean; skillsHtml: string }[] = [];
for (const [, row] of listHtml.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
  const cells = [...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((m) => m[1]);
  const href = cells.length >= 6 && /href="\/w\/([^"#]+)"/.exec(cells[0]);
  if (!href || /Hourly profit/i.test(cells[1])) continue;
  entries.push({ title: plain(cells[0]), page: decodeURIComponent(href[1]).replace(/_/g, ' '), members: plain(cells[5]).length > 0, skillsHtml: cells[2] });
}
console.log(`In the list: ${entries.length}`);
// The list shows a guide only while today's prices put it there, but the app ranks every method by live prices itself: a method built
// before stays in the catalogue while its guide page exists, with its levels from the last list that showed it.
const before = (() => { try { return read<{ methods: FundingMethod[] }>('src/data/generated/fundingWiki.json').methods; } catch { return []; } })();
const kept = new Map<string, Requirement[]>();
for (const m of before) {
  const page = m.sources[0]?.title;
  if (!page || entries.some((e) => e.page === page || slug(e.title) === m.id)) continue;
  entries.push({ title: m.title, page, members: false, skillsHtml: '' });
  kept.set(m.id, m.requirements.filter((r) => r.kind === 'level'));
}
if (kept.size) console.log(`Kept from the last build (not in today's list): ${[...kept.keys()].join(', ')}`);

// --- 2. One method from each card the ledger leaves to the wiki
const covered = new Set(coverage.entries.map((e) => e.id));
const methods: FundingMethod[] = [];
const problems: { id: string; title: string; reason: string }[] = [];
for (const e of entries) {
  const id = slug(e.title);
  if (e.members || covered.has(id)) continue;
  const page = await wikitext(e.page);
  // A guide with a recipe picker fills the card from variables; the first recipe it defines is the one built.
  const vars = new Map<string, string>();
  for (const [, k, v] of page?.text.matchAll(/\{\{#vardefine(?:echo)?:([^|{}]+)\|([^{}]*)\}\}/gi) ?? []) {
    if (!vars.has(k.trim().toLowerCase())) vars.set(k.trim().toLowerCase(), v.trim());
  }
  const f = Object.fromEntries(Object.entries(page ? mmgFields(page.text) : {}).map(([k, v]) =>
    [k, firstOption(v).replace(/\{\{#var:([^|{}]+)(?:\|([^{}]*))?\}\}/gi, (_, n: string, d?: string) => vars.get(n.trim().toLowerCase()) ?? d ?? '')]));
  if (!page || !f.activity) { problems.push({ id, title: e.title, reason: `no Mmgtable` }); continue; }
  const field = (k: string) => { const v = wikiPlain(f[k] ?? ''); return /^none\.?$/i.test(v) ? '' : v; };
  const combat = /^combat/i.test(f.category ?? '');
  const perKill = /^y/i.test(f.isperkill ?? '') ? quantity(f.kph) : null;
  if (combat && !perKill) { problems.push({ id, title: e.title, reason: `a combat guide without kills an hour` }); continue; }

  // The monster's page gives its spawn, the place of the work.
  const foe = combat ? links(f.activity)[0] ?? null : null;
  const raw = (kind: 'input' | 'output') => {
    const out: { name: string; n: number; ph: boolean }[] = [];
    for (let i = 1; i <= 40; i++) {
      const name = wikiPlain(f[`${kind}${i}`] ?? '');
      if (!name || /optional/i.test(f[`${kind}${i}note`] ?? '')) continue;
      const n = f[`${kind}${i}num`] === undefined ? 1 : quantity(f[`${kind}${i}num`]);
      const value = /^coins$/i.test(name) ? quantity(f[`${kind}${i}value`]) ?? 1 : 1;
      if (name && n) out.push({ name, n: n * value, ph: /^y/i.test(f[`${kind}${i}isph`] ?? '') });
    }
    return out;
  };
  const ins = raw('input');
  const outs = raw('output');
  // The unit: a kill, or the main product (the most made tradeable item, coins only when nothing else is made). The wiki's
  // "per kill" also counts actions (a platebody picked up, a hide tanned): then the unit is that product when one comes per action.
  const main = outs.filter((o) => !/^coins$/i.test(o.name) && ITEMS.has(o.name.toLowerCase())).sort((a, b) => b.n - a.n)[0]
    ?? outs.find((o) => /^coins$/i.test(o.name));
  const pace = perKill ?? main?.n ?? null;
  if (!pace) { problems.push({ id, title: e.title, reason: `no pace` }); continue; }
  const per = (x: { n: number; ph: boolean }) => (perKill && !x.ph ? x.n : x.n / pace);
  const flows = (xs: typeof ins) => xs.map((x) => flowOf(x.name, per(x))).filter((x): x is Flow => x !== null);
  const outputs = flows(outs);
  if (!outputs.some((o) => !o.chance)) { problems.push({ id, title: e.title, reason: `nothing sellable is made every unit` }); continue; }
  const inputs = flows(ins);
  const unsold = ins.filter((i) => !ITEMS.has(i.name.toLowerCase())).map((i) => i.name);

  const requirements: Requirement[] = [];
  for (const r of kept.get(id)?.flatMap((q) => (q.kind === 'level' ? [{ skill: q.skill, level: q.level }] : [])) ?? parseSkillsHtml(e.skillsHtml)) {
    if (!requirements.some((q) => q.kind === 'level' && q.skill === r.skill)) requirements.push({ kind: 'level', skill: r.skill, level: r.level });
  }
  // A combat card lists the levels of every style it suits: melee when it names melee levels (Ranged and Magic are then the
  // alternatives), else Ranged.
  const named = (skill: string) => requirements.some((r) => r.kind === 'level' && r.skill === skill);
  const other = ['attack', 'strength', 'defence'].some(named) ? ['ranged', 'magic'] : named('ranged') ? ['magic'] : [];
  if (combat) requirements.splice(0, requirements.length, ...requirements.filter((r) => r.kind !== 'level' || !other.includes(r.skill)));
  for (const part of (f.quest ?? '').split(/,|<br\s*\/?>|\n|\*/)) {
    if (/recommend|optional/i.test(part)) continue;
    for (const quest of links(part)) {
      if (QUESTS.has(quest)) requirements.push({ kind: 'quest', quest, state: /partial|start/i.test(part) ? 'started' : 'complete' });
      else if (MINIQUESTS.has(quest)) requirements.push({ kind: 'check', text: `Needs the miniquest ${quest}` });
    }
  }
  const levels = new Set(requirements.flatMap((r) => (r.kind === 'level' ? [r.skill] : [])));
  if (levels.has('mining')) requirements.push({ kind: 'item', role: 'tool', any: [], family: 'pickaxe' });
  if (levels.has('woodcutting')) requirements.push({ kind: 'item', role: 'tool', any: [], family: 'axe' });
  // What to bring: the card's item field and the unsellable inputs, never the product itself (some cards name the collected item there).
  const made = new Set(outs.map((o) => o.name.toLowerCase()));
  const bring = [...field('item').split(/,\s*/).filter((n) => n && !made.has(n.toLowerCase())), ...unsold].join(', ');
  if (bring) requirements.push({ kind: 'check', text: `Bring: ${bring}` });
  if (field('other')) requirements.push({ kind: 'check', text: field('other') });
  const location = f.location ?? '';
  const point = await spotOf(location, foe, page.text);
  if (!point) { problems.push({ id, title: e.title, reason: `no place for "${wikiPlain(location)}"` }); continue; }
  // The Wilderness by its name or its tiles (above the Edgeville ditch, on the surface): many cards name only a landmark there.
  const wild = /wilderness/i.test(`${location} ${f.other ?? ''}`) || (point.plane === 0 && point.y >= 3523 && point.y < 4000 && point.x >= 2944 && point.x < 3392);
  if (wild) requirements.push({ kind: 'check', text: 'In the Wilderness: other players can attack you, so bring only what you can lose' });
  const label = (wikiPlain(location).split(/\.\s/)[0] || 'Grand Exchange').slice(0, 80);
  const spot: Place = { x: point.x, y: point.y, plane: point.plane, label };
  const bank = [...BANKS].sort((a, b) => distance(point, a) - distance(point, b))[0];

  const activity = wikiPlain(f.activity);
  const unit = combat ? 'kill' : !perKill || (main && !main.ph && main.n === 1) ? main!.name.toLowerCase() : 'action';
  // The guide's own method (its Details field) when it gives one: its numbered steps in order, its first one the walk when it is one.
  // Banking and selling are added only when its steps do not say them. Without a method, the plain outline.
  const details = detailsOf(f.details ?? '');
  const own = details.steps.length >= 2 ? details.steps : null;
  const walks = own && /^(go|walk|run|head|travel|teleport|take the|enter)\b/i.test(own[0]);
  const says = (re: RegExp) => Boolean(own?.some((s) => re.test(s)));
  const guide: GuideAction[] = [
    ...(combat ? [{ kind: 'prepare' as const, text: 'Take food and your best gear from the bank.' }] : []),
    ...(inputs.length ? [{ kind: 'prepare' as const, text: `Buy ${inputs.map((i) => i.item.name).join(', ')} at the Grand Exchange.` }] : []),
    { kind: 'travel', text: walks ? own![0] : `Go to ${label}.`, place: spot },
    // "Repeat steps 1-4" counts the guide's own list: the steps placed before it shift its numbers.
    ...(own ? own.slice(walks ? 1 : 0).map((text) => ({ kind: 'perform' as const, text: shiftSteps(text, (combat ? 1 : 0) + (inputs.length ? 1 : 0) + (walks ? 0 : 1)) }))
      : [{ kind: 'perform' as const, text: `${activity} until the bag is full.` }]),
    ...(!own || !says(/\bbank/i) ? [{ kind: 'bank' as const, text: `Bank at ${bank.label}.` }] : []),
    ...(!says(/grand exchange|\bsell/i) ? [{ kind: 'sell' as const, text: 'Sell what you made at the Grand Exchange.' }] : []),
    { kind: 'restock', text: 'Buy the supplies you were short of, then go back to your step.' },
  ];
  const place = wikiPlain(location);
  const intensity = (['low', 'moderate', 'high'] as const).find((k) => (f.intensity ?? '').toLowerCase().startsWith(k)) ?? 'moderate';
  const category = (f.category ?? '').toLowerCase();
  methods.push({
    id, title: e.title,
    family: combat ? 'combat' : category.startsWith('collect') ? 'collecting' : category.startsWith('process') ? 'processing' : inputs.length ? 'production' : 'gathering',
    access: 'f2p', repeatable: true,
    summary: (!place || activity.toLowerCase().includes(place.toLowerCase()) ? activity : `${activity}. ${place}`).slice(0, 200),
    ...(details.about ? { about: details.about } : {}),
    ...(details.tips.length ? { tips: details.tips.slice(0, 8) } : {}),
    requirements, inputs, outputs,
    rate: {
      unit,
      perHour: { slow: Math.max(1, Math.round(pace * 0.55)), typical: Math.max(1, Math.round(pace * 0.8)), fast: Math.max(1, Math.round(pace)) },
      basis: 'wiki-guide',
      assumes: `${Math.round(pace).toLocaleString('en-US')} ${unit} an hour is the wiki guide's pace at its recommended levels and gear, banking included. Slow is 55% and typical 80% of it.`,
    },
      trip: { bagSlots: 28, overheadSeconds: 0, note: 'The wiki pace already counts banking.' },
    spot, bank: { x: bank.x, y: bank.y, plane: bank.plane, label: bank.label },
    saleSeconds: 60,
    risk: wild ? 'high' : combat ? 'moderate' : 'low',
    intensity,
    guide,
    sources: [{ url: `https://oldschool.runescape.wiki/w/${e.page.replace(/ /g, '_')}`, title: e.page, ...(page.revid ? { revision: page.revid } : {}), retrievedAt: TODAY, used: 'pace, inputs, outputs, levels, quests, place and the method' }],
    verifiedAt: TODAY,
    confidence: 'LOW',
    assumptions: [
      'The pace and drops are the wiki guide\'s; rare drops (below 1 in 16) are shown as upside and never planned on.',
    ],
  });
}

methods.sort((a, b) => a.id.localeCompare(b.id));

// --- 3. The hand-modelled methods keep their own steps; their wiki guides add why they pay and their tips.
const extras: Record<string, { about?: string; tips?: string[] }> = {};
for (const m of read<{ methods: FundingMethod[] }>('src/data/authored/fundingMethods.json').methods) {
  const guide = m.sources.find((src) => /^Money making guide\//.test(src.title));
  const page = guide && await wikitext(guide.title);
  if (!page) continue;
  const d = detailsOf(mmgFields(page.text).details ?? '');
  if (d.about || d.tips.length) extras[m.id] = { ...(d.about ? { about: d.about } : {}), ...(d.tips.length ? { tips: d.tips.slice(0, 8) } : {}) };
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ version: 1, generatedAt: TODAY, source: 'https://oldschool.runescape.wiki/w/Money_making_guide/Free-to-play', methods, extras, notBuilt: problems }, null, 1)}\n`);
console.log(`Written ${methods.length} methods to ${OUT}`);
if (problems.length) console.log(`Not built (${problems.length}):\n${problems.map((p) => `${p.title}: ${p.reason}`).join('\n')}`);
