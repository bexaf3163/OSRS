// Step tasks: what belongs to a step but is not what the game's completion check measures (wield what was bought, claim a reward, an optional quest
// that feeds a skill goal). Each is checked against the player's state where the game can say, otherwise ticked by the player. A task never
// completes or blocks its step.
//
// The answer has four outcomes, and UNKNOWN is never MISSING (PROJECT_HANDOFF): the worn items that were not read, a bank that was not opened
// and a quest list that is not there say "not checked".

import type { StepTask } from '../types';
import { heldOf, type PlayerState } from './playerState';
import { nameKey } from './checklist';

export type TaskState = 'OK' | 'OPEN' | 'MISSING' | 'UNKNOWN';

export interface TaskStatus {
  task: StepTask;
  state: TaskState;
  /** What the game says, for the row: "Attack 52 of 60". */
  detail: string | null;
  /** The player ticks it: no game check, or the check cannot be read. */
  manual: boolean;
}

const skillName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const taskKey = (stepId: string, taskId: string) => `${stepId}:${taskId}`;

export function taskStatus(task: StepTask, state: Pick<PlayerState, 'owned' | 'equipment' | 'equipmentKnown' | 'manual' | 'bankSeen' | 'levels' | 'quests'>, ticked: boolean): TaskStatus {
  const c = task.check;
  if (ticked) return { task, state: 'OK', detail: null, manual: true };
  if (!c) return { task, state: 'OPEN', detail: null, manual: true };
  switch (c.kind) {
    case 'worn': {
      if (!state.equipmentKnown) return { task, state: 'UNKNOWN', detail: null, manual: true };
      const worn = new Set(Object.values(state.equipment).map(nameKey));
      return { task, state: c.items.some((n) => worn.has(nameKey(n))) ? 'OK' : 'MISSING', detail: null, manual: false };
    }
    case 'owned': {
      const held = c.items.map((n) => heldOf(state, n));
      const need = c.count ?? 1;
      const total = held.reduce((a, h) => a + (h.total ?? 0), 0);
      if (total >= need) return { task, state: 'OK', detail: null, manual: false };
      return { task, state: held.every((h) => h.presence === 'MISSING') ? 'MISSING' : 'UNKNOWN', detail: null, manual: false };
    }
    case 'level': {
      const l = state.levels[c.skill];
      const have = l?.known ? l.value : undefined;
      if (have === undefined) return { task, state: 'UNKNOWN', detail: null, manual: true };
      return { task, state: have >= c.level ? 'OK' : 'MISSING', detail: `${skillName(c.skill)} ${have} of ${c.level}`, manual: false };
    }
    case 'quest': {
      if (!state.quests.known) return { task, state: 'UNKNOWN', detail: null, manual: true };
      const done = state.quests.value.some((q) => nameKey(q) === nameKey(c.name));
      return { task, state: done ? 'OK' : 'MISSING', detail: null, manual: false };
    }
  }
}
