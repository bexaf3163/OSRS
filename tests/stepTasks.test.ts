import { describe, expect, it } from 'vitest';
import { allSteps, known, stepById } from '../src/data';
import { emptyProgress, normalizeProgress, withStep, withTaskDone } from '../src/lib/progress';
import { buildPlayerState } from '../src/lib/playerState';
import { taskKey, taskStatus } from '../src/lib/stepTasks';
import { routeTrigger } from '../src/lib/carryover';
import type { StepTask } from '../src/types';
import type { GearState } from '../src/services/runeliteBridge';
import type { OwnedState } from '../src/lib/checklist';

const gear = (equipment: string[] | null): GearState => ({
  equipment: equipment === null ? null : equipment.map((name, i) => ({ id: i + 1, name, slot: `slot${i}` })),
  inventory: [], coins: 0, bankCoins: null,
});
const stateOf = (over: { gear?: GearState | null; stats?: Record<string, number> | null; quests?: string[] | null; owned?: OwnedState | null } = {}) =>
  buildPlayerState({
    mode: 'members', stats: over.stats ?? null, progress: { levels: {} }, owned: over.owned ?? null, gear: over.gear ?? null,
    questsDone: over.quests ?? null, connected: true,
  });

const worn: StepTask = { id: 'w', text: 'wield', check: { kind: 'worn', items: ['Mithril scimitar', 'Adamant scimitar'] } };

describe('what a step task is checked against', () => {
  it('worn items: present is done, absent is not yet, never read is unknown (not "not yet")', () => {
    expect(taskStatus(worn, stateOf({ gear: gear(['Mithril scimitar', 'Leather boots']) }), false).state).toBe('OK');
    expect(taskStatus(worn, stateOf({ gear: gear(['Iron scimitar']) }), false).state).toBe('MISSING');
    expect(taskStatus(worn, stateOf({ gear: gear([]) }), false).state).toBe('MISSING');
    const none = taskStatus(worn, stateOf({ gear: null }), false);
    expect(none.state).toBe('UNKNOWN');
    expect(none.manual).toBe(true);
  });

  it('a level is a number against a number, with the detail the row shows; an unread level is unknown', () => {
    const t: StepTask = { id: 'a', text: 'train', check: { kind: 'level', skill: 'attack', level: 60 } };
    expect(taskStatus(t, stateOf({ stats: { attack: 52 } }), false)).toMatchObject({ state: 'MISSING', detail: 'Attack 52 of 60' });
    expect(taskStatus(t, stateOf({ stats: { attack: 60 } }), false).state).toBe('OK');
    expect(taskStatus(t, stateOf({ stats: null }), false).state).toBe('UNKNOWN');
  });

  it('a quest is checked against the game list; no list is unknown', () => {
    const t: StepTask = { id: 'q', text: 'quest', check: { kind: 'quest', name: 'A Porcine of Interest' } };
    expect(taskStatus(t, stateOf({ quests: ['Cook\'s Assistant'] }), false).state).toBe('MISSING');
    expect(taskStatus(t, stateOf({ quests: ['A Porcine of Interest'] }), false).state).toBe('OK');
    expect(taskStatus(t, stateOf({ quests: null }), false).state).toBe('UNKNOWN');
  });

  it('an owned item with an unread bank is unknown, not missing; held is done', () => {
    const t: StepTask = { id: 'o', text: 'take', check: { kind: 'owned', items: ['Cowbell amulet'] } };
    expect(taskStatus(t, stateOf(), false).state).toBe('UNKNOWN');
    const owned: OwnedState = { bankSeen: true, items: new Map([['cowbell amulet', { name: 'Cowbell amulet', carried: 0, noted: 0, bank: 1 }]]) } as unknown as OwnedState;
    expect(taskStatus(t, stateOf({ owned }), false).state).toBe('OK');
    const none: OwnedState = { bankSeen: true, items: new Map([['cowbell amulet', { name: 'Cowbell amulet', carried: 0, noted: 0, bank: 0 }]]) } as unknown as OwnedState;
    expect(taskStatus(t, stateOf({ owned: none }), false).state).toBe('MISSING');
  });

  it("a task without a check is open until the player ticks it, and the player's tick wins over a game answer", () => {
    const manual: StepTask = { id: 'm', text: 'quiz' };
    expect(taskStatus(manual, stateOf(), false).state).toBe('OPEN');
    expect(taskStatus(manual, stateOf(), true).state).toBe('OK');
    expect(taskStatus(worn, stateOf({ gear: null }), true).state).toBe('OK');
  });
});

describe('the tasks of the route', () => {
  const withTasks = allSteps.filter((s) => s.tasks?.length);

  it('are the audit’s follow-ups, each with a stable id and a distinct key', () => {
    expect(withTasks.map((s) => s.id)).toEqual(['S2-08', 'S4-02', 'S8-04', 'S8-05', 'S9-04']);
    const keys = withTasks.flatMap((s) => s.tasks!.map((t) => taskKey(s.id, t.id)));
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of withTasks) for (const t of s.tasks!) expect(t.id, `${s.id}:${t.id}`).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it('do not change what completes a step: the triggers of those steps keep their quest or level condition', () => {
    expect(routeTrigger(stepById.get('S2-08')!)).toEqual({ type: 'QUEST_COMPLETED', questName: 'Vampyre Slayer' });
    expect(routeTrigger(stepById.get('S8-05')!)).toEqual({ type: 'QUEST_COMPLETED', questName: 'Animal Magnetism' });
    expect(routeTrigger(stepById.get('S9-04')!)).toMatchObject({ type: 'QUEST_COMPLETED', questName: 'Monkey Madness I', items: [{ names: ['Dragon scimitar'], count: 1 }] });
  });

  it('the dragon scimitar is bought by the step and wielded at Attack 60: the two are separate tasks', () => {
    const s = stepById.get('S9-04')!;
    expect(s.doneWhen).not.toMatch(/60 Attack|worn/);
    expect(s.tasks!.map((t) => t.id)).toEqual(['attack-60', 'wield-dragon']);
    expect(s.tasks![0].check).toEqual({ kind: 'level', skill: 'attack', level: 60 });
  });

  it('A Porcine of Interest is a checked optional quest worth one quest point, and the goals range carries it', () => {
    const t = stepById.get('S8-04')!.tasks!.find((x) => x.id === 'porcine')!;
    expect(t.check).toEqual({ kind: 'quest', name: 'A Porcine of Interest' });
    expect(t.qp).toBe(1);
  });
});

describe('the tick is saved with the profile', () => {
  it('round-trips, drops keys of unknown steps and garbage, and an older save loads without it', () => {
    const key = taskKey('S8-04', 'museum-quiz');
    const p = withTaskDone(emptyProgress(), key, true);
    expect(p.tasksDone).toEqual({ [key]: true });
    expect(normalizeProgress(JSON.parse(JSON.stringify(p)), known)!.progress.tasksDone).toEqual({ [key]: true });
    const dirty = { ...JSON.parse(JSON.stringify(p)), tasksDone: { [key]: true, 'S9-99:x': true, 'nope': true, [taskKey('S8-04', 'Bad Id')]: true, [taskKey('S8-05', 'wear-ava')]: 1 } };
    expect(normalizeProgress(dirty, known)!.progress.tasksDone).toEqual({ [key]: true });
    expect(normalizeProgress({ version: 3, steps: {}, levels: {}, notes: {}, updatedAt: new Date().toISOString() }, known)!.progress.tasksDone).toBeUndefined();
    expect(withTaskDone(p, key, false).tasksDone).toBeUndefined();
  });

  it('does not touch the steps, levels or notes', () => {
    const base = withStep({ ...emptyProgress(), levels: { mining: 12 }, notes: { 'S1-03': 'x' } }, 'S1-03', 'done');
    const p = withTaskDone(base, taskKey('S8-04', 'museum-quiz'), true);
    expect(p.steps).toEqual(base.steps);
    expect(p.levels).toEqual(base.levels);
    expect(p.notes).toEqual(base.notes);
  });
});
