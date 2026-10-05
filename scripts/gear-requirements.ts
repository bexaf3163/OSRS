// The wearing requirements from the OSRS Wiki article text. They are not in the wiki data (Bucket) — only in the text, so
// here is a parse of the sentences about wearing: "requires 20 [[Ranged]] to equip", "requires 40 [[Defence]]
// and completion of the [[quest]] [[Dragon Slayer I]]", "by players with 1 [[Ranged]] and 10 [[Defence]]".
// Level 1 is not a requirement. The crafting skills (Smithing, Crafting, Magic for enchanting) in sentences
// without wearing are not counted: "With at least 49 [[Magic]], [[Lvl-3 Enchant]] can be cast…" — not about the amulet of strength.

import type { GearRequirements } from '../src/types/index.ts';

type ReqSkill = 'attack' | 'strength' | 'defence' | 'ranged' | 'magic' | 'prayer';
const S = '(Attack|Strength|Defence|Ranged|Magic|Prayer)';
/** A skill as a link or a plain word: [[Ranged]], [[Ranged|ranged]], Strength. */
const SKILL = `(?:\\[\\[)?${S}(?:\\|[^\\]]*)?(?:\\]\\])?`;
const EQUIP = /\b(equip|wield|wear|worn)/i;

/** The sentences of ordinary paragraphs: without cards, tables, change lists, footnotes and images. */
export function proseSentences(text: string): string[] {
  const clean = text.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const prose = clean.split('\n').filter((l) => l.trim() && !/^\s*([|{}!*#:=]|\[\[(File|Category):)/.test(l));
  return prose.join('\n').split(/(?<=[.!?])\s+(?=[A-Z0-9'[])/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** A sentence about wearing: a wearing verb or "requires" next to a combat skill. */
function aboutWearing(s: string): boolean {
  return EQUIP.test(s) || (/requir/i.test(s) && new RegExp(`\\d+\\s*${SKILL}|${SKILL}\\s+level\\s+of\\s+\\d`, 'i').test(s));
}

/** The skills and levels of one sentence. "20 [[Ranged]] and [[Defence]]" — 20 for both. */
function skillsIn(s: string): [ReqSkill, number][] {
  const out: [ReqSkill, number][] = [];
  const add = (skill: string, level: string) => out.push([skill.toLowerCase() as ReqSkill, Number(level)]);
  for (const m of s.matchAll(new RegExp(`\\{\\{SCP\\|${S}\\|(\\d+)`, 'gi'))) add(m[1], m[2]);
  for (const m of s.matchAll(new RegExp(`(\\d+)\\s*${SKILL}(?:\\s+and\\s+${SKILL}(?!\\s*level))?`, 'gi'))) {
    add(m[2], m[1]);
    if (m[3]) add(m[3], m[1]);
  }
  for (const m of s.matchAll(new RegExp(`${SKILL}\\s+level\\s+of\\s+(\\d+)`, 'gi'))) add(m[1], m[2]);
  for (const m of s.matchAll(new RegExp(`level\\s+(\\d+)\\s+in\\s+${SKILL}`, 'gi'))) add(m[2], m[1]);
  return out;
}

/** A quest without which it cannot be worn: "completion of the [[quest]] [[Dragon Slayer I]]". "does not require" is not a requirement. */
function questsIn(s: string): string[] {
  if (/\b(not|n't|without)\b/i.test(s)) return [];
  return [...s.matchAll(/\b(?:completion of|completed|completing)\s+(?:the\s+)?(?:\[\[quest\]\]\s+)?\[\[([^\]|#]+)/gi)].map((m) => m[1].trim());
}

const NONE = /\bno\s+(?:\[\[[^\]]+\]\]\s+|level\s+|combat skill\s+)?requirements?\b|\bany player\b/i;

/** Collect the requirements from the sentences. null — the article is silent about them, 'none' — it says outright that there are none. */
function fromSentences(sentences: string[]): GearRequirements | 'none' | null {
  const req: GearRequirements = {};
  let found = false;
  let none = false;
  for (const s of sentences) {
    if (!aboutWearing(s)) continue;
    for (const [skill, level] of skillsIn(s)) {
      found = true;
      if (level > 1) req[skill] = Math.max(req[skill] ?? 0, level);
    }
    const quests = questsIn(s);
    if (quests.length) { found = true; req.quests = [...new Set([...(req.quests ?? []), ...quests])]; }
    if (NONE.test(s)) none = true;
  }
  if (found) return req;
  return none ? 'none' : null;
}

/** The requirements from the item article. */
export function requirementsFromText(text: string): GearRequirements | 'none' | null {
  return fromSentences(proseSentences(text));
}

/**
 * A general rule from the set article ("Adamant equipment", "Leather armour"): "Adamant weapons require an [[Attack]]
 * level of 30 to wield, except for the adamant cane and adamant warhammer…". The rule before "except" is general;
 * an item named in the exception (kind — "warhammer") is not checked against it.
 */
export function setRule(text: string, part: 'weapons' | 'armour', kind: string): GearRequirements | 'none' | null {
  const other = part === 'weapons' ? 'armour' : 'weapons';
  for (const s of proseSentences(text)) {
    if (!new RegExp(`\\b${part}\\b`, 'i').test(s) || new RegExp(`\\b${other}\\b`, 'i').test(s)) continue;
    const [rule, exception = ''] = s.split(/,?\s+(?:except|with the exception)\b/i);
    if (exception.toLowerCase().includes(kind.toLowerCase())) return null;
    const r = fromSentences([rule]);
    if (r === 'none' || (r && Object.keys(r).length <= 1)) return r;
  }
  return null;
}

/**
 * The overview "Free-to-play PvP equipment": an item in the jewellery section ("jewellery typically has no combat skill
 * requirements to wear") or armor without defence requirements, and its row has no mark about a requirement.
 * ("''Note'': 20 [[ranged]] level requirement").
 */
export function listedWithoutRequirements(text: string, name: string): boolean {
  const parts = text.split(/^==([^=].*?)==\s*$/m);
  const row = new RegExp(`^\\|\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|`, 'i');
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const body = parts[i + 1] ?? '';
    const section = title === 'Armour with no defence requirements' || (title === 'Jewellery' && /no combat skill requirements to wear/i.test(body));
    const line = section ? body.split('\n').find((l) => row.test(l)) : undefined;
    if (line && !/requirement/i.test(line)) return true;
  }
  return false;
}
