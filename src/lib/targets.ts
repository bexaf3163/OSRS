// Level targets from a step title: "Fishing to 20 and Cooking to 15" → fishing 20, cooking 15.
// No relative imports: the file is used by both the app and the check scripts in Node.

import type { Target } from '../types/index.ts';

/** Word stems in step titles → skill level ids. */
const TITLE_SKILL_WORDS: [RegExp, string[]][] = [
  [/^combat$/, ['attack', 'strength', 'defence']],
  [/^fishing$/, ['fishing']],
  [/^cooking$/, ['cooking']],
  [/^woodcutting$/, ['woodcutting']],
  [/^firemaking$/, ['firemaking']],
  [/^mining$/, ['mining']],
  [/^smithing$/, ['smithing']],
  [/^magic$/, ['magic']],
  [/^prayer$/, ['prayer']],
  [/^crafting$/, ['crafting']],
  [/^runecraft(?:ing)?$/, ['runecraft']],
  [/^agility$/, ['agility']],
  [/^ranged$/, ['ranged']],
  [/^slayer$/, ['slayer']],
];

/** The words go in order; the number after "to" goes to all the skills named before it. */
export function titleTargets(title: string): Target[] {
  const out: Target[] = [];
  let pending: string[] = [];
  for (const m of title.matchAll(/\bto (\d+)|(\p{L}+)/gu)) {
    if (m[1]) {
      for (const skill of pending) if (!out.some((t) => t.skill === skill)) out.push({ skill, level: Number(m[1]) });
      pending = [];
      continue;
    }
    const word = m[2].toLowerCase();
    const hit = TITLE_SKILL_WORDS.find(([re]) => re.test(word));
    if (hit) pending.push(...hit[1]);
  }
  return out;
}
