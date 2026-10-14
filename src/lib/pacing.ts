// The training pace texts for the app (the same as the plugin writes in the micro HUD).

import type { PacingState } from '../services/runeliteBridge';
import type { StepPacing } from '../types';

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

/** The melee attack style whose XP goes to the skill, as the plugin names it; undefined for a skill that is not melee. */
export const PACING_STYLE: Partial<Record<PacingState['skill'], string>> = { attack: 'Accurate', strength: 'Aggressive', defence: 'Defensive' };

/** Each skill's goal on the step: its own (`goals`, S3-08's Attack 30) or the step's targetLevel. */
export function pacingLevels(sp: Pick<StepPacing, 'skill' | 'also' | 'targetLevel' | 'goals'>): Partial<Record<PacingState['skill'], number>> {
  return Object.fromEntries([sp.skill, ...(sp.also ?? [])].map((k) => [k, sp.goals?.[k]?.level ?? sp.targetLevel]));
}

/**
 * "34 shrimps to 20 Fishing"; a combat skill names its style: "35 minotaurs to 20 Strength on Aggressive". Several combat skills: when the shown
 * skill has reached its goal and the others have not: "✓ 20 Strength - next Attack: switch to Accurate"; when all are ready, all are named,
 * each with its own level when the step's goals differ (`levels`, from pacingLevels).
 */
export function pacingText(
  p: PacingState, actionName: string, all: readonly PacingState['skill'][] = [p.skill],
  levels?: Partial<Record<PacingState['skill'], number>>,
): string {
  if (p.done && p.left.length) {
    const style = PACING_STYLE[p.left[0]];
    return `✓ ${p.targetLevel} ${PACING_SKILL[p.skill]} - next ${PACING_SKILL[p.left[0]]}: ${style ? `switch to ${style}` : 'change attack style'}`;
  }
  const skills = all.length > 1 ? all : [p.skill];
  if (p.done && levels && new Set(skills.map((k) => levels[k] ?? p.targetLevel)).size > 1) {
    return `✓ Target levels reached: ${skills.map((k) => `${levels[k] ?? p.targetLevel} ${PACING_SKILL[k]}`).join(', ')}`;
  }
  if (p.done) return `✓ Target level reached: ${p.targetLevel} ${skills.map((k) => PACING_SKILL[k]).join(', ')}`;
  const style = PACING_STYLE[p.skill];
  const line = `${p.actionsLeft} ${actionForm(actionName, p.actionsLeft)} to ${p.targetLevel} ${PACING_SKILL[p.skill]}${style ? ` on ${style}` : ''}`;
  return p.almost ? `✓ Almost done: ${line}` : line;
}

/** "then Strength and Defence": what else to train on this combat step after the shown skill. */
export function pacingNext(p: PacingState): string {
  if (p.done || !p.left.length) return '';
  const names = p.left.map((k) => PACING_SKILL[k]);
  return `then ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`;
}
