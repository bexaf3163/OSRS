// Цели по уровням из названия шага: «Рыбалка до 20 и готовка до 15» → fishing 20, cooking 15.
// Без относительных импортов: файл используют и приложение, и скрипты проверки в Node.

import type { Target } from '../types/index.ts';

/** Корни слов в названиях шагов → id уровней навыков. */
const TITLE_SKILL_WORDS: [RegExp, string[]][] = [
  [/^бой$/, ['attack', 'strength', 'defence']],
  [/^рыбалк/, ['fishing']],
  [/^готовк/, ['cooking']],
  [/^рубк/, ['woodcutting']],
  [/^костр/, ['firemaking']],
  [/^добыч/, ['mining']],
  [/^кузнечн/, ['smithing']],
  [/^маги/, ['magic']],
  [/^молитв/, ['prayer']],
  [/^ремесл/, ['crafting']],
  [/^создани/, ['runecraft']],
  [/^ловкост/, ['agility']],
];

/** Слова идут по порядку; число после «до» достаётся всем навыкам, названным перед ним. */
export function titleTargets(title: string): Target[] {
  const out: Target[] = [];
  let pending: string[] = [];
  for (const m of title.matchAll(/до (\d+)|(\p{L}+)/gu)) {
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
