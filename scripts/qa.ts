// A consistency check of the data and texts: one set of rules for `npm run check-data` and for the tests.
// The rules catch what has already broken the app: a Coif without the 20 Ranged requirement, two "main" amulets in one route,
// a "home teleport" without a note about the cooldown, quest stages with broken steps and tiles, texts starting with a lowercase letter.
// A new rule is the rule(...) function below; we do not duplicate the checks from validate.ts.

import type { Step } from '../src/types/index.ts';

export interface QaInput {
  steps: Step[];
  gear: { items: { id: number; name: string; slot?: string; members?: boolean; req?: Record<string, unknown> }[] };
  questStages: { quests: Record<string, {
    var: [string, number];
    route?: { title: string; steps: string[] }[];
    stages: { at: number; do: { t: string; s?: string; at?: number[]; has?: string; need?: string; hl?: { npc?: unknown; obj?: unknown; on?: unknown; item?: unknown } }[]; go?: unknown; items?: { name: string }[] }[];
  }> };
  /** The training methods (src/data/trainingMethods.json) and the place dictionary — for the method router rules. If absent — the rules are not applied. */
  training?: { methods: { id: string; skill: string | string[]; from: number; to?: number | null; name: string; where: string; place?: string; url: string; xph?: number[]; xpa?: number; kind?: string; xpTotal?: number }[] };
  places?: { locations: Record<string, unknown> };
  /** The skill identifiers with levels (levels.json + the members skills). */
  skillIds?: string[];
}

export interface QaIssue {
  rule: string;
  where: string;
  message: string;
}

const SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'quests']);
/** The known wearing requirements: we check that they were not lost (the source is the OSRS Wiki). */
const KNOWN_REQ: Record<string, Record<string, number>> = { Coif: { ranged: 20 } };

const firstChar = (t: string) => t.match(/[\p{L}\p{N}]/u)?.[0];

function badPoint(p: number[]): boolean {
  const [x, y, z] = p;
  return !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || x < 1000 || x > 4200 || y < 2400 || y > 13000 || z < 0 || z > 3;
}

export function qa(input: QaInput): QaIssue[] {
  const out: QaIssue[] = [];
  const add = (rule: string, where: string, message: string) => out.push({ rule, where, message });

  // --- Gear: unique ids, sensible requirements, the known requirements in place ---
  const seen = new Set<number>();
  for (const g of input.gear.items) {
    if (seen.has(g.id)) add('gear-duplicate', g.name, `repeated id ${g.id}`);
    seen.add(g.id);
    for (const [k, v] of Object.entries(g.req ?? {})) {
      if (k === 'quests') {
        if (!Array.isArray(v) || v.some((q) => typeof q !== 'string' || !q)) add('gear-req', g.name, 'quests is not a list of names');
      } else if (!SKILLS.has(k) || !Number.isInteger(v) || (v as number) < 2 || (v as number) > 99) {
        add('gear-req', g.name, `the requirement ${k}=${String(v)} breaks the rules (a skill from the list, level 2–99)`);
      }
    }
  }
  for (const [name, req] of Object.entries(KNOWN_REQ)) {
    const g = input.gear.items.find((x) => x.name === name);
    if (!g) continue;
    for (const [k, v] of Object.entries(req)) {
      if (g.req?.[k] !== v) add('gear-known-req', name, `must require ${k} ${v}, in the data: ${String(g.req?.[k] ?? 'none')}`);
    }
  }

  // --- Amulets: one main recommendation per route (strength), not strength and power together ---
  const required = (s: Step, name: string) => (s.itemsRequired ?? []).some((i) => i.nameEn.toLowerCase() === name);
  const strengthAt = input.steps.findIndex((s) => required(s, 'amulet of strength'));
  input.steps.forEach((s, i) => {
    if (required(s, 'amulet of power') && strengthAt >= 0 && strengthAt <= i) {
      add('amulet-consistency', s.id, 'Amulet of power is in "Required", although the route already requires Amulet of strength: two main amulets');
    }
    if (required(s, 'amulet of power') && required(s, 'amulet of strength')) add('amulet-consistency', s.id, 'both amulets are in "Required" at once');
  });

  // --- Home teleport: we do not promise it without a note about the cooldown (once every 30 minutes) ---
  for (const s of input.steps) {
    const texts = [s.where, s.how, s.bring, s.warning, s.proTip, ...(s.quickSteps ?? []), ...(s.tips ?? [])].filter((t): t is string => Boolean(t));
    for (const t of texts) {
      if (/home teleport/i.test(t) && !/recharg|cooldown|every 30|30 minutes|grey|gray/i.test(t)) {
        add('home-teleport', s.id, `"Home Teleport" without a note about the cooldown: ${t.slice(0, 70)}…`);
      }
    }
  }

  // --- Quest stages ---
  const ids = new Set(input.steps.map((s) => s.id));
  const stepItems = new Map(input.steps.map((s) => [s.id, (s.itemsRequired ?? []).map((i) => ({ name: i.nameEn }))]));
  for (const [id, q] of Object.entries(input.questStages.quests)) {
    if (!ids.has(id)) add('stages-step', id, 'there is no such step on the route');
    if (!['varp', 'varbit'].includes(q.var[0]) || !Number.isInteger(q.var[1]) || q.var[1] < 1) add('stages-var', id, `the variable ${q.var.join(' ')}`);
    let last = -1;
    for (const st of q.stages) {
      if (st.at <= last) add('stages-order', id, `stage ${st.at} is not ascending`);
      last = st.at;
      if (!st.do.length) add('stages-empty', id, `stage ${st.at} without steps`);
      for (const [n, l] of st.do.entries()) {
        const c = firstChar(l.t);
        // "Give/Return/Bring X" not as the first step of a stage: without the condition "X in the bag" a player standing next to the NPC would count as already arrived.
        // The items are those of the stage and of the whole step: "Buy Beer" may be a stage step where Beer is not among the items (it is with Dr. Harlow).
        const pool = [...(st.items ?? []).map((it) => ({ name: it.name })), ...(stepItems.get(id) ?? [])];
        const mentions = (text: string, it: { name: string }) => text.includes(it.name.toLowerCase());
        // What a line says about items: without the "(needs a Spade)" marks — a tool is needed, but it is not obtained and not handed over.
        // The lists ("Take food, antipoison, potions…") and "can be in parts" cannot be described by one condition — they are led by the position and the stage.
        const tools = l.t.toLowerCase().replace(/\([^)]*(needed|you need|must be|stake \+ hammer)[^)]*\)/g, '');
        const listed = (tools.match(/,/g) ?? []).length >= 2 || /in parts|all at once/.test(tools);
        // A hand-over can also be "Talk to Dr. Harlow again and give the beer": the verb need not stand first.
        if (n > 0 && l.at && !l.has && !l.need && !listed && /(^|[\s,;:—(])(Give|give|Return|return|Bring|bring|Hand|hand|Deliver|deliver|Take [^.]* to )/.test(l.t)) {
          const text = tools;
          const item = pool.find((it) => mentions(text, it));
          if (item) add('stages-need-missing', `${id}#${st.at}`, `the step "${l.t.slice(0, 40)}…" hands over "${item.name}" — the condition need is required`);
        }
        // "Mine/Take/Pick/Buy X" (not the last step): without has the step does not count when X is already in the bag — the player mined the ore,
        // and the list still asks to mine it (S2-07). One stage item in the text — that is what to specify; two or more — has does not fit.
        if (n < st.do.length - 1 && !l.has && !l.need && !listed && /^(Mine|Take|Pick|Buy|Purchase|Pickup|Get|Obtain|Gather|Dig|Cut|Shear|Grab|Fill)/.test(l.t)) {
          const text = tools;
          // Coins are the price of a purchase, not something the step obtains ("Buy Khali brew … for 5 coins").
          const named = [...new Map(pool.filter((it) => it.name !== 'Coins' && mentions(text, it)).map((it) => [it.name, it])).values()];
          if (named.length === 1) add('stages-has-missing', `${id}#${st.at}`, `the step "${l.t.slice(0, 40)}…" obtains "${named[0].name}" — the condition has is required`);
        }
        // The short text for the game: one line, without dialogue, capitalised.
        const sc = l.s ? firstChar(l.s) : '';
        if (!l.s || l.s.length > 72 || /Dialogue/.test(l.s) || !sc || sc !== sc.toUpperCase() || /\s{2,}/.test(l.s) || /\s$/.test(l.s)) {
          add('stages-short', `${id}#${st.at}`, `the short step text: "${(l.s ?? '').slice(0, 50)}" — s up to 72 characters without dialogue is needed`);
        }
        if (!c || c !== c.toUpperCase() || /\s{2,}/.test(l.t) || /\s$/.test(l.t)) add('text', `${id}#${st.at}`, `the step text: "${l.t.slice(0, 50)}"`);
        // The step highlight (as in Quest Helper): IDs are integers within the game, no more than eight, names non-empty, no repeats.
        if (l.hl) {
          const bad = (['npc', 'obj'] as const).some((k) => {
            const v = l.hl![k];
            return v !== undefined && (!Array.isArray(v) || v.length === 0 || v.length > 8 || new Set(v).size !== v.length || v.some((n) => !Number.isInteger(n) || n < 1 || n > 200000));
          }) || (['on', 'item'] as const).some((k) => {
            const v = l.hl![k];
            return v !== undefined && (!Array.isArray(v) || v.length === 0 || v.length > 8 || new Set(v).size !== v.length || v.some((n) => typeof n !== 'string' || !n.trim() || n.length > 80));
          }) || Object.keys(l.hl).some((k) => !['npc', 'obj', 'on', 'item'].includes(k)) || Object.keys(l.hl).length === 0;
          if (bad) add('stages-hl', `${id}#${st.at}`, `the step highlight "${(l.s ?? '').slice(0, 40)}" is wrong`);
        }
        if (l.at && badPoint(l.at)) add('stages-point', `${id}#${st.at}`, `the tile ${l.at.join(',')} is off the map`);
        if (l.need && !pool.some((it) => it.name === l.need) && !st.do.some((o) => o.has === l.need)) add('stages-need', `${id}#${st.at}`, `the condition "${l.need}" is not among the stage and step items and not in the has of its steps`);
      }
    }
    for (const p of q.route ?? []) {
      for (const t of p.steps) {
        const c = firstChar(t);
        if (!c || c !== c.toUpperCase() || /\s{2,}/.test(t)) add('text', `${id}: ${p.title}`, `the route text: "${t.slice(0, 50)}"`);
      }
    }
  }

  // --- Training methods: unique ids, sensible levels and speeds, places from the dictionary, wiki links ---
  if (input.training) {
    const known = input.skillIds ? new Set(input.skillIds) : null;
    const seenIds = new Set<string>();
    for (const m of input.training.methods) {
      if (seenIds.has(m.id)) add('training-id', m.id, 'a repeated identifier');
      seenIds.add(m.id);
      const skills = Array.isArray(m.skill) ? m.skill : [m.skill];
      if (known) for (const s of skills) if (!known.has(s)) add('training-skill', m.id, `an unknown skill ${s}`);
      if (!Number.isInteger(m.from) || m.from < 1 || m.from > 98) add('training-range', m.id, `the entry level ${m.from}`);
      if (m.to !== null && m.to !== undefined && (!Number.isInteger(m.to) || m.to <= m.from || m.to > 99)) add('training-range', m.id, `the range ${m.from}–${m.to}`);
      if (m.xph && (m.xph.length !== 2 || !(m.xph[0] > 0) || m.xph[1] < m.xph[0])) add('training-rate', m.id, `the speed ${JSON.stringify(m.xph)}`);
      if (m.xpa !== undefined && !(m.xpa > 0)) add('training-rate', m.id, `the XP per action ${m.xpa}`);
      if (m.kind === 'quest' && !(m.xpTotal && m.xpTotal > 0)) add('training-rate', m.id, 'a quest without an XP reward');
      if (!/^https:\/\/oldschool\.runescape\.wiki\/w\//.test(m.url)) add('training-url', m.id, `the link is not to the wiki: ${m.url}`);
      if (input.places && m.place && !(m.place in input.places.locations)) add('training-place', m.id, `the place "${m.place}" is not in the place dictionary`);
      const c = firstChar(m.name);
      if (!c || c !== c.toUpperCase() || !m.where.trim()) add('text', m.id, `the method name or place: "${m.name.slice(0, 40)}"`);
    }
  }
  return out;
}

export function qaLines(issues: QaIssue[]): { lines: string[]; errors: number } {
  if (!issues.length) return { lines: ['  ✓ Consistency: gear, amulets, home teleport, quest stages, training methods — no remarks'], errors: 0 };
  return { lines: issues.map((i) => `  ✗ [${i.rule}] ${i.where}: ${i.message}`), errors: issues.length };
}
