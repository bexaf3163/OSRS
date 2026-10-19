// Who may buy in a shop. The item data names a shop and its town but not what opens it, so a shop was suggested by distance alone: Scavvo's Rune Store
// stands in the Champions' Guild (32 quest points), Yarsul's in the Mining Guild (Mining 60), Bandit Duty Free in the Wilderness. Before a shop is
// recommended its access is checked here against the player's state:
//   open        — nothing to unlock (a toll or a fare is a cost, said in the label);
//   conditional — it needs something the app cannot confirm yet (quest points before the game reports them): offered only as "if …", never first;
//   blocked     — the player cannot or should not go: an unmet requirement, a members shop on a free account, the Wilderness;
//   unverified  — a shop this table does not know: never the primary destination, labelled as not checked.
// Requirements are from the OSRS Wiki (each shop's page and the guild's entry requirement).

import type { GameMode } from '../types';
import { nameKey } from './checklist';
import type { Known } from './playerState';

export type AccessState = 'open' | 'conditional' | 'blocked' | 'unverified';

export interface ShopAccess {
  state: AccessState;
  /** What opens it, for "if …" and "needs …": "32 quest points", "Mining 60", "Dragon Slayer I". */
  requirement?: string;
  /** A quest is "done"; quest points and levels are "had". */
  kind?: 'quest' | 'level';
  /** Why it is blocked, or what to know (a fare). */
  note?: string;
  /** Coins to get there and back in, beyond the price: the Karamja boat. */
  fare?: number;
}

interface Rule {
  qp?: number;
  quest?: string;
  skill?: { id: string; name: string; level: number };
  /** In the Wilderness: other players can attack and take what you carry. */
  wilderness?: boolean;
  members?: boolean;
  fare?: { gp: number; how: string };
  /** Where it is, for the label: "in the Champions' Guild". */
  where?: string;
}

const GUILD_QP = { qp: 32, where: "in the Champions' Guild" };
const MINING_GUILD = { skill: { id: 'mining', name: 'Mining', level: 60 }, where: 'in the Mining Guild' };
const KARAMJA_BOAT = { fare: { gp: 30, how: 'the boat from Port Sarim, 30 gp each way' } };

/** Shops with something to unlock or avoid, by name (lower case, no trailing full stop). */
const RULES: Record<string, Rule> = {
  "scavvo's rune store": GUILD_QP,
  "valaine's shop of champions": GUILD_QP,
  'oziach (shop)': { quest: 'Dragon Slayer I' },
  "yarsul's prodigious pickaxes": MINING_GUILD,
  "hendor's awesome ores": MINING_GUILD,
  'bandit duty free': { wilderness: true },
  'the old nite': { wilderness: true, members: true },
  'silk merchant': { members: true },
  anwen: { members: true },
  'bartender (the warrens)': { members: true },
  lunderwin: { members: true },
  'karamja general store': KARAMJA_BOAT,
  'karamja wines, spirits, and beers': KARAMJA_BOAT,
};

/** Free-world shops anyone can walk into (the Al Kharid toll is added by the router as a cost). */
const OPEN = new Set([
  'al kharid general store', "dommik's crafting store", 'gem trader', "louie's armoured legs bazaar", "ranael's super skirt store", "zeke's superior scimitars",
  'silk trader', "aubury's rune shop", "lowe's archery emporium", "horvik's armour shop", "thessalia's fine clothes", 'varrock general store', 'varrock swordshop',
  "zaff's superior staffs!", 'blue moon inn', 'dancing donkey inn', 'jolly boar inn', "betty's magic emporium", "gerrant's fishy business",
  "brian's battleaxe bazaar", 'food store', 'rusty anchor inn', "cassie's shield shop", "flynn's mace market", "herquin's gems",
  "wayne's chains! - chainmail specialist", 'falador general store', 'rising sun inn', "bob's brilliant axes", 'lumbridge general store', 'helmet shop',
  'edgeville general store', 'rimmington general store', "rommik's crafty supplies", "diango's toy store", "ned's handmade rope (100% wool)",
  "drogo's mining emporium", "nurmof's pickaxe shop", 'dwarven shopping store',
]);

/** Shops the item data lists without a town: where they stand, for the toll and the map. */
export const SHOP_TOWN: Record<string, string> = { 'silk trader': 'Al Kharid' };

export const shopKey = (name: string): string => nameKey(name).replace(/\.$/, '');

export interface AccessContext {
  mode: GameMode;
  /** The quests the game counts as done; unknown until it reports them. */
  quests: Known<string[]>;
  /** The game's quest points; null until it reports them (the route's own count is not proof). */
  qp: number | null;
  /** A skill level the game or the profile knows; null when unknown. */
  level: (skill: string) => number | null;
}

export function shopAccess(shopName: string, location: string, ctx: AccessContext): ShopAccess {
  const key = shopKey(shopName);
  const rule = RULES[key];
  if (rule?.wilderness || /wilderness/i.test(location)) {
    return { state: 'blocked', note: 'in the Wilderness: other players can attack you there and take what you carry' };
  }
  if (rule?.members && ctx.mode === 'f2p') return { state: 'blocked', note: 'a members shop' };
  const byRule = rule ? shopAccessByRule(rule, ctx) : null;
  if (byRule) return byRule;
  if (OPEN.has(key)) return { state: 'open' };
  // A members shop on a members account: its area may still be locked behind a quest this table does not know.
  return { state: 'unverified', note: 'entry requirements not checked' };
}

/** The checks a rule asks for (quest points, a quest, a level, a fare); null when the rule asks for none of them. */
function shopAccessByRule(rule: Rule, ctx: AccessContext): ShopAccess | null {
  if (rule.qp !== undefined) {
    const requirement = `${rule.qp} quest points`;
    if (ctx.qp === null) return { state: 'conditional', requirement, note: `${rule.where ?? 'behind a door'}: your quest points are not known yet` };
    return ctx.qp >= rule.qp ? { state: 'open', requirement } : { state: 'blocked', requirement, note: `needs ${requirement}, you have ${ctx.qp}` };
  }
  if (rule.quest) {
    const done = ctx.quests.known ? ctx.quests.value.some((q) => nameKey(q) === nameKey(rule.quest!)) : null;
    if (done === null) return { state: 'conditional', requirement: rule.quest, kind: 'quest', note: 'the game has not reported your quests yet' };
    return done ? { state: 'open', requirement: rule.quest, kind: 'quest' } : { state: 'blocked', requirement: rule.quest, kind: 'quest', note: `opens after ${rule.quest}` };
  }
  if (rule.skill) {
    const requirement = `${rule.skill.name} ${rule.skill.level}`;
    const lv = ctx.level(rule.skill.id);
    if (lv === null) return { state: 'conditional', requirement, note: `${rule.where}: your ${rule.skill.name} level is not known yet` };
    return lv >= rule.skill.level ? { state: 'open', requirement } : { state: 'blocked', requirement, note: `${rule.where}: needs ${requirement}, you have ${lv}` };
  }
  if (rule.fare) return { state: 'open', fare: rule.fare.gp * 2, note: rule.fare.how };
  return null;
}

// ---------------------------------------------------------------------------
// Free pickups: an item lying somewhere is free only if the player may stand there. The item data marks members areas; it does not mark guild doors,
// quest-only islands or the edges of the Wilderness that are not named "Wilderness" (OSRS Wiki: each place's entry requirement).

interface SpawnRule { re: RegExp; rule: Rule & { blocked?: string; started?: boolean } }

const SPAWN_RULES: SpawnRule[] = [
  { re: /crafting guild/i, rule: { skill: { id: 'crafting', name: 'Crafting', level: 40 }, where: 'in the Crafting Guild (and a brown apron worn)' } },
  { re: /cooks' guild/i, rule: { skill: { id: 'cooking', name: 'Cooking', level: 32 }, where: "in the Cooks' Guild (and a chef's hat worn)" } },
  { re: /mining guild/i, rule: MINING_GUILD },
  { re: /champions' guild/i, rule: GUILD_QP },
  // Crandor is reached only by the ship of Dragon Slayer I; Corsair Cove by Captain Tock once The Corsair Curse is under way.
  { re: /crandor/i, rule: { quest: 'Dragon Slayer I', started: true } },
  { re: /corsair cove/i, rule: { quest: 'The Corsair Curse', started: true } },
  { re: /camdozaal/i, rule: { quest: 'Below Ice Mountain', started: true } },
  { re: /lesser demon area|frozen waste plateau|ferox enclave/i, rule: { wilderness: true } },
  { re: /bryophyta/i, rule: { blocked: 'behind a door that needs a mossy key' } },
  { re: /tutorial island/i, rule: { blocked: 'Tutorial Island cannot be visited again' } },
  { re: /emir's arena|citharede abbey|castle wars/i, rule: { members: true } },
];

/**
 * Whether the player may pick up an item lying at a named place. open for the free world's towns and dungeons; conditional where a quest under way
 * or an unknown level decides it (the app cannot see "started"); blocked for the Wilderness, a members area on a free account, an unmet level, a locked door.
 */
export function spawnAccess(spawn: string, ctx: AccessContext): ShopAccess {
  if (/inaccessible|telegrab|telekinetic|task-only/i.test(spawn)) return { state: 'blocked', note: 'needs Telekinetic Grab or is out of reach' };
  if (/wilderness/i.test(spawn)) return { state: 'blocked', note: 'in the Wilderness: other players can attack you there and take what you carry' };
  if (ctx.mode === 'f2p' && /members only/i.test(spawn)) return { state: 'blocked', note: 'a members area' };
  const hit = SPAWN_RULES.find((r) => r.re.test(spawn))?.rule;
  if (!hit) return { state: 'open' };
  if (hit.blocked) return { state: 'blocked', note: hit.blocked };
  if (hit.wilderness) return { state: 'blocked', note: 'in the Wilderness: other players can attack you there and take what you carry' };
  if (hit.members && ctx.mode === 'f2p') return { state: 'blocked', note: 'a members area' };
  if (hit.quest && hit.started) {
    // The game reports finished quests only: a finished one opens it, anything else is "if you have started it".
    const done = ctx.quests.known && ctx.quests.value.some((q) => nameKey(q) === nameKey(hit.quest!));
    return done ? { state: 'open', requirement: hit.quest, kind: 'quest' } : { state: 'conditional', requirement: `started ${hit.quest}`, kind: 'level', note: `reached only during ${hit.quest}` };
  }
  return shopAccessByRule(hit, ctx) ?? { state: 'open' };
}

/** The words after a shop's name when it is not plainly open: "(if you have 32 quest points)", "(once Dragon Slayer I is done)", "(entry not checked)". */
export function accessSuffix(a: ShopAccess): string {
  if (a.state === 'conditional') return a.kind === 'quest' ? ` (once ${a.requirement} is done)` : ` (if you have ${a.requirement})`;
  if (a.state === 'unverified') return ' (entry not checked)';
  return '';
}
