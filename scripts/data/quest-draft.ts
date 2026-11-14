// A quest draft: everything a new quest needs, assembled from machine-readable sources only. Quest Helper gives the
// stages, tiles, ids and step texts (tools/qh-machines/qhm/draft.py); the OSRS Wiki quest card gives requirements,
// rewards, items and opponents (quest-facts.ts). Nothing is invented: what no source confirms is listed in `unknown`,
// and an AI or a person may only rewrite the wording (`s`, labels, how to get an item), which the check then holds
// against these facts (scripts/check/check-quest-draft.ts).
import type { WikiItemDetail } from '../../src/types/index.ts';
import type { WikiArticle } from './wiki.ts';
import { templates } from './wiki.ts';
import { questFacts } from './quest-facts.ts';

type Ref = string | { s: string };
interface QhNode { n?: string; c: [unknown, Ref][]; d: Ref }
export interface QhFacts {
  title: string; cls: string; var: [string, number]; revision: string;
  machine: { stages: Record<string, Ref>; nodes: Record<string, QhNode>; reqs: Record<string, unknown>; alias: Record<string, string[]> };
  unknown: Record<string, number>;
  steps: Record<string, { typ: string | null; wp: [number, number, number] | null; ids: number[]; text: string | null }>;
}
export interface DraftLine { t: string; s: string; k: string; at?: [number, number, number]; hl?: { npc?: number[]; obj?: number[] } }
export interface DraftItem { nameEn: string; amount: number; wikiItemId: number | null; howToGet: string | null; note?: string }
export interface QuestDraft {
  quest: string; status: 'draft';
  sources: { questHelper: string; wiki: { title: string; revision: number }; quickGuide: { title: string; revision: number } | null };
  step: {
    title: string; type: 'quest'; qp: number; membersOnly: boolean; wikiUrl: string; quickGuideUrl: string;
    mapLocation: { x: number; y: number; plane: number; label: string } | null;
    npc: { nameEn: string } | null; itemsRequired: DraftItem[]; foes: string[];
  };
  stages: { var: [string, number]; route: { title: string; steps: string[] }[]; stages: { at: number; do: DraftLine[] }[] };
  facts: ReturnType<typeof questFacts>;
  unknown: string[];
}

/** Wiki markup as plain text: links by their shown words, chat options as the dialogue to pick, other templates dropped. */
export function plain(text: string): string {
  let out = text.replace(/\{\{Chat options?\|([^{}]*)\}\}/gi, (_, body: string) =>
    // The Wiki writes each option with its menu number in front ("2I'm in search of a quest.").
    `Dialogue: ${body.split('|').map((p) => p.trim().replace(/^\d+\s*/, '')).filter(Boolean).map((p) => `"${p}"`).join(', ')}`);
  for (let before = ''; before !== out;) { before = out; out = out.replace(/\{\{[^{}]*\}\}/g, ''); }
  return out.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/\s+/g, ' ').trim();
}

/** Where the item can be had, in the words the route uses: the Grand Exchange first (owner 2026-11-09), then the
 * cheapest shop of its Wiki card, a free spawn, a drop. Null when no source is known. */
export function sourceLine(d: WikiItemDetail | undefined, onExchange: boolean): string | null {
  const shop = [...(d?.buyLocations ?? [])].sort((a, b) => a.price - b.price)[0];
  const from = shop ? `from ${shop.shopName.replace(/\.$/, '')}${shop.location ? ` in ${shop.location}` : ''} for ${shop.price} gp` : '';
  if (onExchange) return `Buy on the Grand Exchange${from ? `, or ${from}` : ''}.`;
  if (from) return `Buy ${from}.`;
  if (d?.freeSpawns?.length) return `Free spawn: ${d.freeSpawns[0]}.`;
  return d?.dropSources?.length ? `Dropped by ${d.dropSources[0].monster}.` : null;
}

/** The first link target of each bullet, with its leading count: "* 2 [[Rope]]s (note)" is 2 Rope. */
function bullets(text: string | undefined): { name: string; count: number; note: string }[] {
  return (text ?? '').split(/\r?\n/).flatMap((line) => {
    const link = /\[\[([^\]|#]+)/.exec(line);
    if (!/^\s*\*/.test(line) || !link) return [];
    const count = Number(/^\s*\*+\s*(\d+)/.exec(line)?.[1] ?? 1);
    return [{ name: link[1].trim(), count, note: plain(line.replace(/^\s*\*+/, '')) }];
  });
}

/** The quick guide's walkthrough: its sections and top-level bullets, in order. */
export function routeOf(wikitext: string): { title: string; steps: string[] }[] {
  const out: { title: string; steps: string[] }[] = [];
  let inside = false;
  for (const raw of wikitext.split(/\r?\n/)) {
    const head = /^(={2,3})\s*(.*?)\s*\1\s*$/.exec(raw);
    if (head?.[1] === '==') { inside = /^walkthrough$/i.test(head[2]); continue; }
    if (!inside) continue;
    if (head) { out.push({ title: plain(head[2]), steps: [] }); continue; }
    const step = /^\s*(?:\{\{Checklist\|)?\*(?!\*)(.*)$/.exec(raw);
    // The checklist's own closing braces end its last bullet; a template inside the bullet keeps its own.
    const count = (mark: string) => (step?.[1] ?? '').split(mark).length - 1;
    const text = step ? plain(count('}}') > count('{{') ? step[1].replace(/\}\}\s*$/, '') : step[1]) : '';
    if (!text) continue;
    if (!out.length) out.push({ title: 'Walkthrough', steps: [] });
    out[out.length - 1].steps.push(text);
  }
  return out.filter((section) => section.steps.length);
}

/** The item names of the quest card, for the item lookup before the draft is built. */
export const cardItems = (article: WikiArticle): string[] => bullets(templates(article.wikitext, 'Quest details')[0]?.items).map((b) => b.name);

/** The steps under one stage in the order a player meets them: Quest Helper lists the furthest progress first and the
 * first action as the default, so the default comes first and the conditions follow from the last to the first. */
export function stageOrder(machine: QhFacts['machine'], ref: Ref, seen = new Set<string>()): string[] {
  if (typeof ref !== 'string') return ref.s === '?' || seen.has(ref.s) ? [] : (seen.add(ref.s), [ref.s]);
  const node = machine.nodes[ref];
  if (!node || seen.has(ref)) return [];
  seen.add(ref);
  return [...stageOrder(machine, node.d, seen), ...[...node.c].reverse().flatMap(([, child]) => stageOrder(machine, child, seen))];
}

const itemConditions = (reqs: unknown, out = new Map<string, number>()): Map<string, number> => {
  if (Array.isArray(reqs)) reqs.forEach((r) => itemConditions(r, out));
  else if (reqs && typeof reqs === 'object') {
    const r = reqs as { o?: string; nm?: string; ids?: number[] };
    if (r.o === 'item' && r.nm && r.ids?.length) out.set(r.nm.toLowerCase(), r.ids[0]);
    Object.values(reqs).forEach((value) => itemConditions(value, out));
  }
  return out;
};

export interface DraftSources {
  qh: QhFacts; article: WikiArticle; guide: WikiArticle | null; retrievedAt: string;
  /** Item details by lower-case name (the item database or the Wiki item card) and the opponents the combat data has. */
  items: ReadonlyMap<string, WikiItemDetail>; foes: ReadonlySet<string>;
  /** The item ids the Grand Exchange trades (the price API's mapping). */
  tradeable: ReadonlySet<number>;
}

export function buildDraft({ qh, article, guide, retrievedAt, items, foes, tradeable }: DraftSources): QuestDraft {
  const facts = questFacts(article, ['DRAFT'], retrievedAt);
  const details = templates(article.wikitext, 'Quest details')[0] ?? {};
  const unknown: string[] = [];
  const qhItems = itemConditions([qh.machine.reqs, qh.machine.nodes]);
  const itemsRequired = bullets(details.items).map(({ name, count, note }): DraftItem => {
    const detail = items.get(name.toLowerCase());
    const wikiItemId = qhItems.get(name.toLowerCase()) ?? detail?.id ?? null;
    const howToGet = sourceLine(detail, wikiItemId !== null && tradeable.has(wikiItemId));
    if (wikiItemId === null) unknown.push(`item "${name}": no id in Quest Helper or on its Wiki card`);
    if (!howToGet) unknown.push(`item "${name}": where to get it is not written`);
    return { nameEn: name, amount: count, wikiItemId, howToGet, ...(note !== name ? { note } : {}) };
  });
  const opponents = [...new Set(bullets(details.kills?.replace(/^(?!\s*\*)/gm, '*')).map((b) => b.name))];
  for (const foe of opponents) unknown.push(foes.has(foe) ? `fight "${foe}": not in the combat audit` : `fight "${foe}": no combat data`);
  const stages = Object.entries(qh.machine.stages).map(([value, ref]) => ({
    at: Number(value),
    do: stageOrder(qh.machine, ref).map((k): DraftLine => {
      const step = qh.steps[k];
      const text = step?.text ?? '';
      if (!step) unknown.push(`step "${k}": not among the Quest Helper steps`);
      else if (!step.wp) unknown.push(`step "${k}": Quest Helper gives no tile`);
      const hl = step?.ids.length && step.typ === 'NpcStep' ? { npc: step.ids } : step?.ids.length && step.typ === 'ObjectStep' ? { obj: step.ids } : null;
      return { t: text, s: text, k, ...(step?.wp ? { at: step.wp } : {}), ...(hl ? { hl } : {}) };
    }),
  })).sort((a, b) => a.at - b.at);
  for (const [what, count] of Object.entries(qh.unknown)) unknown.push(`Quest Helper condition "${what}" is not understood (${count})`);
  if (facts.requirements.unparsed) unknown.push(`requirement not reviewed: ${plain(facts.requirements.unparsed)}`);
  if (!facts.resourceFlow) unknown.push('what the quest uses up and hands out is not reviewed');
  if (!guide) unknown.push('no quick guide: the route text is empty');
  const start = /^(-?\d+)\s*,\s*(-?\d+)/.exec(details.startmap ?? '');
  if (!start) unknown.push('the quest card has no start tile');
  const npc = /\[\[([^\]|#]+)/.exec(details.start ?? '')?.[1] ?? null;
  const page = article.title.replaceAll(' ', '_');
  return {
    quest: article.title, status: 'draft',
    sources: { questHelper: qh.revision, wiki: { title: article.title, revision: article.revision }, quickGuide: guide ? { title: guide.title, revision: guide.revision } : null },
    step: {
      title: article.title, type: 'quest', qp: facts.rewards.questPoints, membersOnly: facts.members,
      wikiUrl: `https://oldschool.runescape.wiki/w/${page}`, quickGuideUrl: `https://oldschool.runescape.wiki/w/${page}/Quick_guide`,
      mapLocation: start ? { x: Number(start[1]), y: Number(start[2]), plane: 0, label: plain(details.start ?? '') } : null,
      npc: npc ? { nameEn: npc } : null, itemsRequired, foes: opponents,
    },
    stages: { var: qh.var, route: guide ? routeOf(guide.wikitext) : [], stages },
    facts, unknown: [...new Set(unknown)],
  };
}

/** Hold a draft, as edited, against its sources: `fails` are contradictions, the rest stays in the draft's `unknown`. */
export function checkDraft(draft: QuestDraft, qh: QhFacts): string[] {
  const fails: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (draft.sources.questHelper !== qh.revision) fails.push(`built from Quest Helper ${draft.sources.questHelper}, facts are ${qh.revision}`);
  if (!same(draft.stages.var, qh.var)) fails.push(`variable ${draft.stages.var} is not Quest Helper's ${qh.var}`);
  const values = Object.keys(qh.machine.stages).map(Number).sort((a, b) => a - b);
  if (!same(draft.stages.stages.map((s) => s.at), values)) fails.push(`stage values ${draft.stages.stages.map((s) => s.at)} are not Quest Helper's ${values}`);
  for (const stage of draft.stages.stages) {
    const allowed = new Set(stageOrder(qh.machine, qh.machine.stages[String(stage.at)] ?? { s: '?' }));
    for (const k of allowed) if (!stage.do.some((line) => line.k === k)) fails.push(`stage ${stage.at}: Quest Helper step "${k}" has no line`);
    for (const line of stage.do) {
      const step = qh.steps[line.k];
      const where = `stage ${stage.at} "${line.k}"`;
      if (!allowed.has(line.k) || !step) { fails.push(`${where}: not a Quest Helper step of this stage`); continue; }
      if (!same(line.at ?? null, step.wp)) fails.push(`${where}: tile ${line.at} is not Quest Helper's ${step.wp}`);
      for (const id of [...(line.hl?.npc ?? []), ...(line.hl?.obj ?? [])]) if (!step.ids.includes(id)) fails.push(`${where}: highlight ${id} is not a Quest Helper id`);
      if (!line.s.trim() || line.s.length > 70) fails.push(`${where}: the short line must be 1 to 70 characters, has ${line.s.length}`);
      if (!line.t.trim()) fails.push(`${where}: no full text`);
    }
  }
  if (draft.step.qp !== draft.facts.rewards.questPoints) fails.push(`quest points ${draft.step.qp} are not the quest card's ${draft.facts.rewards.questPoints}`);
  if (draft.facts.source.revision !== draft.sources.wiki.revision) fails.push('facts and step come from different Wiki revisions');
  for (const item of draft.step.itemsRequired) {
    if (!Number.isInteger(item.amount) || item.amount < 1) fails.push(`item "${item.nameEn}": amount ${item.amount}`);
    const known = draft.unknown.some((line) => line.startsWith(`item "${item.nameEn}": where`));
    if (!item.howToGet && !known) fails.push(`item "${item.nameEn}": no source and not listed as unknown`);
  }
  return fails;
}
