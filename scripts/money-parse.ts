// Parsing of the wiki markup and rendered HTML for scripts/build-money.ts — kept apart to be checked by tests without a network.

import type { MoneyReq } from '../src/types/index.ts';

export const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ');
export const plain = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Wiki markup → plain text: [[a|b]] → b, {{templates}} are removed. */
export function wikiPlain(s: string): string {
  let t = s.replace(/<!--.*?-->/gs, '').replace(/<br\s*\/?>/gi, ', ');
  for (let i = 0; i < 4; i++) t = t.replace(/\{\{[^{}]*\}\}/g, (m) => {
    const scp = /^\{\{SCP\|([^|}]+)\|([^|}]+)/i.exec(m);
    return scp ? `${scp[1]} ${scp[2]}` : '';
  });
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** The fields of the {{Mmgtable|...}} template: "|Name = value", the value may span several lines. */
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
  // The top-level fields: we split by "\n|", the nested templates are not broken.
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
 * The requirements from the rendered "Skills" cell of the list: every level icon has data-skill and data-level (a level
 * with "+" — "and higher"). The words "recommended"/"optional" after an icon are advice, not a requirement. This is more reliable than the article
 * markup: there the levels often lie in template variables ({{#var:skill}}).
 */
export function parseSkillsHtml(cell: string): MoneyReq[] {
  const reqs: MoneyReq[] = [];
  const spans = [...cell.matchAll(/<span class="scp"[^>]*data-skill="([^"]+)"[^>]*data-level="([^"]*)"[^>]*>/g)];
  spans.forEach((m, idx) => {
    const level = parseInt(m[2].replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(level) || level <= 0) return;
    const after = cell.slice((m.index ?? 0) + m[0].length, idx + 1 < spans.length ? spans[idx + 1].index : cell.length);
    // The text after the closing </span> of an icon, up to the next icon.
    const tail = plain(after.replace(/^[\s\S]*?<\/span>\s*<\/span>/, ''));
    const soft = /recommend|optional/i.test(tail.slice(0, 40));
    const skill = m[1].toLowerCase().replace(/^combat level$/, 'combat');
    reqs.push({ skill, level, required: !soft, ...(m[2].includes('+') ? { plus: true } : {}) });
  });
  return reqs;
}

/** The wiki words next to the levels ("Decent and recommended…"): they are about combat training, which numbers cannot express. */
export function skillsNote(cell: string): string | undefined {
  const t = plain(cell);
  return /decent/i.test(t) ? t.slice(0, 140) : undefined;
}

/** The explicit starting capital from the Item field: "{{Coins|100000}}+". The template variables are not counted. */
export function parseCapital(item: string): number | undefined {
  const m = /\{\{Coins\|([\d,]+)\}\}/i.exec(item);
  const n = m ? parseInt(m[1].replace(/,/g, ''), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The input names (Input1, Input2…), except Coins: what is bought or carried. */
export function parseInputs(f: Record<string, string>): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const name = wikiPlain(f[`input${i}`] ?? '');
    if (name && !/^coins$/i.test(name) && !name.includes('#')) out.push(name);
  }
  return out;
}

