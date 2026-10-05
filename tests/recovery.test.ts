import { describe, expect, it } from 'vitest';
import { detectRecovery, DEATH_WINDOW_MS, FAR, inHub, NEAR, RECOVERY_TTL_MS, RESPAWN, recoverySteps, stepPoint, type MoveEvent, type Point } from '../src/lib/recovery';
import { parseMove } from '../src/services/runeliteBridge';

const NOW = 1_800_000_000_000;
const at = (x: number, y: number, plane = 0): Point => ({ x, y, plane });
const step = (p: Point | null) => ({ mapLocation: p ? { ...p, label: 'step' } : undefined }) as never;
const tp = (to: Point, from: Point | null, ago = 1000): MoveEvent => ({ kind: 'TELEPORT', from, to, at: NOW - ago });
const death = (where: Point, ago = 5000): MoveEvent => ({ kind: 'DEATH', from: where, to: null, at: NOW - ago });

// A step in the dungeon under Melzar's Maze and a step near Varrock — far from Lumbridge.
const MELZAR = at(2929, 3248);
const VARROCK = at(3213, 3428);

describe('recovery mode: a derailment or the normal way', () => {
  it('death and respawn in Lumbridge far from the step — a "DEATH" derailment; the player looks for the things', () => {
    const r = detectRecovery({ moves: [death(at(2929, 3250), 8000), tp(RESPAWN, at(2929, 3250), 1000)], step: step(MELZAR), now: NOW });
    expect(r).toMatchObject({ reason: 'DEATH', landedAt: RESPAWN, diedAt: at(2929, 3250) });
    expect(r?.distance).toBeGreaterThan(NEAR);
    expect(r?.target).toEqual(MELZAR);
  });

  it('death without a respawn (not respawned yet) — also a derailment', () => {
    const r = detectRecovery({ moves: [death(at(2929, 3250), 1000)], step: step(MELZAR), now: NOW });
    expect(r?.reason).toBe('DEATH');
    expect(r?.landedAt).toBeNull();
  });

  it('Home Teleport in the middle of a step — a "TELEPORT" derailment; a teleport to the step — the normal way', () => {
    expect(detectRecovery({ moves: [tp(RESPAWN, MELZAR)], step: step(MELZAR), now: NOW })?.reason).toBe('TELEPORT');
    // Varrock Teleport to a step in Varrock — not a derailment.
    expect(detectRecovery({ moves: [tp(at(3213, 3424), RESPAWN)], step: step(VARROCK), now: NOW })).toBeNull();
    // A teleport to Lumbridge while the step is in Lumbridge — also not a derailment.
    expect(detectRecovery({ moves: [tp(RESPAWN, VARROCK)], step: step(at(3230, 3225)), now: NOW })).toBeNull();
  });

  it('a teleport anywhere except Lumbridge is not counted as a derailment (the person knows where they are flying)', () => {
    expect(detectRecovery({ moves: [tp(at(2964, 3378), RESPAWN)], step: step(MELZAR), now: NOW })).toBeNull();
  });

  it('the player is already at the step — the recovery is over', () => {
    const moves = [death(MELZAR, 8000), tp(RESPAWN, MELZAR, 1000)];
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW, here: at(2930, 3249) })).toBeNull();
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW, here: at(3222, 3218) })).not.toBeNull();
  });

  it('"This is not a derailment" silences what was earlier; a new event switches it on again', () => {
    const moves = [tp(RESPAWN, MELZAR, 5000)];
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW, dismissedAt: NOW - 1000 })).toBeNull();
    expect(detectRecovery({ moves: [...moves, tp(RESPAWN, MELZAR, 100)], step: step(MELZAR), now: NOW, dismissedAt: NOW - 1000 })).not.toBeNull();
  });

  it('after 30 minutes the mode goes out by itself; without events — no mode', () => {
    expect(detectRecovery({ moves: [tp(RESPAWN, MELZAR, RECOVERY_TTL_MS + 1)], step: step(MELZAR), now: NOW })).toBeNull();
    expect(detectRecovery({ moves: [], step: step(MELZAR), now: NOW })).toBeNull();
  });

  it('death and respawn far apart in time — different events: a lone teleport is judged by itself', () => {
    const moves = [death(MELZAR, DEATH_WINDOW_MS + 60_000), tp(RESPAWN, VARROCK, 1000)];
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW })?.reason).toBe('TELEPORT');
  });

  it('the step has no point or is underground: the distance is unknown; death — a derailment, a lone teleport — not', () => {
    expect(detectRecovery({ moves: [death(MELZAR), tp(RESPAWN, MELZAR)], step: step(null), now: NOW })?.distance).toBeNull();
    expect(detectRecovery({ moves: [tp(RESPAWN, MELZAR)], step: step(null), now: NOW })).toBeNull();
    const dungeon = at(3049, 9566);
    expect(detectRecovery({ moves: [tp(RESPAWN, dungeon)], step: step(dungeon), now: NOW })).toBeNull();
    const d = detectRecovery({ moves: [death(dungeon), tp(RESPAWN, dungeon)], step: step(dungeon), now: NOW });
    expect(d?.reason).toBe('DEATH');
    expect(d?.distance).toBeNull();
  });

  it('the respawn point and "in Lumbridge"', () => {
    expect(inHub(RESPAWN)).toBe(true);
    expect(inHub(at(3222 + 14, 3218))).toBe(true);
    expect(inHub(at(3222 + 30, 3218))).toBe(false);
    expect(inHub(at(3222, 3218 + 6400))).toBe(false);
    expect(inHub(null)).toBe(false);
    expect(FAR).toBeGreaterThan(NEAR);
  });

  it('the step point: an explicit game point wins over the map', () => {
    expect(stepPoint({ inGame: { worldPoint: { x: 1, y: 2, plane: 0, label: 'a' } }, mapLocation: { x: 3, y: 4, plane: 0, label: 'b' } } as never)).toEqual({ x: 1, y: 2, plane: 0 });
    expect(stepPoint({ mapLocation: { x: 3, y: 4, plane: 1, label: 'b' } } as never)).toEqual({ x: 3, y: 4, plane: 1 });
    expect(stepPoint({} as never)).toBeNull();
  });
});

describe('recovery mode: what to say', () => {
  const base = { since: NOW, landedAt: RESPAWN, diedAt: null, distance: 300, target: MELZAR };
  it('after death — the things, what is missing, the return; after a teleport there are no things to look for', () => {
    const d = recoverySteps({ ...base, reason: 'DEATH' }, 2, 'S5-03');
    expect(d.map((x) => x.label)).toEqual(['Collect the things left after the death', 'Take what is missing: 2 items', 'Go back to step S5-03']);
    expect(d[0].detail).toContain('grave');
    const t = recoverySteps({ ...base, reason: 'TELEPORT' }, 0, 'S5-03');
    expect(t[0].label).toBe('Check your bag and equipment');
    expect(t[1].label).toContain('Nothing is missing');
  });
});

describe('the MOVED event', () => {
  it('is parsed; garbage is dropped', () => {
    expect(parseMove({ type: 'MOVED', kind: 'TELEPORT', from: { x: 3000, y: 3200, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } })).toEqual({ kind: 'TELEPORT', from: { x: 3000, y: 3200, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } });
    expect(parseMove({ kind: 'DEATH', from: { x: 3000, y: 3200, plane: 0 }, to: null })).toEqual({ kind: 'DEATH', from: { x: 3000, y: 3200, plane: 0 }, to: null });
    expect(parseMove({ kind: 'FLY' })).toBeNull();
    expect(parseMove(null)).toBeNull();
    expect(parseMove({ kind: 'DEATH', from: { x: -1, y: 'a', plane: 9 } })).toEqual({ kind: 'DEATH', from: null, to: null });
  });
});
