// Quest stages and stage requirements.

/** An item needed in a quest stage. */
export interface QuestStageItem {
  name: string;
  id?: number;
  count?: number;
  where?: string;
  /** Obtained during the stage: not needed in advance. */
  inStep?: boolean;
  /** Other items that count in its place: every pickaxe tier for "Pickaxe". */
  alt?: string[];
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
  /** Items that must be in the bag (or worn) before this step: the plugin turns the arrow back to where to get a missing one instead of leading on. */
  pre?: StagePre[];
  /** The strongest usual hit of what attacks the player on this line (from the wiki): the health warning uses it only while this line is current. */
  mh?: number;
}

/** One pre-flight item. With an id only that exact item counts (the Draynor Manor cabbage has the name Cabbage too). */
export interface StagePre {
  item: string;
  id?: number;
  /** How many are needed; 1 when absent. */
  n?: number;
  /** Where to get it when it is not in the bank: a tile; absent means the Grand Exchange. */
  at?: [number, number, number];
  /** The instruction shown while going there. */
  t?: string;
  /** Object names to highlight at that place (the cabbage patch). */
  on?: string[];
  /** The NPC to highlight at that place. */
  npc?: string;
  /** Other items that count in its place: every pickaxe tier for "Pickaxe". */
  alt?: string[];
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
  /** Last authored line requiring an encounter. Only a validated later game cursor can retire that fight. */
  encounters?: { foe: string; throughLine: string }[];
  /** Source-backed manual prerequisite already fulfilled, proven by an exact live carried item at these authored lines. */
  manualProofs?: { requirement: string; carriedId: number; atLines: string[]; source: string }[];
  /** The whole quest by sections (like the Quest Helper panel): the step's "Walkthrough" is built from it. */
  route?: { title: string; steps: string[] }[];
}

/** A step requirement. when: 'during' means needed during the quest, you can start without it. */
export type StepRequirement =
  | { type: 'skill'; skill: string; min: number; when?: 'start' | 'during'; boostable?: boolean }
  | { type: 'quest'; quest: string };
