// The training pace texts for the app (the same as the plugin writes in the micro HUD).

import type { PacingState } from '../services/runeliteBridge';

export const PACING_ICON: Record<PacingState['skill'], string> = {
  fishing: '🐟', woodcutting: '🪵', cooking: '🍖', mining: '⛏️', attack: '⚔️', strength: '💪', defence: '🛡️',
};
/** What the skill is called in the game's skills tab: the plugin writes it the same way. */
export const PACING_SKILL: Record<PacingState['skill'], string> = {
  fishing: 'Fishing', woodcutting: 'Woodcutting', cooking: 'Cooking', mining: 'Mining', attack: 'Attack', strength: 'Strength', defence: 'Defence',
};

/** The word form for a number from "shrimp|shrimps": the first for 1, the last otherwise; a single form as is. */
export function actionForm(forms: string, n: number): string {
  const f = forms.split('|');
  return n === 1 ? f[0] : f[f.length - 1];
}

/** "≈ 7 min"; without measurements "calculating the time..."; an estimate from the step's data is marked "approx.". */
export function etaText(p: Pick<PacingState, 'etaSeconds' | 'estimated'>): string {
  if (p.etaSeconds === null) return 'calculating the time...';
  const min = Math.round(p.etaSeconds / 60);
  return `${p.estimated ? 'approx. ' : '≈ '}${min < 1 ? 'under a minute' : `${min} min`}`;
}

/**
 * "34 shrimps to 20 Fishing". Combat (several skills with one goal): when the shown skill has reached the goal
 * and the others have not: "✓ 30 Attack - next Strength: change attack style"; when all are ready, all are named.
 */
export function pacingText(p: PacingState, actionName: string, all: readonly PacingState['skill'][] = [p.skill]): string {
  if (p.done && p.left.length) return `✓ ${p.targetLevel} ${PACING_SKILL[p.skill]} - next ${PACING_SKILL[p.left[0]]}: change attack style`;
  if (p.done) return `✓ Target level reached: ${p.targetLevel} ${(all.length > 1 ? all : [p.skill]).map((k) => PACING_SKILL[k]).join(', ')}`;
  const line = `${p.actionsLeft} ${actionForm(actionName, p.actionsLeft)} to ${p.targetLevel} ${PACING_SKILL[p.skill]}`;
  return p.almost ? `✓ Almost done: ${line}` : line;
}

/** "then Strength and Defence": what else to train on this combat step after the shown skill. */
export function pacingNext(p: PacingState): string {
  if (p.done || !p.left.length) return '';
  const names = p.left.map((k) => PACING_SKILL[k]);
  return `then ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`;
}
