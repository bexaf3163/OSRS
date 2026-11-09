// What the RuneLite plugin shows for a step, and what it reports back.
import type { GamePoint, Target } from './route';

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
  /** ITEM_OWNED: any one of the items completes the step (2,500 coins, or 25 ore, or the scimitar) instead of all of them. */
  anyOf?: boolean;
  chatPattern?: string;
  varbitId?: number;
  /** VARBIT_CHANGED with atLeast: a varp instead of a varbit (Dragon Slayer's quest variable 176). Exactly one of varbitId and varpId. */
  varpId?: number;
  /** VARBIT_CHANGED: only these bits count and must equal targetValue, read as a state (Dragon Slayer clears bits 11-15 of varp 177 as each question is asked). */
  bitMask?: number;
  targetValue?: number;
  /**
   * VARBIT_CHANGED: the milestone is reached at this value or above (and is also checked when the step is shown), instead of exactly at the value.
   * A route milestone earlier than the end of a quest: the fairy rings work from Fairytale II value 40 on.
   */
  atLeast?: boolean;
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
  /** Set at run time from this player's food plan (lib/foodPlan.ts): health a kill costs net of regeneration, for the game's food line. */
  foodHpPerKill?: number;
  targetLevel: number;
  /** The XP at targetLevel by the game's XP table. */
  targetExp: number;
  /** The action in forms for 1 and for more: "shrimp|shrimps". A single form works too. */
  actionName: string;
  /** XP per action (a catch, a log, an ore, a cooked fish; in combat 4 x the opponent's health). */
  expPerAction: number;
  /** Seconds per action: the first estimate before your own measurements. */
  secondsPerAction?: number;
  /**
   * Combat skills with a goal of their own (Strength 20 first, then Attack 30); a skill not named here has targetLevel. The plugin
   * before 2.55.1 ignores it and counts every skill to targetLevel.
   */
  goals?: Partial<Record<PacingSkill, { level: number; exp: number }>>;
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