// Глобальный поиск по шагам, базе предметов, навыкам, строкам прокачки и справке.

import type { Block, PluginsData, ReferenceData, Skill, Step, WikiItemDetail } from '../types';
import { fold, stripMd } from './md';

export type SearchKind = 'step' | 'item' | 'range' | 'skill' | 'ref' | 'plugin';

export interface SearchItem {
  kind: SearchKind;
  code?: string;
  title: string;
  subtitle: string;
  href: string;
  /** Весь текст записи без разметки — из него берётся отрывок. */
  text: string;
  folded: string;
  foldedTitle: string;
  /** Предмет базы: открывается в инспекторе вики, а не по ссылке. */
  itemId?: number;
  icon?: string;
}

export interface SearchHit {
  item: SearchItem;
  score: number;
  snippet?: string;
}

export function blocksText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.t === 'p') parts.push(b.text);
    else if (b.t === 'table') parts.push(b.head.join(' · '), ...b.rows.map((r) => r.join(' · ')));
    else if (b.t === 'code') continue;
    else for (const it of b.items) parts.push(it.text, blocksText(it.children ?? []));
  }
  return stripMd(parts.filter(Boolean).join('\n'));
}

function item(kind: SearchKind, title: string, subtitle: string, href: string, text: string, code?: string): SearchItem {
  const plainTitle = stripMd(title);
  return { kind, code, title: plainTitle, subtitle, href, text, folded: fold(`${code ?? ''} ${plainTitle}\n${text}`), foldedTitle: fold(plainTitle) };
}

export interface SearchSources {
  steps: Step[];
  skills: Skill[];
  reference: ReferenceData;
  plugins: PluginsData;
  items?: WikiItemDetail[];
  typeLabel: Record<string, string>;
}

/** Весь текст шага: названия, NPC, предметы, действия и советы — чтобы находить шаг по любому из них. */
export function stepText(s: Step): string {
  const itemsText = [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])].map((i) => `${i.nameEn} ${i.nameRu}`);
  const parts = [
    s.titleRu,
    s.npc && `${s.npc.nameEn} ${s.npc.nameRu} ${s.npc.location}`,
    s.where, s.bring, s.how,
    ...itemsText,
    ...(s.quickSteps ?? []),
    s.proTip, s.safespot, s.reward,
    ...(s.fields ?? []).map((f) => (f.label ? `${f.label}: ${f.text}` : f.text)),
    ...(s.tips ?? []),
    `Готово, когда: ${s.doneWhen}`,
  ];
  return stripMd(parts.filter(Boolean).join('\n'));
}

export function buildIndex({ steps, skills, reference, plugins, items = [], typeLabel }: SearchSources): SearchItem[] {
  const out: SearchItem[] = [];
  for (const s of steps) {
    out.push(item('step', s.title, `${typeLabel[s.type]} · этап ${s.stage}${s.membersOnly ? ' · Members' : ''}`, `#/step/${s.id}`, stepText(s), s.id));
  }
  for (const it of items) {
    const row = item('item', it.nameEn, it.nameRu ?? 'Предмет', `item:${it.id}`, it.nameRu ?? '');
    out.push({ ...row, itemId: it.id, icon: it.iconUrl });
  }
  for (const sk of skills) {
    for (const r of sk.plan.ranges) {
      out.push(item('range', r.what, `${sk.name} · уровни ${r.levels}`, `#/skills/${sk.id}`, stripMd(r.cells.slice(2).join(' · ')), r.code));
    }
    const text = [blocksText(sk.intro), ...sk.sections.map((sec) => `${sec.title}\n${blocksText(sec.blocks)}`)].join('\n');
    out.push(item('skill', sk.name, sk.nameEn ?? sk.subtitle ?? 'Навык', `#/skills/${sk.id}`, text));
  }
  for (const sec of reference.sections) {
    if (sec.id === 'plugins') continue;
    out.push(item('ref', sec.title, 'Справка', `#/reference/${sec.id}`, blocksText(sec.blocks)));
  }
  out.push(item('ref', reference.training.title, 'Навыки', '#/skills', blocksText(reference.training.blocks)));
  for (const g of plugins.groups) {
    for (const pl of g.plugins) {
      out.push(item('plugin', pl.name, `Плагин · ${pl.sourceLabel} · ${g.title}`, `#/reference/plugins`, pl.why));
    }
  }
  return out;
}

function snippet(text: string, token: string): string | undefined {
  const at = fold(text).indexOf(token);
  if (at < 0) return undefined;
  const start = Math.max(0, text.lastIndexOf('\n', at) + 1, at - 50);
  const endLine = text.indexOf('\n', at);
  const end = Math.min(endLine < 0 ? text.length : endLine, at + token.length + 70);
  return (start > 0 && text[start - 1] !== '\n' ? '…' : '') + text.slice(start, end).trim() + (end < text.length && text[end] !== '\n' ? '…' : '');
}

export function search(index: SearchItem[], query: string, limit = 30): SearchHit[] {
  const q = fold(query.trim());
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const hits: SearchHit[] = [];
  for (const it of index) {
    if (!tokens.every((t) => it.folded.includes(t))) continue;
    let score = 0;
    if (it.code && fold(it.code) === q) score += 1000;
    else if (it.code && fold(it.code).startsWith(q)) score += 400;
    if (it.foldedTitle === q) score += 300;
    else if (it.foldedTitle.startsWith(q)) score += 200;
    else if (it.foldedTitle.includes(q)) score += 120;
    score += tokens.filter((t) => it.foldedTitle.includes(t)).length * 30;
    score += { step: 12, item: 9, range: 8, skill: 10, ref: 4, plugin: 6 }[it.kind];
    const inTitle = tokens.every((t) => it.foldedTitle.includes(t) || (it.code && fold(it.code).includes(t)));
    hits.push({ item: it, score, snippet: inTitle ? undefined : snippet(it.text, tokens.find((t) => !it.foldedTitle.includes(t)) ?? tokens[0]) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
