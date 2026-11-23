import type { SkillName } from './skillTrack';

export interface F2pSkillAdvice {
  priority: 'good' | 'optional' | 'members' | 'passive';
  target: number | null;
  /** Why the checkpoint stops there: an unlock or a requirement. The training card gives the engine's own method and rate. */
  reason: string;
}

/** Reviewed 2026-11-21 (owner: profitable skills go further in F2P). Authored pre-members checkpoints, not training requirements or XP forecasts. */
export const F2P_SKILL_ADVICE: Partial<Record<SkillName, F2pSkillAdvice>> = {
  cooking: { priority: 'good', target: 70, reason: "Meat, then plain pizzas from 35 and anchovy pizzas from 55, train without losing coins; wine from 35 is the fastest but costs coins. 70 is the Recipe for Disaster level." },
  firemaking: { priority: 'good', target: 50, reason: "Maple logs from 45 are the cheapest Firemaking per XP; 50 opens Wintertodt on members, and maples stay cheap past it for a longer F2P stay." },
  mining: { priority: 'good', target: 60, reason: "Iron is the best F2P Mining from 15; 60 opens the Mining Guild, which free players can use." },
  fishing: { priority: 'good', target: 58, reason: "Fly fishing trout and salmon from 20 is the F2P method, as fast as members methods up to Barbarian Fishing; 35 opens harpoon tuna." },
  woodcutting: { priority: 'optional', target: 36, reason: "36 covers Lost City; willows past it pay little in F2P, yews from 60 a little more." },
  magic: { priority: 'good', target: 70, reason: 'Enchanting amulets and alching gem necklaces pay while they train; 70 is where members Ice Burst becomes far faster.' },
  smithing: { priority: 'good', target: 50, reason: "The Knight's Sword takes Smithing to 29; smelting bars pays to 50, where members Giants' Foundry starts." },
  crafting: { priority: 'good', target: 70, reason: 'Gold and gem jewellery at a furnace pays from the start; 70 opens diamond amulets, and 31 also covers Lost City.' },
  attack: { priority: 'optional', target: 40, reason: '40 is a practical starter checkpoint for F2P combat.' },
  strength: { priority: 'optional', target: 40, reason: '40 is a practical starter checkpoint for F2P combat.' },
  defence: { priority: 'optional', target: 40, reason: "Dragon Slayer I gives Defence XP; 40 wears rune armour, the best F2P armour." },
  ranged: { priority: 'optional', target: 40, reason: "40 opens green d'hide armour." },
  prayer: { priority: 'good', target: 43, reason: "The Restless Ghost gives 9; vile ashes are the cheapest F2P Prayer per XP, and 43 is Protect from Melee, the last prayer free players use." },
  runecraft: { priority: 'members', target: null, reason: 'No F2P grind before members.' },
  hitpoints: { priority: 'passive', target: null, reason: 'It comes with combat training; no separate target.' },
};

/** The owner's F2P order (2026-11-23), one skill at a time after the quests: skills that earn coins, then combat and gathering, then the skills that
 * spend coins (paid from phase 1 profit, not starting coins), Runecraft left for members. */
export const F2P_PHASES: readonly { label: string; skills: readonly SkillName[] }[] = [
  { label: 'Phase 1, earn coins first', skills: ['crafting', 'smithing', 'magic'] },
  { label: 'Phase 2, combat and gathering', skills: ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'woodcutting', 'fishing', 'mining'] },
  { label: 'Phase 3, train from phase 1 profit', skills: ['firemaking', 'prayer', 'cooking'] },
  { label: 'Phase 4, leave for members', skills: ['runecraft'] },
];
export const F2P_ORDER: readonly SkillName[] = F2P_PHASES.flatMap((p) => p.skills);
export const f2pPhaseOf = (skill: string): number => F2P_PHASES.findIndex((p) => (p.skills as readonly string[]).includes(skill)) + 1;

export const F2P_PRIORITY_LABEL ={ good: 'Good F2P value', optional: 'Optional checkpoint', members: 'Prefer members', passive: 'Passive training' } as const;
const MARK = { good: '★', optional: '◇', members: '↓', passive: '·' } as const;

export function f2pAdviceFor(skill: string): F2pSkillAdvice | null {
  return F2P_SKILL_ADVICE[skill as SkillName] ?? null;
}

export function f2pAdviceLabel(advice: F2pSkillAdvice, level?: number): string {
  if (advice.target !== null && level !== undefined && Number.isFinite(level) && level >= advice.target) return `✓ ${advice.target} reached`;
  return advice.target !== null ? `${MARK[advice.priority]} F2P → ${advice.target}`
    : advice.priority === 'members' ? '↓ Prefer members' : '· Passive';
}
