// The app's data types. The V2 route is src/data/steps.json and stages.json;
// the skills, goals and reference live in the other JSON files of src/data.

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
  /** Obtained during the step itself (an NPC hands it out, you pick it up, buy it on the spot): not checked at the bank. */
  inStep?: boolean;
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

/** What to show in the game through the "OSRS Path Bridge" RuneLite plugin. */
export interface InGameTarget {
  worldPoint?: GamePoint;
  groundTiles?: { x: number; y: number; plane: number; label: string; color?: string }[];
  npcNames?: string[];
  npcIds?: number[];
  objectNames?: string[];
  objectIds?: number[];
  /** The exact text of the dialogue options to choose. */
  dialogChoices?: string[];
  /** Item names (as in the game, in English): highlighting in the inventory and bank. */
  highlightItems?: string[];
  /** The current target in one line for the micro HUD; without it the step point's label is used. */
  goal?: string;
  /**
   * Stops in order: gate, bridge, ladder, NPC. In the game the arrow and the HUD ("Point 2/5") lead to the current
   * stop, and if Shortest Path is installed it leads there by a real path.
   */
  pathWaypoints?: GamePoint[];
  /**
   * Only verified conditions: a quest from the game, real skill levels, items the player has, an exact message
   * text or a varbit with a value.
   */
  completionTrigger?: CompletionTrigger;
}

export interface CompletionTrigger {
  type: 'QUEST_COMPLETED' | 'SKILL_LEVEL' | 'ITEM_OWNED' | 'CHAT_MESSAGE' | 'VARBIT_CHANGED';
  /** QUEST_COMPLETED: the quest name as RuneLite knows it (net.runelite.api.Quest). */
  questName?: string;
  /** SKILL_LEVEL: real levels (without potions), all at once. They match the goals from the step title. */
  levels?: Target[];
  /** ITEM_OWNED: the items themselves; QUEST_COMPLETED and SKILL_LEVEL have one more condition on top. */
  items?: OwnedItem[];
  chatPattern?: string;
  varbitId?: number;
  targetValue?: number;
}

/**
 * An item for auto-tick: how many of it the player must have, in the bag, worn, as banknotes and in the bank together
 * (the bank if it was opened in this game session).
 */
export interface OwnedItem {
  /** Names as in the game. Several are counted together: "Shrimps" and "Anchovies", any Graceful pieces. */
  names: string[];
  /** This ID only: when different items share a name (the Dragon Slayer I map pieces). */
  id?: number;
  count: number;
}

/** The skills for which a step counts a pace: this many actions to the goal and this many minutes. */
export type PacingSkill = 'fishing' | 'woodcutting' | 'cooking' | 'mining' | 'attack' | 'strength' | 'defence';

/**
 * A step's training pace. The RuneLite plugin counts from the game's XP how many actions are left
 * to targetExp and how long it will take; without measurements the time is not invented.
 */
export interface StepPacing {
  skill: PacingSkill;
  /**
   * More skills with the same goal: combat only, Strength and Defence after Attack. They are trained in turn by changing the attack
   * style; the pace shows the one that is growing now.
   */
  also?: PacingSkill[];
  targetLevel: number;
  /** The XP at targetLevel by the game's XP table. */
  targetExp: number;
  /** The action in forms for 1 and for more: "shrimp|shrimps". A single form works too. */
  actionName: string;
  /** XP per action (a catch, a log, an ore, a cooked fish; in combat 4 x the opponent's health). */
  expPerAction: number;
  /** Seconds per action: the first estimate before your own measurements. */
  secondsPerAction?: number;
}

/** The NPC or the start point of the step. */
export interface StepNpcInfo {
  nameEn: string;
  location: string;
  /** The floor in the British numbering: "1st floor". */
  floor: string;
  dialogue?: string;
  wikiUrl?: string;
}

/** Skill levels by RuneLite keys: { magic: 25, woodcutting: 12 }. */
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
  itemsRecommended?: StepItemRequirement[];
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
  /** Opponents without a combat card in foes (a boss, a quest monster): threats.json keys, for the food advice. */
  threats?: string[];
  /** Show what to wear for magic or ranged (wiki recommendations) for the player's levels and coins. */
  styleGear?: 'magic' | 'ranged';
  /** "Use X on Y": in the game the HUD reminds you of the action and the item and the target are highlighted. kind is object (the default), npc or item. */
  useOn?: { item: string; target: string; kind?: 'object' | 'npc' | 'item' }[];
  /** Show the calculation "what it costs to reach a Magic goal with combat spells" (S2-04). */
  magicPlan?: { target: number; /** The level you start from on the route, if the game and the skill page say nothing. */ from: number };
  /** Quest stages by a game variable: what to do and where to go right now (src/data/questStages.json). */
  questStages?: QuestStages;
  /** Other labelled lines: "Why", "Important", "Danger", "Combat", "Requirements". */
  fields?: Field[];
  targets?: Target[];

  updatedInV2?: boolean;
  v2ChangesSummary?: string;
  membersOnly?: boolean;
  membersAlternative?: string;
}

/** An item needed in a quest stage. */
export interface QuestStageItem {
  name: string;
  id?: number;
  count?: number;
  where?: string;
  /** Obtained during the stage: not needed in advance. */
  inStep?: boolean;
}

/** A stage point: an NPC from the place dictionary or explicit tiles. */
export type QuestStageGo = string | { x: number; y: number; plane: number; label: string; npc?: string };

/** A stage step: what to do and (if known) where: the player goes through the steps by place, and the plugin ticks off the passed ones itself. */
export interface QuestStageLine {
  t: string;
  /** Short text for a line of the in-game list (up to ~70 characters, without the dialogue); the full t is in the hint and the panel. */
  s?: string;
  /** x, y, plane: the step's tile (Quest Helper). */
  at?: [number, number, number];
  /** An item: if it is already in the bag the step is done (the plugin moves on to the next step itself). */
  has?: string;
  /** An item without which the step is not counted by position ("return the ore to Thurgo" is not done just by standing next to him). */
  need?: string;
  /** What to highlight in the game on this step, as Quest Helper does: NPCs and objects by ID, objects by name, items in the bag. */
  hl?: StageHighlight;
  /** The step's name in Quest Helper: the plugin matches the state machine's choice to a line by it. */
  k?: string;
}

/** A stage step's highlight: from the Quest Helper sources (scripts outside the repository, data in questStages.json). */
export interface StageHighlight {
  npc?: number[];
  obj?: number[];
  /** Object names: when Quest Helper has no ID or the object changes its look ("Banana tree"). */
  on?: string[];
  item?: string[];
}

/** One quest stage: in effect while the quest variable is at least at and has not reached the next stage. */
export interface QuestStage {
  at: number;
  /** What to do in this stage: steps in order, as in Quest Helper (go, climb, talk, dialogue). */
  do: QuestStageLine[];
  go?: QuestStageGo;
  /** What is needed in this very stage. No field means the step's item list; [] means nothing. */
  items?: QuestStageItem[];
}

/**
 * A quest variable in the game (a varp or varbit, numbers from Quest Helper) and stages by its values. The plugin reads the value
 * and shows only the current stage in the "What you need" list. A quest is complete by Quest.getState, not by the value.
 */
export interface QuestStages {
  var: ['varp' | 'varbit', number];
  stages: QuestStage[];
  /** The whole quest by sections (like the Quest Helper panel): the step's "Walkthrough" is built from it. */
  route?: { title: string; steps: string[] }[];
}

/** A step requirement. when: 'during' means needed during the quest, you can start without it. */
export type StepRequirement =
  | { type: 'skill'; skill: string; min: number; when?: 'start' | 'during'; boostable?: boolean }
  | { type: 'quest'; quest: string };

export interface Stage {
  id: number;
  title: string;
  membersOnly?: boolean;
}

/** An item dossier for the built-in wiki inspector. */
export interface WikiItemDetail {
  id: number;
  nameEn: string;
  examine: string;
  members: boolean;
  iconUrl: string;
  value: number;
  highAlch?: number;
  lowAlch?: number;
  gePrice?: { buyPrice: number; sellPrice: number; updatedAt: string };
  /** The price could not be found (no connection, timeout). Only at run time, never in the data. */
  priceUnavailable?: boolean;
  buyLocations?: { shopName: string; location: string; owner?: string; price: number; stock: number | string; members?: boolean }[];
  freeSpawns?: string[];
  dropSources?: { monster: string; combatLevel: number | null; rate: string }[];
  wikiUrl: string;
}

/** The equipment slots the advisor handles: weapon, helm, body, legs, shield, amulet. */
export type GearSlot = 'weapon' | 'head' | 'body' | 'legs' | 'shield' | 'neck';

export interface GearStats { stab: number; slash: number; crush: number; magic: number; ranged: number }

/** An equipment item from the OSRS Wiki (gear.json): bonuses, requirement, shops. */
/** Requirements to wear it. Level 1 is not written: that is not a requirement. */
export interface GearRequirements {
  attack?: number;
  strength?: number;
  defence?: number;
  ranged?: number;
  magic?: number;
  prayer?: number;
  /** Quests without which the item cannot be worn: the Rune platebody needs Dragon Slayer I. */
  quests?: string[];
}

export interface GearPiece {
  id: number;
  name: string;
  slot: GearSlot;
  /** Kind: scimitar, sword, platebody, amulet... */
  kind: string;
  metal?: 'bronze' | 'iron' | 'steel' | 'black' | 'mithril' | 'adamant' | 'rune';
  twoHanded?: boolean;
  /** What you need to wear it: { attack: 5 }, for hammers { strength: 5 }, for the Coif { ranged: 20 }, quests. Absent means no requirements (if reqFrom is set). */
  req?: GearRequirements;
  /** The wiki article that states the requirements (or their absence). */
  reqFrom?: string;
  /** The wiki says nothing about requirements: we do not recommend such an item, we only learn about it from the character. */
  reqUnverified?: boolean;
  members: boolean;
  tradeable: boolean;
  attack: GearStats;
  defence: GearStats;
  strength: number;
  prayer?: number;
  /** Ticks between hits (for a weapon; a tick is 0.6 s). */
  speed?: number;
  /** Free-version shops: the price at full stock. */
  shops?: { shop: string; location: string; price: number; owner?: string }[];
  iconUrl: string;
}

export interface GearData {
  source: string;
  updated: string;
  items: GearPiece[];
}

/** An opponent from the wiki monster card: weapons are compared against it. The version is the lowest-level one in the article. */
export interface Foe {
  name: string;
  version?: string;
  combat: number;
  hitpoints: number;
  defenceLevel: number;
  defence: { stab: number; slash: number; crush: number };
  members: boolean;
}

export interface FoeData {
  source: string;
  updated: string;
  foes: Foe[];
}

export interface SkillRange {
  code: string;
  from: number;
  to: number | null;
  /** The "Levels" column as in the guide: "15–30", "60+". */
  levels: string;
  what: string;
  where?: string;
  amount?: string;
  notes?: string;
  /** The whole table row as in the guide. */
  cells: string[];
}

export interface SkillSection {
  title: string;
  blocks: Block[];
}

export interface Skill {
  id: string;
  /** The whole section heading. */
  title: string;
  name: string;
  nameEn?: string;
  subtitle?: string;
  /** The game skills with levels that the section describes (melee has three). */
  levelSkills: string[];
  intro: Block[];
  sections: SkillSection[];
  plan: { head: string[]; ranges: SkillRange[]; sectionIndex: number };
  wiki?: string;
  /** A members skill (the "Members skills" section of the guide). */
  membersOnly?: true;
}

/** The "Members skills" section of the guide: src/data/members-skills.json. */
export interface MembersSkillsData {
  title: string;
  intro: Block[];
  skills: Skill[];
}

/** A skill with its own level: a row of the "Goals by stage" table. */
export interface LevelSkill {
  id: string;
  name: string;
  skill: string;
}

export interface GoalValue {
  raw: string;
  min: number;
  max?: number;
}

export interface GoalRow {
  /** The skill's level id, or 'qp' for the "Quest points" row. */
  id: string;
  label: string;
  values: GoalValue[];
}

export interface GoalsData {
  intro: string;
  note?: string;
  stages: string[];
  rows: GoalRow[];
}

export interface XpData {
  title: string;
  points: { level: number; xp: number }[];
  note: Block[];
}

export interface Plugin {
  name: string;
  source: 'builtin' | 'hub';
  sourceLabel: string;
  why: string;
}

export interface PluginGroup {
  title: string;
  plugins: Plugin[];
  notes: Block[];
}

export interface PluginsData {
  title: string;
  intro: Block[];
  groups: PluginGroup[];
}

export interface RefSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface ReferenceData {
  title: string;
  description: string;
  sections: RefSection[];
  training: RefSection;
  graph: { edges: { from: string; to: string }[] };
}

export interface Quest {
  /** The code of the step that closes the quest. */
  stepId: string;
  title: string;
  stage: number;
  qp: number;
  /** The quest's part steps (for Dragon Slayer I, the whole of stage 5). */
  parts: string[];
  membersOnly?: boolean;
}

export type StepStatus = 'done' | 'skipped';

export interface Progress {
  version: 3;
  steps: Record<string, StepStatus>;
  levels: Record<string, number>;
  notes: Record<string, string>;
  updatedAt: string;
  gameMode?: GameMode;
  /** Steps marked updatedInV2 that the user has already checked. */
  reviewedV2Steps?: string[];
  /** Steps returned to active after V2: their quest points are already earned in the game and are not rolled back. */
  qpKept?: string[];
  /** A full copy of the old route's (V1) progress before the move to V2, so that nothing is lost. */
  legacy?: { steps: Record<string, StepStatus>; notes: Record<string, string> };
  /** Steps where the player pressed "✕ Skip" on a gear upgrade hint. */
  upgradeDismissedForSteps?: string[];
  /**
   * "I already have it" in the bulk purchase: how much of an item there is by the player's own words. The key is the list row
   * (`id:1725` by item ID, `name:...` for items without an ID). Data from the game wins if it is complete.
   */
  ownedManual?: Record<string, ManualOwned>;
}

export interface ManualOwned {
  count: number;
  /** When the player gave the quantity (ISO). */
  updatedAt: string;
}

/** The level needed (required) or advised for an earning method; combat is the combat level, plus means "and above". */
export interface MoneyReq {
  skill: string;
  level: number;
  required: boolean;
  plus?: boolean;
}

/** An earning method from the wiki's "Money making guide/Free-to-play" (scripts/build-money.ts). */
export interface MoneyMethod {
  id: string;
  title: string;
  url: string;
  /** Income per hour at the Grand Exchange prices on the snapshot date. */
  profit: number;
  intensity: string;
  category: string;
  skills: MoneyReq[];
  quests?: string;
  items?: string;
  other?: string;
  /** The wiki's words about combat preparation ("Decent and recommended..."), which numbers cannot express. */
  skillsNote?: string;
  /** The starting capital the wiki names explicitly (gp). */
  capital?: number;
  /** What you buy or carry besides coins. */
  inputs?: string[];
}

export interface MoneyData {
  generatedAt: string;
  source: string;
  methods: MoneyMethod[];
}
