// What the RuneLite plugin reports, read safely: its event stream and the status parts (stats, XP, quests, position,
// player, gear, pacing). Anything malformed becomes null, never a guess.
import type { PacingSkill, PlayerStats } from '../types';
import type { GearItem, GearState, PacingState, BridgeEvent } from './runeliteBridge';

export function parseEvent(text: string): BridgeEvent | null {
  try {
    const e = JSON.parse(text) as unknown;
    if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string') return e as BridgeEvent;
  } catch {
    // Not JSON — skip.
  }
  return null;
}

/** Levels from an event or a /status reply: numbers only, sensible ones only. */
export function parseStats(raw: unknown): PlayerStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: PlayerStats = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 126) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** XP from an XP event or a /status reply: whole numbers from 0 to 200 million per skill. */
export function parseXp(raw: unknown): PlayerStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: PlayerStats = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z]{3,16}$/.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 200_000_000) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Names of completed quests: strings up to 80 characters, no more than 300. */
export function parseQuests(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((q): q is string => typeof q === 'string' && q.length > 0 && q.length <= 80).slice(0, 300);
  return out;
}

/** The character position from /status: three whole numbers within the game map. */
export function parsePos(raw: unknown): { x: number; y: number; plane: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  return ok(r.x, 0, 20000) && ok(r.y, 0, 20000) && ok(r.plane, 0, 3) ? { x: r.x, y: r.y, plane: r.plane } : null;
}

/** The seconds left of a cooldown: a whole number up to an hour (the Home Teleport is half an hour); anything else is unknown. */
export function parseSeconds(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 && raw <= 3600 ? raw : null;
}

/** The character name: up to 12 characters (as in the game), without control characters. */
export function parsePlayer(raw: unknown): string | null {
  return typeof raw === 'string' && /^[\w \-\u00a0]{1,12}$/.test(raw) ? raw.replace(/\u00a0/g, ' ') : null;
}

const int = (v: unknown, min = 0): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null);

function gearItems(raw: unknown): GearItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GearItem[] = [];
  for (const r of raw) {
    const o = r as { id?: unknown; name?: unknown; count?: unknown; slot?: unknown; noted?: unknown } | null;
    const id = int(o?.id, 1);
    if (id === null || typeof o?.name !== 'string') continue;
    const count = int(o.count, 1);
    const slot = typeof o.slot === 'string' && /^[a-z]{2,10}$/.test(o.slot) ? o.slot : undefined;
    out.push({ id, name: o.name, ...(count !== null ? { count } : {}), ...(slot ? { slot } : {}), ...(o.noted === true ? { noted: true } : {}) });
  }
  return out;
}

/** Equipment from /status or the GEAR event. null — nothing is known (the plugin's Gson does not write null fields). */
export function parseGear(raw: unknown): GearState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const g: GearState = {
    equipment: gearItems(o.equipment), inventory: gearItems(o.inventory), coins: int(o.coins), bankCoins: int(o.bankCoins),
    ...(int(o.inventorySlots) !== null && (o.inventorySlots as number) <= 28 ? { inventorySlots: int(o.inventorySlots) } : {}),
    ...(typeof o.weight === 'number' && Number.isFinite(o.weight) && o.weight >= -64 && o.weight <= 1100 ? { weight: o.weight } : {}),
    // The estimate is absent from a plugin before 2.9 and until the bank is opened (Gson does not write null) — then we do not create the field.
    ...(int(o.carriedValue) !== null ? { carriedValue: int(o.carriedValue) } : {}),
    ...(int(o.bankValue) !== null ? { bankValue: int(o.bankValue) } : {}),
  };
  return g.equipment || g.inventory || g.coins !== null ? g : null;
}

const PACING_SKILLS = new Set<PacingSkill>(['fishing', 'woodcutting', 'cooking', 'mining', 'attack', 'strength', 'defence']);

/** The PACING event. null — the step has no pace or it is turned off in the plugin. */
export function parsePacing(e: unknown): PacingState | null {
  const o = e as { stepId?: unknown; pacing?: Record<string, unknown> | null } | null;
  const p = o?.pacing;
  if (!p || typeof o?.stepId !== 'string' || !PACING_SKILLS.has(p.skill as PacingSkill)) return null;
  const xp = int(p.xp);
  const remainingXp = int(p.remainingXp);
  const actionsLeft = int(p.actionsLeft);
  const targetLevel = int(p.targetLevel, 1);
  if (xp === null || remainingXp === null || actionsLeft === null || targetLevel === null) return null;
  const apm = typeof p.actionsPerMinute === 'number' && p.actionsPerMinute > 0 ? p.actionsPerMinute : null;
  const left = Array.isArray(p.left) ? p.left.filter((k): k is PacingSkill => PACING_SKILLS.has(k as PacingSkill)) : [];
  return {
    stepId: o.stepId, skill: p.skill as PacingSkill, targetLevel, xp, remainingXp, actionsLeft,
    actionsPerMinute: apm, etaSeconds: int(p.etaSeconds), estimated: p.estimated === true, almost: p.almost === true, done: p.done === true, left,
  };
}
