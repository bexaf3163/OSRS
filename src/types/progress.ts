// The player's saved progress.
import type { GameMode } from './route';

export type StepStatus = 'done' | 'skipped';

export interface Progress {
  version: 3;
  steps: Record<string, StepStatus>;
  levels: Record<string, number>;
  notes: Record<string, string>;
  updatedAt: string;
  /** When a step was marked done (ISO), for the time splits; absent for steps marked in bulk from the game or before splits existed. */
  doneAt?: Record<string, string>;
  gameMode?: GameMode;
  /** Steps marked updatedInV2 that the user has already checked. */
  reviewedV2Steps?: string[];
  /** Steps returned to active after V2: their quest points are already earned in the game and are not rolled back. */
  qpKept?: string[];
  /** Historical route marks/notes retained across migrations or content retirement; never current quest facts. */
  legacy?: { steps: Record<string, StepStatus>; notes: Record<string, string>; doneAt?: Record<string, string> };
  /** Steps where the player pressed "✕ Skip" on a gear upgrade hint. */
  upgradeDismissedForSteps?: string[];
  /**
   * "I already have it" in the bulk purchase: how much of an item there is by the player's own words. The key is the list row
   * (`id:1725` by item ID, `name:...` for items without an ID). Data from the game wins if it is complete.
   */
  ownedManual?: Record<string, ManualOwned>;
  /**
   * The player's own word on a new account's Grand Exchange sale restrictions: "lifted" - they can sell the restricted items, "active" - they cannot.
   * Absent means the app decides from the game's quest points and total level (lib/tradeRestriction.ts).
   */
  sellRestrictions?: 'lifted' | 'active';
  /** The player's ticks of tasks that have no game check: "<stepId>:<taskId>" to true (a task with a game check is not stored here). */
  tasksDone?: Record<string, true>;
}

export interface ManualOwned {
  count: number;
  /** When the player gave the quantity (ISO). */
  updatedAt: string;
}
