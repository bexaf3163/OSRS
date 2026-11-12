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

export interface GuideDetails {
  /** The method, in order: the wiki's numbered steps ("# ..."), else the instructions of its prose ("Go upstairs ...", "Bank ..."). */
  steps: string[];
  /** Its bullet points: requirements in prose, warnings and the Tips section ("* ..."). */
  tips: string[];
  /** The rest of its prose: why the method pays and how it works, at most a few sentences. */
  about: string | null;
}

/** The verbs an instruction starts with: such a sentence of the guide's prose is a step. */
const IMPERATIVE = /^(go|walk|run|head|travel|teleport|take|use|open|search|bank|kill|attack|pick|grab|buy|sell|climb|enter|exit|leave|talk|speak|fill|chop|mine|collect|repeat|hop|withdraw|deposit|smelt|cook|make|spin|craft|cast|equip|wield|drop|stand|wait|light|burn|tan|return|click|select|bring|put|place|cross|pay|follow|continue|keep|start|trade|sail|dig|steal|stock|empty|combine|wear)\b/i;

/**
 * The guide's own text from the {{Mmgtable}} "Details" field, as plain text: its numbered steps (else the instructions in its prose),
 * its bullet tips and the rest of its prose. Images, maps, references and figures the wiki computes on the page are dropped; nothing is
 * invented, and an empty field gives nothing.
 */
export function detailsOf(details: string): GuideDetails {
  let t = details.replace(/<!--.*?-->/gs, '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>.*?<\/ref>/gis, '')
    .replace(/<mapframe[^>]*>.*?<\/mapframe>/gis, '').replace(/<mapframe[^>]*\/?>/gi, '').replace(/<span[^>]*display:\s*none[^>]*>.*?<\/span>/gis, '');
  // [[File:...]] and [[Image:...]] can hold links of their own: drop them innermost-first.
  for (let i = 0; i < 4; i++) t = t.replace(/\[\[(?:File|Image):(?:[^[\]]|\[\[[^[\]]*\]\])*\]\]/gi, '');
  // A picture link ({{plink|Air talisman}}) is its name in prose: keep the word, not just the plural "s" after it.
  const clean = (s: string) => wikiPlain(s.replace(/\{\{plinkp?\|([^|{}]+)[^{}]*\}\}/gi, '$1')).replace(/<[^>]+>/g, '').replace(/\(\s*\)/g, '').replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
  const short = (p: string, max = 260) => {
    if (p.length <= max) return p;
    const cut = p.slice(0, max);
    const end = cut.lastIndexOf('. ');
    return end > max / 2 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
  };
  // A figure the wiki fills in on the page (the profit rate, a price) reads as nonsense once its template is gone.
  const hollow = (s: string) => /profit rate assumes|your actual profits? may|consult the profitability|chart above/i.test(s) || s.length < 8
    // A price the page fills in leaves a hole: "about to per hour", "worth each", "between and".
    || /\b(?:about|between|roughly|around|worth|costs?|for|of|at)\s+(?:to|and|per|each|gp)\b/i.test(s);
  const numbered: string[] = [], tips: string[] = [], prose: string[] = [];
  for (const raw of t.split('\n')) {
    const line = raw.trim();
    if (!line || /^=+.*=+$/.test(line) || /^\{\|/.test(line) || /^\|/.test(line)) continue;
    const step = /^#+\s*(.*)$/.exec(line);
    const tip = /^\*+\s*(.*)$/.exec(line);
    const text = clean(step?.[1] ?? tip?.[1] ?? line);
    if (!text) continue;
    // Prose is judged sentence by sentence below; a step or tip whole.
    if (step) { if (!hollow(text)) numbered.push(short(text)); } else if (tip) { if (!hollow(text)) tips.push(short(text)); } else prose.push(text);
  }
  const sentences = prose.flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z])/)).map((s) => s.trim()).filter((s) => s && !hollow(s));
  const instructions = sentences.filter((s) => IMPERATIVE.test(s));
  // A numbered list of durations ("Navigating the maze: 2 minutes") is the guide's timing, not its method.
  const timing = numbered.filter((s) => /\d+\s*(?:seconds?|minutes?|mins?)\b/i.test(s)).length * 2 >= numbered.length;
  const method = timing ? [] : numbered;
  const fromProse = method.length < 2 && instructions.length >= 2;
  const steps = method.length >= 2 ? method : fromProse ? instructions.map((s) => short(s)) : [];
  // The prose that is not a step: the instructions already listed are not repeated.
  const rest = [...(timing ? numbered : []), ...(fromProse ? sentences.filter((s) => !IMPERATIVE.test(s)) : sentences)];
  const about = rest.length ? short(rest.slice(0, 4).join(' '), 520) : null;
  return { steps, tips, about };
}
