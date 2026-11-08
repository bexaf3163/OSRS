// Parsing of the wiki markup and rendered HTML for scripts/data/build-money.ts — kept apart to be checked by tests without a network.

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
 * The levels from the rendered "Skills" cell of the list: every level icon has data-skill and data-level. Recommended levels
 * count as needed, because the wiki's pace is measured at them. This is more reliable than the article markup: there the levels
 * often lie in template variables ({{#var:skill}}).
 */
export function parseSkillsHtml(cell: string): { skill: string; level: number }[] {
  return [...cell.matchAll(/<span class="scp"[^>]*data-skill="([^"]+)"[^>]*data-level="([^"]*)"[^>]*>/g)]
    .map((m) => ({ skill: m[1].toLowerCase().replace(/^combat level$/, 'combat'), level: parseInt(m[2].replace(/[^\d]/g, ''), 10) }))
    .filter((r) => Number.isFinite(r.level) && r.level > 0);
}
