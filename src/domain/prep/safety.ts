import type { Step } from '../../types';
import { THREATS } from '../../data/threats';
import { stepFightNames } from '../combat/fightEstimate';
import type { PrepLine } from './prepPlan';

/**
 * An item no fight of a certain kind may start without: not a level or a quest, but a death when missing. A rule is keyed by the hazard, as the wiki
 * labels the opponent's attack (threats.json, build-threats), never by a step: every step whose fight has that attack gets it, a new one included.
 */
interface SafetyRule { hazard: RegExp; names: string[]; worn?: boolean; label: string; detail: (foe: string, hit: number) => string }
export const SAFETY_RULES: readonly SafetyRule[] = [{
  hazard: /dragonfire/i,
  worn: true,
  names: ['Anti-dragon shield', 'Dragonfire shield', 'Dragonfire ward', 'Ancient wyvern shield'],
  label: 'No Anti-dragon shield with you',
  detail: (foe, hit) => `Do not go without it: ${foe}'s dragonfire hits up to ${hit}. Duke Horacio in Lumbridge Castle gives it free.`,
}];

/** A safety rule a step's fights call for: the items that satisfy it, what to say when none is with the player, and why (the opponent's hit). */
export interface StepSafety { names: string[]; label: string; detail: string; worn?: boolean; equipped?: boolean | null }

/**
 * The safety rules a step's fights call for, read from the step's own facts (its foes and threats against threats.json), never from its code: a step
 * renamed or added later with the same fight gets the same rule.
 */
export function safetyRulesOf(step: Pick<Step, 'foes' | 'threats' | 'pacing'>): StepSafety[] {
  const out: StepSafety[] = [];
  for (const rule of SAFETY_RULES) {
    for (const foe of stepFightNames(step)) {
      const hit = Math.max(0, ...(THREATS[foe]?.hits ?? []).filter((h) => rule.hazard.test(h.label)).map((h) => h.n));
      if (hit > 0) { out.push({ names: rule.names, label: rule.label, detail: rule.detail(foe, hit), ...(rule.worn ? { worn: true } : {}) }); break; }
    }
  }
  return out;
}

/**
 * Ownership and protection are different facts. A known empty equipment slot proves absent worn protection even with an unread bank.
 * An unread equipment list remains unknown; it cannot establish that an owned item is already protecting the player.
 */
export function safetyBlockers(rules: readonly StepSafety[], lines: readonly PrepLine[]): { label: string; detail?: string }[] {
  const out: { label: string; detail?: string }[] = [];
  for (const rule of rules) {
    const mine = lines.filter((l) => rule.names.includes(l.name));
    if (rule.worn && (rule.equipped === true || (rule.equipped === undefined && mine.some(l => l.where === 'EQUIPPED')))) continue;
    if (rule.worn && rule.equipped === null) continue;
    if (rule.worn && rule.equipped === false && (!mine.length || mine.some(l => l.where === 'UNKNOWN'))) {
      out.push({ label: `Equip ${rule.names[0]} before the fight`, detail: rule.detail });
      continue;
    }
    if (!mine.length || mine.some((l) => l.where === 'UNKNOWN')) continue;
    if (!rule.worn && mine.some((l) => l.where === 'INVENTORY' || l.where === 'EQUIPPED')) continue;
    if (rule.worn && mine.some(l => l.where === 'INVENTORY')) {
      out.push({ label: `Equip ${rule.names[0]} before the fight`, detail: rule.detail });
      continue;
    }
    out.push({ label: mine.some((l) => l.where === 'BANK') ? `${rule.names[0]} is in the bank, not with you` : rule.label, detail: rule.detail });
  }
  return out;
}

