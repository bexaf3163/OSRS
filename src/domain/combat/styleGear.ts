// "What to wear for magic and ranged": the wiki's recommendations (styleGear.json, build-style-gear) for your levels, quests and wallet.
// The wiki's slot options go from the best to the available. We take the best suitable one that you already have, otherwise — by your means.

import { styleGearJson as styleJson } from '../../data';

export interface StyleReq { skill: string; level: number }
export interface StyleOption { names: string[]; reqs: StyleReq[]; quests: string[]; note?: string }
export type StyleSlots = Record<string, StyleOption[]>;

export const STYLE_GEAR = styleJson as unknown as { generatedAt: string; magic: StyleSlots; ranged: StyleSlots };
/** A wearable option needs positive evidence for every requirement, unlike an informational unlock row. */
export function usableStyleOption(o: StyleOption, level: (skill: string) => number | undefined, questDone: (quest: string) => boolean): boolean {
  return o.reqs.every((r) => { const have = level(r.skill); return have !== undefined && have >= r.level; }) && o.quests.every(questDone);
}

/** The wiki note "(Maple shortbow only)" / "(Willow shortbow or higher)": arrows do not suit every bow. */
export function ammoFits(o: StyleOption, weapon: string | null, weapons: readonly StyleOption[]): string | null {
  const m = /^\((.+?) (only|or higher)\)$/.exec(o.note ?? '');
  if (!m || !weapon) return null;
  const rank = (n: string) => weapons.findIndex((w) => w.names.includes(n));
  const mine = rank(weapon);
  const need = rank(m[1]);
  if (mine < 0 || need < 0) return null;
  const ok = m[2] === 'only' ? mine === need : mine <= need;
  return ok ? null : `${o.names[0]} ${m[2] === 'only' ? `only with ${m[1]}` : `from ${m[1]}`}`;
}
