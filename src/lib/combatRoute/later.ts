// Defence the route hands out later without any training: the Defence XP in the rewards of the steps still ahead (Dragon Slayer I gives 18,650, about
// level 33). Defence trained on cows now only helps the fights before that reward, so a Defence plan has to pay for itself in that window. Read from the
// steps' own reward text, so the route stays the one source; a reward the player chooses (Daero's training) is not counted, and neither is a step
// already closed.

import type { Step } from '../../types';

export interface LaterDefence {
  stepId: string;
  title: string;
  xp: number;
}

const EACH_IN_DEFENCE = /([\d,]+) XP each in (?:[A-Za-z]+ and )?Defence/i;
const DEFENCE_XP = /([\d,]+) Defence XP/i;

/** The Defence XP a reward text states outright; 0 when none, or when the reward is a choice. */
export function defenceXpOf(reward: string | undefined): number {
  if (!reward || /\bchoose\b/i.test(reward)) return 0;
  const m = EACH_IN_DEFENCE.exec(reward) ?? DEFENCE_XP.exec(reward);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/** The steps after `stepId` whose reward gives Defence XP, in route order, leaving out the ones already closed. */
export function laterDefence(steps: readonly Step[], stepId: string, done?: (id: string) => boolean): LaterDefence[] {
  const at = steps.findIndex((s) => s.id === stepId);
  if (at < 0) return [];
  const out: LaterDefence[] = [];
  for (const s of steps.slice(at + 1)) {
    const xp = defenceXpOf(s.reward);
    if (xp > 0 && !done?.(s.id)) out.push({ stepId: s.id, title: s.title, xp });
  }
  return out;
}
