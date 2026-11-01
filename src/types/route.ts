// The route: a step, its blocks, items, tasks, places and quick options.
import type { InGameTarget, StepNpcInfo, StepPacing } from './inGame';
import type { QuestStages, StepRequirement } from './stages';

export type StepType = 'quest' | 'skill' | 'gear' | 'prep';

/** A piece of guide markup. The text is a string with simple inline markup (**bold**, `code`, [link](url)). */
export type Block =
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: ListItem[]; start?: number }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'code'; lang: string; text: string };

export interface ListItem {
  text: string;
  checked?: boolean;
  children?: Block[];
}

export type FieldKey = 'where' | 'bring' | 'how' | 'reward' | 'doneWhen';

/** A labelled line of a step: "Why: ...", "Danger: ...", "Combat: ...". */
export interface Field {
  label: string;
  text: string;
  key?: FieldKey;
}

/** A skill goal from a step title: "Fishing to 20" becomes { skill: 'fishing', level: 20 }. */
export interface Target {
  skill: string;
  level: number;
}

export type GameMode = 'f2p' | 'members';

/** An item to take, or worth taking, for a step. */
export interface StepItemRequirement {
  /** Preparation requires this item to be worn, not merely owned or carried. */
  equip?: boolean;
  nameEn: string;
  /** 1 or "23 (20 to hand in, 3 for the bank)". */
  amount: string | number;
  /** Exactly where to get the item; empty if the route does not say. */
  howToGet: string;
  /**
   * Where the item comes from: an NPC from npcLocations.json ("Betty") or a place from majorLocations.json ("Lumbridge General Store").
   * The place becomes a point on the step's map and a button next to the item in the in-game "What you need" list.
   */
  from?: string;
  iconUrl?: string;
  /** The item's ID on the OSRS Wiki and in the price API. */
  wikiItemId?: number;
  /** How many health points it restores (for food). */
  heals?: number;
  /**
   * Food on a combat training step, set at run time by this player's estimate (lib/foodPlan.ts): what the whole remaining goal needs. `amount` is then
   * one trip (what readiness asks for), and the shopping list buys this.
   */
  totalAmount?: number;
  /** Obtained during the step itself (an NPC hands it out, you pick it up, buy it on the spot): not checked at the bank. */
  inStep?: boolean;
  /**
   * The loadout (Step.loadouts id) this item belongs to. Without it the item is part of the first loadout, the one to take before the step starts;
   * an item of a later loadout is taken on the next visit to the bank, not now (Glarial's Tomb takes no runes, the dungeon after it needs them).
   */
  phase?: string;
  /** Other items that do the same job: any of them counts (every pickaxe tier for "Pickaxe"). */
  anyOf?: string[];
  /** The route's planning price of one, in coins; only items that take part in a funding plan have it (lib/fundingPlan.ts). */
  gp?: number;
  /** Funding priority: 1 materials of the quests ahead, 2 what the next steps are built on, 3 comfort that can wait. */
  tier?: 1 | 2 | 3;
}

/** One bank-to-bank stretch of a quest with its own inventory: what to take, what the game refuses at the door. */
export interface Loadout {
  id: string;
  /** "Glarial's Tomb", "Waterfall dungeon". */
  title: string;
  /** The quest variable value from which this loadout is the one to prepare; absent means before the step starts. */
  from?: number;
  /** Canonical questStages line key where this bank-to-bank phase starts, including within a single coarse var stage. */
  fromLine?: string;
  /** What to take: names as in the game, with an optional note. */
  take: { nameEn: string; amount: string | number; note?: string }[];
  /** What must stay in the bank: the game refuses entry or it is simply in the way. */
  leave?: string[];
  /** Empty slots needed to receive what the phase gives. */
  freeSlots?: number;
  note?: string;
}

/**
 * Something the step's player keeps for a LATER step. The game says the step is done (the quest is green) but the route is not ready to move on
 * until the item is held: finishing without it silently costs the player a trip later.
 */
export interface CarryItem {
  /** The item as in the game. */
  item: string;
  count: number;
  /** The route step that needs it: later in the route, and it lists the item in its own itemsRequired. */
  forStep: string;
  /** Where to keep it. */
  where: 'bank' | 'bag';
  /** One sentence for the player: why. */
  why: string;
}

/** How the app checks a step's task against the player's state. A task without a check is ticked by the player. */
export type TaskCheck =
  | { kind: 'worn'; items: string[] }
  | { kind: 'owned'; items: string[]; count?: number }
  | { kind: 'level'; skill: string; level: number }
  | { kind: 'quest'; name: string };

/**
 * Something that belongs to a step but is not what the game's completion check measures: wielding the weapon the step bought, claiming a reward,
 * an optional quest that feeds the step's skill goal. It is tracked beside the step and never blocks it (the step's own trigger, and Carryover for
 * what must be kept, stay as they are).
 */
export interface StepTask {
  /** Stable within the step: the saved tick is keyed by "<stepId>:<id>". */
  id: string;
  text: string;
  /** One sentence for the player: why it matters. */
  why?: string;
  check?: TaskCheck;
  /** Quest points the task gives when done (an optional quest). Only the forecast uses it: the route's points count steps. */
  qp?: number;
}

/** A point on the world map in game coordinates (as in RuneLite and on the OSRS Wiki map). */
export interface MapLocation {
  x: number;
  y: number;
  /** 0 is the ground floor, 1 is the 1st floor, 2 the 2nd floor, 3 the 3rd floor. */
  plane: number;
  label: string;
  /** The wiki map scale: from -3 (the whole world) to 3 (tiles up close). 2 by default. */
  zoom?: number;
  /** How to find the place on the spot: landmarks and what to avoid. Shown under the point switcher. */
  note?: string;
  /** The step's items (nameEn) taken here: in the RuneLite panel the item gets "Way here". */
  items?: string[];
  /** An NPC at this point: the arrow highlights it when the player arrives. */
  npc?: string;
}

/** A point in the game without a map label: a target or a waypoint. */
export interface GamePoint {
  x: number;
  y: number;
  plane: number;
  label?: string;
}

export type PlayerStats = Record<string, number>;

export type BranchConditionType = 'SKILL_LEVEL' | 'QUEST_COMPLETED' | 'ITEM_OWNED';

/** A condition of a quick option. Checked against levels from RuneLite (or entered manually), progress and items. */
export interface BranchCondition {
  type: BranchConditionType;
  /** The RuneLite skill key: magic, woodcutting, agility... */
  skill?: string;
  minLevel?: number;
  /** The quest name as in the game: counted if its step is marked done. */
  questName?: string;
  /** An item (as in the game, in English): in the bag, worn or in the bank. */
  itemName?: string;
}

/**
 * What you must have for the quick option to work besides the level: runes for a teleport, an axe for a canoe.
 * It is enough when the total of the items in items is at least count or you have something from unless (a Staff of air instead of air runes).
 */
export interface BranchNeed {
  /** How to name it in a hint: "Air rune x3". */
  label: string;
  count: number;
  /** Item names as in the game: counted together (any axe). */
  items: string[];
  /** What replaces the item entirely: an elemental staff instead of runes. */
  unless?: string[];
}

/** A step's quick option for the player's current stats: it does not replace the main route but adds to it. */
export interface StepBranch {
  id: string;
  /** A short heading: "Varrock Teleport". */
  label: string;
  condition: BranchCondition;
  /** What you must carry besides the level. Without it the option is not silently called available: the runes are checked. */
  needs?: BranchNeed[];
  /** How to do it fast. */
  replacementText?: string;
  /** Where the quick option leads: this point goes into the game if you choose it. */
  replacementTarget?: MapLocation;
  /** The time saved, only if it is verified. */
  timeSavingSeconds?: number;
}

export interface Step {
  id: string;
  stage: number;
  type: StepType;
  title: string;
  qp?: number;
  minQp?: number;
  requires: string[];
  /**
   * Steps that are better done first but never hold this one back: optional quests the route only suggests. A step that is optional
   * is never listed in `requires` (the validator says so): a "requires" that the player may knowingly skip would block the route.
   */
  softRequires?: string[];
  /**
   * Requirements checked against the player's state (levels, quests), from the quest article on the OSRS Wiki.
   * A step's readiness (lib/readiness.ts) checks them against the levels from the game or the profile and the quest marks.
   */
  requirements?: StepRequirement[];
  optional?: boolean;

  wikiUrl?: string;
  quickGuideUrl?: string;
  mapUrl?: string;

  npc?: StepNpcInfo;
  /** The floor of the place if the step has no NPC (for example a bank at the top of a castle). */
  floor?: string;
  itemsRequired?: StepItemRequirement[];
  /** Runtime projection of all remaining combat phases, for purchases/protection only; carrying readiness uses itemsRequired. */
  goalItemsRequired?: StepItemRequirement[];
  /** Optional future bank stock; excluded from readiness and completion. */
  stockItems?: StepItemRequirement[];
  itemsRecommended?: StepItemRequirement[];
  /** Canonical baseline armour IDs for the route's combat preparation; usable owned equivalents are accepted. */
  combatArmour?: number[];
  /** Inventories of the quest's phases, in order; the first is the one before the step starts. */
  loadouts?: Loadout[];
  /** What this step keeps for a later one (see CarryItem). */
  carryover?: CarryItem[];
  /** Follow-ups and optional tasks tracked beside the step: they do not complete or block it (see StepTask). */
  tasks?: StepTask[];
  /** A reward the player chooses at the end: the step shows which choice fits the player's current levels. */
  rewardChoice?: 'daero';
  /**
   * The way to a Bond for an account that is not a member yet. In Members mode (membership is active) these steps are not part of the route:
   * nothing before the Members content is made to wait for them.
   */
  bondBranch?: boolean;
  quickSteps?: string[];
  safespot?: string;
  imageUrl?: string;
  imageCaption?: string;
  proTip?: string;

  /** Where the step starts: the map preview in the card and the world map. */
  mapLocation?: MapLocation;
  /** Several equal places (fishing, ore): switched on the map. */
  resourceSpots?: MapLocation[];
  /** A ready picture instead of the preview made of map tiles. */
  mapPreviewImage?: string;
  /** The step's main warning: a yellow plate above the walkthrough. */
  warning?: string;
  /** Highlighting in the game and auto-tick through RuneLite. */
  inGame?: InGameTarget;
  /** Quick options for the player's stats: a teleport, a canoe, a shortcut. */
  branches?: StepBranch[];
  /** The step's skill training pace (fishing, woodcutting, cooking, mining). */
  pacing?: StepPacing;
  /**
   * A skill id (levels.json) whose training method this step follows: the tools it asks for, the place of the arrow and the in-game list are the
   * recommended method's for the player's real level ("What to train with"), so a tool of another method (a harpoon at Fishing 1) never makes the
   * step ready. The static itemsRequired / mapLocation are the fallback while the level is unknown. See lib/methodStep.ts.
   */
  followsMethod?: string;
  /** Runtime identity of the current training requirements; a later stage must not inherit an earlier preparation refusal/completion. */
  trainingPhase?: string;
  /** Set at run time while a combat plan other than the route's own leads the step (lib/combatRoute/pick.ts): the plan's key, the phase in hand and who chose it. Never in the data. */
  combatPlan?: {
    key: string; phase: number; source: 'auto' | 'player';
    /** The phase in hand in a few words for the in-game guide ("Collect 50 Big bones from Hill Giants"); absent for a phase the training pace says by itself. */
    now?: string;
    /** The instruction of the phase after it (without "Then: "); absent for the last. */
    next?: string;
    /** Internal food/time projection for an item-only combat phase; never a new skill completion goal. */
    trainingSkill?: 'attack' | 'strength' | 'defence';
  };
  /** Set at run time with combatPlan: the route's own instructions the plan replaced, shown folded as "the route as written". Never in the data. */
  routeAsWritten?: { where?: string; how?: string; quickSteps?: string[]; fields?: Field[] };
  /**
   * Who the step fights in melee: wiki article names (monsters.json). The gear advisor uses them to
   * compare weapons and show a hint on the step. Absent from steps where you fight with a special weapon or magic.
   */
  foes?: string[];

  where?: string;
  bring?: string;
  how?: string;
  tips?: string[];
  reward?: string;
  doneWhen: string;
  /** An earning step: how many coins you should have by the end of the step (in the bag and bank). Progress is in lib/wealth.ts. */
  moneyGoal?: number;
  /** The goal for an account that cannot sell restricted items on the Grand Exchange yet (lib/tradeRestriction.ts): coins that need no sale. */
  moneyGoalNoSale?: number;
  /** The items this step sells on the Grand Exchange: the step shows the new-account restrictions when one of them is restricted. */
  sells?: string[];
  /** Opponents without a combat card in foes (a boss, a quest monster): threats.json keys, for the food advice. */
  threats?: string[];
  /** Show what to wear for magic or ranged (wiki recommendations) for the player's levels and coins. */
  styleGear?: 'magic' | 'ranged';
  /** "Use X on Y": in the game the HUD reminds you of the action and the item and the target are highlighted. kind is object (the default), npc or item. */
  useOn?: { item: string; target: string; kind?: 'object' | 'npc' | 'item' }[];
  /** Show the calculation "what it costs to reach a Magic goal with combat spells" (S2-04). */
  magicPlan?: { target: number; /** The level you start from on the route, if the game and the skill page say nothing. */ from: number };
  /** Quest stages by a game variable: what to do and where to go right now (src/data/authored/questStages.json). */
  questStages?: QuestStages;
  /** Other labelled lines: "Why", "Important", "Danger", "Combat", "Requirements". */
  fields?: Field[];
  targets?: Target[];

  updatedInV2?: boolean;
  v2ChangesSummary?: string;
  membersOnly?: boolean;
  membersAlternative?: string;
}
