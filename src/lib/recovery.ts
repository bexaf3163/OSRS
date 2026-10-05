// Recovery mode: the player died, pressed a teleport in the middle of a step, or otherwise ended up far from where the step is.
// The route assumes the player stands where needed; after a setback "hit the zombie" or "go to the ladder" would be a mockery.
// The plugin sends a MOVED event: DEATH (the character died) and TELEPORT (a jump of 20+ tiles in a tick). Here it is decided
// whether it is a setback or a normal path: a teleport to the step is not a setback, and a respawn in Lumbridge far from the step is.
// Pure logic: the time and the tiles come from outside. What to do next is built by the preparation plan (prepPlan.ts):
// things could have been lost, and it sees that itself from the bag and bank; here there is only "is it a setback" and "what to say".

import type { Step } from '../types';

export interface Point { x: number; y: number; plane: number }

export interface MoveEvent {
  kind: 'DEATH' | 'TELEPORT';
  /** From where: for a death, where they died. */
  from: Point | null;
  /** Where they ended up; a death has none: the respawn's TELEPORT follows. */
  to: Point | null;
  /** When the app received the event, ms. */
  at: number;
}

/** Where a death respawns and where Home Teleport leads for most players. */
export const RESPAWN: Point = { x: 3222, y: 3218, plane: 0 };
/** No farther than this many tiles from the respawn point means "in Lumbridge". */
export const HUB_RADIUS = 15;
/** Farther than this many tiles from the step means "the step is far". */
export const FAR = 100;
/** Closer than this: already at the step, the recovery is over. */
export const NEAR = 40;
/** A death and a respawn come in a row: the respawn is later than the death by no more than this many ms: it is the same death. */
export const DEATH_WINDOW_MS = 3 * 60_000;
/** How long until the mode fades by itself. */
export const RECOVERY_TTL_MS = 30 * 60_000;
const UNDERGROUND = 6400;

export type RecoveryReason = 'DEATH' | 'TELEPORT';

export interface Recovery {
  reason: RecoveryReason;
  /** When it happened, ms. */
  since: number;
  /** Where the player ended up (Lumbridge); null means not respawned yet. */
  landedAt: Point | null;
  /** Where they died (only for a death). */
  diedAt: Point | null;
  /** Tiles to the step in a straight line; null means it cannot be counted (underground, no step point). */
  distance: number | null;
  /** Where to go back: the step's point. */
  target: Point | null;
}

const surfaceY = (y: number) => (y >= UNDERGROUND + 1000 ? y - UNDERGROUND : y);
const dist = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(surfaceY(a.y) - surfaceY(b.y)));
const underground = (p: Point) => p.y >= UNDERGROUND + 1000;

/** The step's point: an explicit point for the game, otherwise the start point on the map. */
export function stepPoint(step: Pick<Step, 'inGame' | 'mapLocation'>): Point | null {
  const w = step.inGame?.worldPoint ?? step.mapLocation;
  return w ? { x: w.x, y: w.y, plane: w.plane } : null;
}

export const inHub = (p: Point | null | undefined): boolean => !!p && !underground(p) && dist(p, RESPAWN) <= HUB_RADIUS;

export interface RecoveryInput {
  /** The MOVED events in order (new ones at the end). */
  moves: readonly MoveEvent[];
  step: Pick<Step, 'inGame' | 'mapLocation'>;
  now: number;
  /** The player pressed "This is not a setback": whatever happened before that moment does not count. */
  dismissedAt?: number;
  /** Where the player is now, if known: near the step means the recovery is over. */
  here?: Point | null;
}

/**
 * A setback or not. A death is always a setback (things could have stayed in the grave), unless the player ended up right at the step. A teleport is
 * only when it brought them to Lumbridge while the step is far from it: "Home Teleport in the middle of a quest". A teleport closer to the step
 * (Varrock Teleport to a quest in Varrock) is a normal path, not a setback.
 */
export function detectRecovery(i: RecoveryInput): Recovery | null {
  const last = i.moves[i.moves.length - 1];
  if (!last) return null;
  if (i.now - last.at > RECOVERY_TTL_MS) return null;
  if (i.dismissedAt !== undefined && i.dismissedAt >= last.at) return null;
  const target = stepPoint(i.step);
  const death = [...i.moves].reverse().find((m) => m.kind === 'DEATH' && last.at - m.at <= DEATH_WINDOW_MS && m.at <= last.at);
  const landedAt = last.kind === 'TELEPORT' ? last.to : null;
  // Where the player is: by the game's data; not yet respawned means they will respawn in Lumbridge (the place of death does not fit here).
  const place = i.here ?? landedAt ?? (death ? RESPAWN : null);
  const distance = place && target && !underground(target) && !underground(place) ? dist(place, target) : null;
  if (distance !== null && distance <= NEAR) return null;
  if (death) {
    // Died near the step and respawned anywhere is still a setback; but if the step is right at the respawn, there is nothing to do.
    if (target && landedAt && dist(landedAt, target) <= NEAR) return null;
    return { reason: 'DEATH', since: death.at, landedAt, diedAt: death.from, distance, target };
  }
  if (last.kind !== 'TELEPORT') return null;
  // A lone teleport: a setback only if it brought them to Lumbridge while the step is far from it.
  if (!inHub(last.to) || !target || underground(target) || dist(RESPAWN, target) <= FAR) return null;
  return { reason: 'TELEPORT', since: last.at, landedAt, diedAt: null, distance, target };
}

export interface RecoveryStep { label: string; detail?: string }

/**
 * What to say to the player. The order: things, the missing, the return. The "missing" is taken by the app from the preparation plan,
 * so an empty list here means "nothing was lost: just go back".
 */
export function recoverySteps(r: Recovery, missing: number, stepId: string): RecoveryStep[] {
  const out: RecoveryStep[] = [];
  if (r.reason === 'DEATH') {
    out.push({
      label: 'Collect the things left after the death',
      detail: 'They lie on the grave where you died; if you did not collect the grave in time, the things are with Death in Death’s Office. The grave first, then the bank.',
    });
  } else {
    out.push({ label: 'Check your bag and equipment', detail: 'The teleport moved you to Lumbridge: everything you had with you stays with you.' });
  }
  out.push(missing > 0
    ? { label: `Take what is missing: ${missing} ${missing === 1 ? 'item' : 'items'}`, detail: 'The list below is already recounted by what you have left.' }
    : { label: 'Nothing is missing: everything the step needs is with you' });
  out.push({ label: `Go back to step ${stepId}`, detail: 'The arrow in the game leads to the step\'s place; "How to get there" suggests a teleport or a canoe.' });
  return out;
}
