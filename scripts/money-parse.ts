// Разбор разметки и отрисованного HTML вики для scripts/build-money.ts — вынесен, чтобы проверяться тестами без сети.

import type { MoneyReq } from '../src/types/index.ts';

export const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ');
export const plain = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Вики-разметка → простой текст: [[a|b]] → b, {{шаблоны}} убираются. */
export function wikiPlain(s: string): string {
  let t = s.replace(/<!--.*?-->/gs, '').replace(/<br\s*\/?>/gi, ', ');
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, (m) => {
    const scp = /^\{\{SCP\|([^|}]+)\|([^|}]+)/i.exec(m);
    return scp ? `${scp[1]} ${scp[2]}` : '';
  });
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Поля шаблона {{Mmgtable|...}}: «|Имя = значение», значение может занимать несколько строк. */
export function mmgFields(text: string): Record<string, string> {
  const start = text.indexOf('{{Mmgtable');
  if (start < 0) return {};
  const out: Record<string, string> = {};
  let depth = 0;
  let i = start;
  let body = '';
  for (; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; body += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; if (depth === 0) break; body += two; i++; continue; }
    body += text[i];
  }
  // Поля верхнего уровня: делим по «\n|», вложенные шаблоны не рвём.
  let level = 0;
  let cur = '';
  const parts: string[] = [];
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (two === '{{' || two === '[[') { level++; cur += two; k++; continue; }
    if (two === '}}' || two === ']]') { level--; cur += two; k++; continue; }
    if (body[k] === '|' && level === 1) { parts.push(cur); cur = ''; continue; }
    cur += body[k];
  }
  parts.push(cur);
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    out[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Требования из отрисованной ячейки «Skills» списка: у каждого значка уровня есть data-skill и data-level (уровень
 * с «+» — «и выше»). Слова «recommended»/«optional» после значка — совет, а не требование. Так надёжнее, чем разметка
 * статьи: в ней уровни часто лежат в переменных шаблона ({{#var:skill}}).
 */
export function parseSkillsHtml(cell: string): MoneyReq[] {
  const reqs: MoneyReq[] = [];
  const spans = [...cell.matchAll(/<span class="scp"[^>]*data-skill="([^"]+)"[^>]*data-level="([^"]*)"[^>]*>/g)];
  spans.forEach((m, idx) => {
    const level = parseInt(m[2].replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(level) || level <= 0) return;
    const after = cell.slice((m.index ?? 0) + m[0].length, idx + 1 < spans.length ? spans[idx + 1].index : cell.length);
    // Текст после закрывающего </span> значка, до следующего значка.
    const tail = plain(after.replace(/^[\s\S]*?<\/span>\s*<\/span>/, ''));
    const soft = /recommend|optional/i.test(tail.slice(0, 40));
    const skill = m[1].toLowerCase().replace(/^combat level$/, 'combat');
    reqs.push({ skill, level, required: !soft, ...(m[2].includes('+') ? { plus: true } : {}) });
  });
  return reqs;
}

/** Слова вики рядом с уровнями («Decent and recommended…»): они про боевую подготовку, которую числами не выразить. */
export function skillsNote(cell: string): string | undefined {
  const t = plain(cell);
  return /decent/i.test(t) ? t.slice(0, 140) : undefined;
}

/** Явный стартовый капитал из поля Item: «{{Coins|100000}}+». Переменные шаблона не считаем. */
export function parseCapital(item: string): number | undefined {
  const m = /\{\{Coins\|([\d,]+)\}\}/i.exec(item);
  const n = m ? parseInt(m[1].replace(/,/g, ''), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Названия входов (Input1, Input2…), кроме Coins: что покупают или несут с собой. */
export function parseInputs(f: Record<string, string>): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const name = wikiPlain(f[`input${i}`] ?? '');
    if (name && !/^coins$/i.test(name) && !name.includes('#')) out.push(name);
  }
  return out;
}

