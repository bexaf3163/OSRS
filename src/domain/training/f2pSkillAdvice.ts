import type { SkillName } from './skillTrack';

export interface F2pSkillAdvice {
  priority: 'good' | 'optional' | 'members' | 'passive';
  target: number | null;
  reason: string;
  comparison: string;
  sources: string[];
}

const wiki = (page: string) => `https://oldschool.runescape.wiki/w/${page}`;
/** Reviewed 2026-11-02. Authored pre-members checkpoints, not training requirements or XP forecasts. */
export const F2P_SKILL_ADVICE: Partial<Record<SkillName, F2pSkillAdvice>> = {
  cooking: { priority: 'good', target: 68,
    reason: 'Wine from 35 is the fastest Cooking in both modes (up to 470,000–490,000 XP/h at 68; about 66 gp lost per jug). Pizzas at Al Kharid give up to 180,000 XP/h from 35.',
    comparison: 'Members add 1-tick karambwans from 30 (about 464,000 XP/h, needs Tai Bwo Wannai Trio). Wine stays the cheap choice in both modes.',
    sources: [wiki('Free-to-play_Cooking_training'), wiki('Pay-to-play_Cooking_training')] },
  firemaking: { priority: 'good', target: 50,
    reason: 'Burn logs next to a bank to 50: Wintertodt opens at 50 on members.',
    comparison: 'Members: Wintertodt from 50 gives about 161,000 Firemaking XP/h at 50 and 193,000 at 60, plus supply crates. F2P log burning past 50 is far slower.',
    sources: [wiki('Pay-to-play_Firemaking_training')] },
  mining: { priority: 'good', target: 45,
    reason: 'Iron with a rune pickaxe from 41 is the best F2P Mining, about 50,000 XP/h; after 45 F2P only repeats iron (or calm barronite in Camdozaal).',
    comparison: 'Members from 45: 3-tick granite (about 87,000 XP/h at 45), Mining Guild iron from 60 (70,000–80,000) and the calm Motherlode Mine from 30, whose nuggets buy the prospector kit. Six quests (The Dig Site alone gives 15,300 XP) reach level 37 with no grinding.',
    sources: [wiki('Free-to-play_Mining_training'), wiki('Pay-to-play_Mining_training')] },
  fishing: { priority: 'good', target: 35,
    reason: 'Fly fish trout from 20 and salmon from 30 (about 13,000 XP/h at 20, 25,000 at 30, dropping the catch). 35 opens harpoon tuna and is a sensible stop.',
    comparison: 'Members: Tempoross from 35 (about 30,000 XP/h), 3-tick fly fishing (68,000 at 60), barbarian fishing from 48 and drift nets from 47 (53,000–72,000).',
    sources: [wiki('Free-to-play_Fishing_training'), wiki('Pay-to-play_Fishing_training')] },
  woodcutting: { priority: 'optional', target: 36,
    reason: 'Oaks are the best F2P Woodcutting XP until 60 when you drop the logs. 36 prepares the Lost City requirement; a long F2P grind is not worth it.',
    comparison: 'Members: teaks from 35 (about 34,000 XP/h, 78,000 with 2-tick), hollow trees at 45 (about 70,000) and maples from 45 (about 50,000).',
    sources: [wiki('Pay-to-play_Woodcutting_training'), wiki('Lost_City')] },
  magic: { priority: 'optional', target: 55,
    reason: '55 unlocks High Level Alchemy. F2P climbs from strikes to bolts (17) and blasts (41); Superheat Item from 43 trains Smithing too.',
    comparison: 'Members: Camelot Teleport from 45 (about 80,000 XP/h), Lvl-3 Enchant from 49 (94,400) and alchemy at the same 78,000 XP/h. Quests give about 20,900 XP to 34.',
    sources: [wiki('Pay-to-play_Magic_training')] },
  smithing: { priority: 'good', target: 29,
    reason: "Complete The Knight's Sword (12,725 XP): from level 1 it reaches 29. Do not grind those early levels instead.",
    comparison: "Members: the Blast Furnace (steel bars about 94,500 XP/h at 30, gold bars about 380,000 with goldsmith gauntlets from 40) and Giants' Foundry from 15.",
    sources: [wiki('Free-to-play_Smithing_training'), wiki('Pay-to-play_Smithing_training')] },
  crafting: { priority: 'optional', target: 31,
    reason: '31 prepares Crafting for Lost City. Treat it as a quest checkpoint rather than a reason to train far beyond your route.',
    comparison: 'Members: cutting gems from 20 (139,000–299,000 XP/h), glassblowing (30,000–92,000) and battlestaves from 54 (245,000–306,000).',
    sources: [wiki('Lost_City'), wiki('Optimal_quest_guide')] },
  attack: { priority: 'optional', target: 40,
    reason: '40 is a useful starter checkpoint if you are staying F2P for a while.',
    comparison: 'Members: Waterfall Quest gives 13,750 Attack and Strength, and The Grand Tree 18,400 Attack; Gemstone Crab trains 30-55 and Nightmare Zone opens at 60.',
    sources: [wiki('Pay-to-play_melee_training')] },
  strength: { priority: 'optional', target: 40,
    reason: '40 is a practical starter checkpoint for more F2P combat, not a mandatory grind before membership.',
    comparison: 'Members: Waterfall Quest gives 13,750 Strength; Gemstone Crab trains 30-55 and Nightmare Zone opens at 60.',
    sources: [wiki('Pay-to-play_melee_training')] },
  defence: { priority: 'optional', target: 10,
    reason: '10 is an early armour checkpoint if your build allows Defence. Account for upcoming quest XP before training further.',
    comparison: 'Members: Holy Grail gives 15,300 Defence; Gemstone Crab and Nightmare Zone train it with the other melee skills.',
    sources: [wiki('Defence'), wiki('Pay-to-play_melee_training')] },
  ranged: { priority: 'optional', target: 40,
    reason: "40 opens green d'hide and the maple shortbow with adamant arrows; Brutus after The Ides of Milk is the best F2P Ranged XP (45,000–50,000 XP/h at 63).",
    comparison: 'Members: three quests give 16,662 Ranged XP (to 32), Temple of Ikov to 36, and chinchompas from 45 give about 290,000 XP/h.',
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
