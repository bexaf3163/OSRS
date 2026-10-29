import type { SkillName } from './skillGuide';

export interface F2pSkillAdvice {
  priority: 'good' | 'optional' | 'members' | 'passive';
  target: number | null;
  reason: string;
  comparison: string;
  sources: string[];
  /** Short practical equipment advice; actual usable tools/supplies still come from preparation. */
  equipment?: string;
}

const wiki = (page: string) => `https://oldschool.runescape.wiki/w/${page}`;
/** Reviewed 2026-10-28. Authored pre-members checkpoints, not training requirements or XP forecasts. */
export const F2P_SKILL_ADVICE: Partial<Record<SkillName, F2pSkillAdvice>> = {
  cooking: { priority: 'good', target: 68,
    equipment: "Bring the listed ingredients. Armour and combat amulets do not improve cooking; keep room for the batch.",
    reason: 'A good F2P project if you can afford supplies. Wine starts at 35; bad wine stops at 68.',
    comparison: 'Wine uses the same basic banking and creation method in both modes. Fish cooking and your actual budget can change the best choice; this is not a promise of maximum XP/h.',
    sources: [wiki('Free-to-play_Cooking_training'), wiki('Pay-to-play_Cooking_training')] },
  firemaking: { priority: 'good', target: 50,
    equipment: "Bring a tinderbox and the listed logs. No special F2P outfit or amulet is needed.",
    reason: 'Burning logs is useful F2P preparation for Wintertodt, which opens at 50 on members.',
    comparison: 'Basic log burning is shared. Wintertodt adds a lower-effort members alternative from 50; 50 is a practical stopping point, not an XP-speed cap.',
    sources: [wiki('Pay-to-play_Firemaking_training')] },
  mining: { priority: 'good', target: 45,
    equipment: "Carry your best usable owned pickaxe; wielding needs Attack, carrying works. Bank heavy armour for travel.",
    reason: 'Iron mining is a useful early project. Pause at 45 and compare members methods before a longer grind.',
    comparison: 'Members also use iron at these levels. Their quest skips, Varrock armour, later guild access and tick-manipulation methods can be faster; identical XP/h is not guaranteed.',
    sources: [wiki('Pay-to-play_Mining_training')] },
  fishing: { priority: 'good', target: 35,
    equipment: "Use the listed rod/net and bait. Armour and combat amulets do not improve fishing; leave room for catches.",
    reason: 'Fly fish from 20; 35 is a sensible checkpoint before comparing members methods.',
    comparison: 'The same trout/salmon method is available in both modes. Without tick manipulation, members Tempoross becomes faster from 35. Banking your catch lowers XP/h compared with dropping it.',
    sources: [wiki('Free-to-play_Fishing_training'), wiki('Pay-to-play_Fishing_training')] },
  woodcutting: { priority: 'optional', target: 36,
    equipment: "Carry your best usable owned axe; wielding needs Attack, carrying works. No special F2P amulet is needed.",
    reason: '36 prepares the Woodcutting requirement for Lost City. There is little reason to force a long F2P grind before membership.',
    comparison: 'Basic trees and oaks are comparable early methods. Members teaks open at 35; the extra level to 36 is a quest checkpoint, not a claim of equal training speed.',
    sources: [wiki('Pay-to-play_Woodcutting_training'), wiki('Lost_City')] },
  magic: { priority: 'optional', target: 55,
    reason: '55 unlocks High Level Alchemy. Useful if you want more F2P play, but not a prerequisite for subscribing.',
    comparison: 'High Alchemy has the same spell XP and cast timing in both modes from 55. Reaching 55 in F2P is not as fast as every members alternative. Check expendable targets, rune costs and budget first.',
    sources: [wiki('Pay-to-play_Magic_training')] },
  smithing: { priority: 'good', target: 29,
    reason: "Complete The Knight's Sword: its reward reaches 29 from level 1. Do not grind those early levels instead.",
    comparison: "After the quest checkpoint, members unlock Giants' Foundry and Blast Furnace. This recommendation is about quest value, not equal long-term XP/h.",
    sources: [wiki('Free-to-play_Smithing_training'), wiki('Pay-to-play_Smithing_training')] },
  crafting: { priority: 'optional', target: 31,
    reason: '31 prepares Crafting for Lost City. Treat it as an optional quest checkpoint rather than a reason to train far beyond your route.',
    comparison: 'This is a quest requirement, not an equal-speed claim. Members quest rewards and other methods can change how much direct training is needed.',
    sources: [wiki('Lost_City'), wiki('Optimal_quest_guide')] },
  attack: { priority: 'optional', target: 40,
    reason: '40 is a useful starter combat checkpoint if you are staying F2P for a while.',
    comparison: 'Members quests and training spots can be substantially faster. Keep the current route and affordable equipment plan; this marker does not change them.',
    sources: [wiki('Pay-to-play_melee_training')] },
  strength: { priority: 'optional', target: 40,
    reason: '40 is a practical starter checkpoint for more F2P combat, not a mandatory grind before membership.',
    comparison: 'Members quest rewards and combat spots accelerate training. This checkpoint does not imply that F2P matches their XP/h.',
    sources: [wiki('Pay-to-play_melee_training')] },
  defence: { priority: 'optional', target: 10,
    reason: '10 is an early armour checkpoint if your build allows Defence. Account for upcoming quest XP before training further.',
    comparison: 'Members quest rewards and combat spots are faster options. This is not a recommendation to stop Defence forever or override your selected combat plan.',
    sources: [wiki('Defence'), wiki('Pay-to-play_melee_training')] },
  ranged: { priority: 'optional', target: 40,
    reason: '40 is a useful starter checkpoint if you want to keep playing F2P.',
    comparison: "Members quest XP, Ava's devices and other methods can save time or ammunition. F2P is not equally fast; expensive methods still need an affordable budget.",
    sources: [wiki('Pay-to-play_Ranged_training')] },
  prayer: { priority: 'members', target: null,
    reason: 'No dedicated F2P grind suggested. Use incidental bones if you want; save bulk training for members.',
    comparison: 'Members altar methods give much more XP per bone than burying. Costs, access and Wilderness risk differ; this marker does not choose a risky method for you.',
    sources: [wiki('Pay-to-play_Prayer_training')] },
  runecraft: { priority: 'members', target: null,
    reason: 'No dedicated F2P grind suggested before subscribing.',
    comparison: 'Members quests give early Runecraft XP and unlock Guardians of the Rift. F2P altar runs are not comparable to that progression.',
    sources: [wiki('Pay-to-play_Runecraft_training')] },
  hitpoints: { priority: 'passive', target: null,
    reason: 'Gain Hitpoints through suitable combat; no separate F2P level target.',
    comparison: 'Follow the combat recommendation for your real stats, gear and supplies rather than adding a separate Hitpoints grind.',
    sources: [wiki('Hitpoints')] },
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
