import type { SkillName } from './skillTrack';

export interface F2pSkillAdvice {
  priority: 'good' | 'optional' | 'members' | 'passive';
  target: number | null;
  /** Why the checkpoint stops there: an unlock or a requirement. The training card gives the engine's own method and rate. */
  reason: string;
}

/** Reviewed 2026-11-11. Authored pre-members checkpoints, not training requirements or XP forecasts. */
export const F2P_SKILL_ADVICE: Partial<Record<SkillName, F2pSkillAdvice>> = {
  cooking: { priority: 'good', target: 68, reason: 'Wine is the fastest Cooking from 35, and it stops burning at 68.' },
  firemaking: { priority: 'good', target: 50, reason: 'Wintertodt opens at 50 on members; F2P log burning past it is slow.' },
  mining: { priority: 'good', target: 45, reason: 'Iron is the best F2P Mining from 15; members methods (granite) start at 45.' },
  fishing: { priority: 'good', target: 35, reason: 'Trout and salmon from 20; 35 opens harpoon tuna and is a sensible stop.' },
  woodcutting: { priority: 'optional', target: 36, reason: "36 covers Lost City's Woodcutting requirement; a longer F2P grind is not worth it." },
  magic: { priority: 'optional', target: 55, reason: '55 unlocks High Level Alchemy.' },
  smithing: { priority: 'good', target: 29, reason: "The Knight's Sword alone takes Smithing from 1 to 29: do not grind those levels." },
  crafting: { priority: 'optional', target: 31, reason: "31 covers Lost City's Crafting requirement." },
  attack: { priority: 'optional', target: 40, reason: '40 is a practical starter checkpoint for F2P combat.' },
  strength: { priority: 'optional', target: 40, reason: '40 is a practical starter checkpoint for F2P combat.' },
  defence: { priority: 'optional', target: 10, reason: 'An early armour checkpoint: count upcoming quest XP before training further.' },
  ranged: { priority: 'optional', target: 40, reason: "40 opens green d'hide armour." },
  prayer: { priority: 'members', target: null, reason: 'No F2P grind: bury the bones you get; altars are a members method.' },
  runecraft: { priority: 'members', target: null, reason: 'No F2P grind before members.' },
  hitpoints: { priority: 'passive', target: null, reason: 'It comes with combat training; no separate target.' },
};

export const F2P_PRIORITY_LABEL = { good: 'Good F2P value', optional: 'Optional checkpoint', members: 'Prefer members', passive: 'Passive training' } as const;
const MARK = { good: '★', optional: '◇', members: '↓', passive: '·' } as const;

export function f2pAdviceFor(skill: string): F2pSkillAdvice | null {
  return F2P_SKILL_ADVICE[skill as SkillName] ?? null;
}

export function f2pAdviceLabel(advice: F2pSkillAdvice, level?: number): string {
  if (advice.target !== null && level !== undefined && Number.isFinite(level) && level >= advice.target) return `✓ ${advice.target} reached`;
  return advice.target !== null ? `${MARK[advice.priority]} F2P → ${advice.target}`
    : advice.priority === 'members' ? '↓ Prefer members' : '· Passive';
}
