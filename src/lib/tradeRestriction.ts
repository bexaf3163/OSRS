// A new free-to-play account cannot sell some items on the Grand Exchange until it has 20 hours of logged-in time, 10 quest points and 100 total
// level (OSRS Wiki, "Account", new account restrictions: all three must hold). Buying is not restricted. The route sells cowhides and iron ore
// (S1-13, S2-01, S3-06), so the guide has to know whether that works yet.
//
// What the game lets us read: quest points and total level. The hours of play are not observable, so the answer is one of three:
//   RESTRICTED - a condition the game told us is not met: selling those items surely fails;
//   UNKNOWN    - what we can read is met (or cannot be read) and the hours are not observable: selling probably works, say so with a caveat;
//   LIFTED     - the player told us the restrictions are gone.
// UNKNOWN is never shown as RESTRICTED or as LIFTED (PROJECT_GUIDELINES: PRESENT | MISSING | UNKNOWN).

import { nameKey } from './checklist';

/** The conditions that lift the restrictions, all of them. */
export const LIFT = { questPoints: 10, totalLevel: 100, hours: 20 } as const;

/** The items a restricted account cannot sell on the Grand Exchange: the wiki's list (40 names). */
export const RESTRICTED_ITEMS: readonly string[] = [
  'Oak logs', 'Willow logs', 'Yew logs', 'Raw shrimps', 'Shrimps', 'Raw anchovies', 'Anchovies', 'Raw lobster', 'Lobster', 'Clay', 'Soft clay',
  'Copper ore', 'Tin ore', 'Iron ore', 'Silver ore', 'Gold ore', 'Coal', 'Mithril ore', 'Adamantite ore', 'Runite ore', 'Ashes', 'Vial',
  'Vial of water', 'Jug of water', 'Fishing bait', 'Feather', 'Eye of newt', 'Wine of Zamorak', 'Air rune', 'Water rune', 'Earth rune', 'Fire rune',
  'Mind rune', 'Chaos rune', 'Cowhide', 'Leather', "Red spiders' eggs", 'Hard leather', 'Steel bar', 'Redberries',
];

const KEYS = new Set(RESTRICTED_ITEMS.map(nameKey));

/** Whether the item is one a restricted account cannot sell. Plural and singular both match ("Cowhides", "Feathers"). */
export function isRestrictedItem(name: string): boolean {
  const k = nameKey(name);
  return KEYS.has(k) || (k.endsWith('s') && KEYS.has(k.slice(0, -1))) || KEYS.has(`${k}s`);
}

/**
 * The money-making methods (moneyMaking.json ids) whose product is on the list, early enough for a new account to try them. Their income needs
 * the sale, so a restricted account is shown them apart from the ones that work.
 */
export const RESTRICTED_METHOD_IDS: readonly string[] = [
  'tanning-cowhide', 'collecting-and-tanning-cowhide', 'killing-cows-and-tanning-cowhide', 'mining-iron-ore-free-to-play', 'collecting-iron-ore',
  'mining-coal-free-to-play', 'mining-clay', 'smelting-steel-bars', 'catching-lobsters', 'catching-lobsters-free-to-play', 'cutting-oak-logs',
  'cutting-yew-logs-free-to-play', 'collecting-ashes', 'collecting-red-spiders-eggs-free-to-play', 'buying-feather-packs', 'buying-jug-packs',
  'mining-adamantite-ore-free-to-play', 'mining-runite-ore-free-to-play', 'collecting-nature-runes', 'collecting-chaos-runes',
];

export type TradeState = 'RESTRICTED' | 'UNKNOWN' | 'LIFTED';

export interface TradeUnmet {
  what: 'quest points' | 'total level';
  have: number;
  need: number;
}

export interface TradeRestriction {
  state: TradeState;
  /** The readable conditions that are not met. */
  unmet: TradeUnmet[];
  /** What could not be read: the hours always; a number the game did not give too. */
  unread: ('hours' | 'quest points' | 'total level')[];
  /** Where the answer comes from. */
  by: 'player' | 'game';
}

/** The override a player can set: they can already sell these items ("lifted"), or they cannot ("active"). Absent means decide from the game. */
export type SellOverride = 'lifted' | 'active' | undefined;

export interface TradeInput {
  /** The game's quest points, or null. The route's own count is not used: it is a lower bound (quests off the route count in the game), so it proves nothing. */
  questPoints: number | null;
  /** The game's total level, or null. */
  totalLevel: number | null;
  override?: SellOverride;
}

export function tradeRestriction(i: TradeInput): TradeRestriction {
  const qp = i.questPoints !== null && Number.isFinite(i.questPoints) ? i.questPoints : null;
  const total = i.totalLevel !== null && Number.isFinite(i.totalLevel) ? i.totalLevel : null;
  if (i.override === 'lifted') return { state: 'LIFTED', unmet: [], unread: [], by: 'player' };
  const unmet: TradeUnmet[] = [];
  if (qp !== null && qp < LIFT.questPoints) unmet.push({ what: 'quest points', have: qp, need: LIFT.questPoints });
  if (total !== null && total < LIFT.totalLevel) unmet.push({ what: 'total level', have: total, need: LIFT.totalLevel });
  if (i.override === 'active') return { state: 'RESTRICTED', unmet, unread: [], by: 'player' };
  const unread: TradeRestriction['unread'] = ['hours'];
  if (qp === null) unread.push('quest points');
  if (total === null) unread.push('total level');
  return { state: unmet.length ? 'RESTRICTED' : 'UNKNOWN', unmet, unread, by: 'game' };
}

/** The total level from the levels the game gave: only when every skill is there, never a partial sum. */
export const ALL_SKILLS = [
  'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
  'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecraft', 'hunter', 'construction',
] as const;

export function totalLevelOf(levels: Readonly<Record<string, number | undefined>> | null): number | null {
  if (!levels) return null;
  let sum = 0;
  for (const s of ALL_SKILLS) {
    const v = levels[s];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}

/** One line for the card: what is unmet, or what cannot be known. */
export function restrictionSummary(r: TradeRestriction): string {
  if (r.state === 'LIFTED') return r.by === 'player' ? 'You marked the restrictions as lifted.' : 'The restrictions are lifted.';
  const parts = r.unmet.map((u) => `${u.what} ${u.have} of ${u.need}`);
  if (r.state === 'RESTRICTED') {
    return parts.length
      ? `Not lifted yet: ${parts.join(', ')}. Both numbers and 20 hours of play are needed.`
      : 'You marked the restrictions as still active.';
  }
  return `${LIFT.questPoints} quest points and total level ${LIFT.totalLevel} are ${r.unread.includes('quest points') || r.unread.includes('total level') ? 'not readable' : 'reached'}; the ${LIFT.hours} hours of play cannot be read from the game.`;
}
