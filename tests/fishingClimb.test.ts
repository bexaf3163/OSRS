import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import locationsJson from '../src/data/majorLocations.json';
import { stepPoints, initialPoint } from '../src/lib/map';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem } from '../src/lib/checklist';
import { stepReadiness } from '../src/lib/readiness';
import { GOAL_REACHED, followedGoal, methodPoint, methodToolNames, withTrainingMethod } from '../src/lib/methodStep';
import { toInGameTarget } from '../src/services/runeliteBridge';
import { pickMethods, samePicks } from '../src/lib/methodPick';
import { trainingMethods } from '../src/lib/trainingRouter';
import type { PlayStyle } from '../src/lib/playStyle';

// Fishing 1-50 (S6-02). The first version put the climb on the map in level order and, in 2.54.2, let any later tool stand in for the net. A live
// check showed the arrow still sending a level-1 account to buy a harpoon; the owner's rule: a harpoon or a lobster pot must not make net fishing
// ready. The step now follows the training method the app recommends for the real level (Step.followsMethod), with the tools of that method only.

const LOCATIONS = (locationsJson as { locations: Record<string, { x: number; y: number; plane: number }> }).locations;
const step = stepById.get('S6-02')!;

// The plugin reports the items the app watches: a watched item that is not there is 0 (missing), not unknown.
const WATCHED = ['Small fishing net', 'Fishing rod', 'Fishing bait', 'Fly fishing rod', 'Feather', 'Lobster pot', 'Harpoon'];
const bagOf = (rows: Record<string, number>): { bankSeen: boolean; items: Map<string, OwnedItem> } => ({
  bankSeen: true,
  items: new Map(Object.entries({ ...Object.fromEntries(WATCHED.map((n) => [n, 0])), ...rows }).map(([name, carried]) => [nameKey(name), { name, carried, noted: 0, bank: 0 } as OwnedItem])),
});

function stateAt(fishing: number | null, bag: Record<string, number> = {}) {
  return buildPlayerState({
    mode: 'f2p', stats: fishing === null ? null : { fishing, cooking: 30 }, progress: emptyProgress(), gear: null, questsDone: null,
    owned: fishing === null ? null : bagOf(bag), connected: fishing !== null,
  });
}

/** The step as the store would give it for this level, bag and style. */
function resolved(fishing: number | null, bag: Record<string, number> = {}, style: PlayStyle = 'chill') {
  const state = stateAt(fishing, bag);
  const picks = pickMethods([step], state, 'f2p', style);
  return { state, pick: picks[step.id] as string | undefined, step: withTrainingMethod(step, picks[step.id]) };
}

const needs = (s: typeof step) => (s.itemsRequired ?? []).map((i) => `${i.nameEn}${typeof i.amount === 'number' && i.amount > 1 ? ` x${i.amount}` : ''}`);

function readyOf(fishing: number, bag: Record<string, number>, style: PlayStyle = 'chill') {
  const r = resolved(fishing, bag, style);
  const rd = stepReadiness({ step: r.step, steps: [r.step], progress: emptyProgress(), qp: 100, mode: 'f2p', stats: { fishing, cooking: 30 }, owned: bagOf(bag), gear: null });
  return { ...r, status: rd.status, reqs: rd.requirements.map((x) => `${x.label}:${x.state}`) };
}

describe('S6-02 Fishing: the places of the climb are on the map in level order', () => {
  it('the static arrow starts at the net spots; fly fishing and the lobsters follow', () => {
    const points = stepPoints(step);
    expect(points.map((p) => p.label)).toEqual([
      expect.stringContaining('Draynor Village (Fishing 1-20)'),
      expect.stringContaining('Barbarian Village (Fishing 20-40)'),
      expect.stringContaining('Musa Point'),
    ]);
    expect(initialPoint(step)).toBe(0);
    expect(step.mapLocation).toMatchObject({ x: points[0].x, y: points[0].y });
  });

  it('the places are the ones in the location dictionary, not invented tiles', () => {
    const want = ['Draynor Village fishing spots', 'Barbarian Village fishing spots', 'Musa Point fishing spots'].map((n) => LOCATIONS[n]);
    expect(want.every(Boolean)).toBe(true);
    stepPoints(step).forEach((p, i) => expect(p).toMatchObject({ x: want[i].x, y: want[i].y, plane: want[i].plane }));
  });
});

describe('S6-02 follows the training method of the real level', () => {
  it('knows its goal: the fishing level its own completion check asks for', () => {
    expect(step.followsMethod).toBe('fishing');
    expect(followedGoal(step)).toEqual({ skill: 'fishing', target: 50 });
  });

  it('the static list is the first tool only, with no stand-ins', () => {
    expect(step.itemsRequired?.map((i) => i.nameEn)).toEqual(['Small fishing net']);
    expect(step.itemsRequired![0].anyOf).toBeUndefined();
  });

  it('a harpoon, a lobster pot or a fly fishing rod does not make net fishing ready at Fishing 1', () => {
    const r = readyOf(1, { Harpoon: 1, 'Lobster pot': 1, 'Fly fishing rod': 1, Feather: 500, Coins: 5000 });
    expect(r.pick).toBe('fi-shrimp');
    expect(needs(r.step)).toEqual(['Small fishing net']);
    expect(r.status).not.toBe('READY');
    expect(r.reqs.join(' ')).toContain('Small fishing net:MISSING');
    // With the net, it is ready.
    expect(readyOf(1, { 'Small fishing net': 1 }).status).toBe('READY');
  });

  it('the requirement follows the selected unlocked method, retaining useful fly fishing beyond 40', () => {
    expect(needs(resolved(4).step)).toEqual(['Small fishing net']);
    // From 5 the router's own pick with nothing carried is the bait method; with a net in the bag the net method is ready and wins.
    expect(resolved(10).pick).toBe('fi-bait');
    expect(needs(resolved(10).step)).toEqual(['Fishing rod', 'Fishing bait x100']);
    expect(resolved(10, { 'Small fishing net': 1 }).pick).toBe('fi-shrimp');
    expect(needs(resolved(25).step)).toEqual(['Fly fishing rod', 'Feather x100']);
    expect(needs(resolved(40).step)).toEqual(['Fly fishing rod', 'Feather x100']);
    expect(needs(resolved(49).step)).toEqual(['Fly fishing rod', 'Feather x100']);
  });

  it('quantities count: a few feathers are not enough for the fly fishing level', () => {
    const few = readyOf(25, { 'Fly fishing rod': 1, Feather: 12 });
    expect(few.status).not.toBe('READY');
    expect(few.reqs.join(' ')).toMatch(/Feather[^:]*:(PARTIAL|MISSING)/);
    expect(readyOf(25, { 'Fly fishing rod': 1, Feather: 250 }).status).toBe('READY');
    // At the lobster level a harpoon (the next method) is not the pot.
    expect(readyOf(42, { Harpoon: 1 }).status).not.toBe('READY');
    expect(readyOf(42, { 'Lobster pot': 1 }).status).toBe('READY');
  });

  it('the arrow advances through the training places as the level rises, never backwards', () => {
    const order = ['Draynor Village fishing spots', 'Barbarian Village fishing spots', 'Musa Point fishing spots'];
    for (const style of ['chill', 'efficient'] as const) {
      let at = -1;
      for (let level = 1; level < 50; level++) {
        const r = resolved(level, {}, style);
        const m = trainingMethods.find((x) => x.id === r.pick)!;
        expect(m, `level ${level}`).toBeDefined();
        expect(m.from <= level, `${style} ${level}: ${m.id} is unlocked`).toBe(true);
        const here = order.indexOf(m.place!);
        expect(here, `${style} ${level}`).toBeGreaterThanOrEqual(0);
        expect(here, `${style} ${level}: moved back`).toBeGreaterThanOrEqual(at);
        at = here;
        const p = r.step.mapLocation!;
        expect({ x: p.x, y: p.y }, `${style} ${level}`).toEqual({ x: LOCATIONS[m.place!].x, y: LOCATIONS[m.place!].y });
        expect(r.step.inGame?.highlightItems).toEqual((r.step.itemsRequired ?? []).map((i) => i.nameEn));
      }
      // A newer unlock need not replace a faster already-unlocked method.
      expect(at).toBe(1);
    }
  });

  it('the place switches at 20 and remains at useful fly fishing after 40', () => {
    const at = (l: number) => resolved(l).step.mapLocation!.label;
    expect(at(19)).toContain('Draynor Village');
    expect(at(20)).toContain('Barbarian Village');
    expect(at(39)).toContain('Barbarian Village');
    expect(at(40)).toContain('Barbarian Village');
    expect(methodPoint('fi-fly')).toMatchObject({ x: LOCATIONS['Barbarian Village fishing spots'].x });
  });

  it('a selected method has one matching map point and game tile, rather than future methods mixed into its target', () => {
    for (const [level, bag] of [[1, {}], [25, {}], [42, { 'Lobster pot': 1 }]] as const) {
      const r = resolved(level, bag);
      const at = methodPoint(r.pick!)!;
      expect(stepPoints(r.step)).toEqual([at]);
      expect(initialPoint(r.step)).toBe(0);
      const payload = toInGameTarget(r.step)!;
      expect(payload.worldPoint).toMatchObject(at);
      expect(payload.groundTiles).toEqual([at]);
      expect(payload.completionTrigger).toEqual(step.inGame!.completionTrigger);
      expect(payload.watchItems).toEqual(expect.arrayContaining(methodToolNames(step)));
    }
  });

  it('unknown stays unknown: no level keeps the step on its own list; a reached goal asks for no fishing tool', () => {
    const none = resolved(null);
    expect(none.pick).toBeUndefined();
    expect(none.step).toBe(step);
    expect(needs(none.step)).toEqual(['Small fishing net']);
    const done = resolved(50);
    expect(done.pick).toBe(GOAL_REACHED);
    expect(needs(done.step)).toEqual([]);
    expect(withTrainingMethod(step, 'no-such-method')).toBe(step);
  });

  it('the game is asked to count the tools of every method, so the pick cannot flip between two methods for lack of data', () => {
    const names = methodToolNames(step);
    expect(names).toEqual(expect.arrayContaining(['Small fishing net', 'Fishing rod', 'Fishing bait', 'Fly fishing rod', 'Feather', 'Lobster pot', 'Harpoon']));
    // The payload of the static step and of every resolved one carries them all.
    for (const level of [1, 10, 25, 42]) {
      const payload = toInGameTarget(resolved(level).step)!;
      for (const n of names) expect(payload.watchItems, `level ${level}: ${n}`).toContain(n);
    }
  });

  /** The picks in turn when the game reports only the tracked names (an untracked item is unknown, not zero), each round tracking what the last pick asked for. */
  function rounds(level: number, bag: Record<string, number>, style: PlayStyle, alsoTrackEveryMethod: boolean): (string | undefined)[] {
    let tracked: string[] = (step.itemsRequired ?? []).map((i) => i.nameEn);
    const picks: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      const owned = { bankSeen: true, items: new Map(tracked.map((n) => [nameKey(n), { name: n, carried: bag[n] ?? 0, noted: 0, bank: 0 } as OwnedItem])) };
      const state = buildPlayerState({ mode: 'f2p', stats: { fishing: level, cooking: 30 }, progress: emptyProgress(), gear: null, questsDone: null, owned, connected: true });
      const pick = pickMethods([step], state, 'f2p', style)[step.id];
      picks.push(pick);
      const r = withTrainingMethod(step, pick);
      tracked = [...(r.itemsRequired ?? []).map((x) => x.nameEn), ...(alsoTrackEveryMethod ? methodToolNames(step) : [])];
    }
    return picks;
  }

  it('the pick settles with every tool tracked; unchecked stock no longer wins by pretending to be ready', () => {
    const bags: Record<string, number>[] = [{}, { 'Small fishing net': 1 }, { 'Fishing rod': 1, 'Fishing bait': 300 }, { 'Fly fishing rod': 1, Feather: 400 }, { 'Lobster pot': 1 }, { Harpoon: 1, 'Lobster pot': 1 }];
    let hazard = 0;
    for (const style of ['chill', 'efficient'] as const) {
      for (const level of [1, 5, 12, 19, 20, 33, 40, 49]) {
        for (const bag of bags) {
          const seq = rounds(level, bag, style, true);
          // After the first answer (made with the route's own list only) every round gives the same one.
          expect(new Set(seq.slice(1)).size, `${style} ${level} ${JSON.stringify(bag)}: ${seq.join(' > ')}`).toBe(1);
          if (new Set(rounds(level, bag, style, false).slice(1)).size > 1) hazard++;
        }
      }
    }
    // The old regression counted positive hazards here. Unchecked supplies no longer gain READY priority.
    // Keep watching every method: the additional information is still required for correct preparation.
    expect(hazard).toBe(0);
  });

  it('a step that does not follow a method is the same object whatever the pick says', () => {
    const other = stepById.get('S6-03')!;
    expect(withTrainingMethod(other, 'fi-fly')).toBe(other);
  });

  it('the picks are compared by content, so an unchanged answer keeps the store steady', () => {
    expect(samePicks({ 'S6-02': 'fi-fly' }, { 'S6-02': 'fi-fly' })).toBe(true);
    expect(samePicks({ 'S6-02': 'fi-fly' }, { 'S6-02': 'fi-lobster' })).toBe(false);
    expect(samePicks({}, { 'S6-02': 'fi-fly' })).toBe(false);
  });
});
