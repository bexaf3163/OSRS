// The state snapshot for the game: protocol 6 (POST /prep-plan). Before, the app sent the plugin five separate requests
// (the step, shopping, bank highlighting, gear advice, and the plan was counted in the app only for itself): between them the game
// screen showed now an arrow to a new step with the old list, now advice for the previous step. Now the app gathers everything
// that should be in the game into one message; the plugin applies it in one pass and only draws. The app decides:
// it has the bag, the bank, the prices, the steps ahead and the preparation plan (prepPlan.ts); the plugin has the live bag for instant ticks.
//
// The snapshot is complete: what is not in it (null) is cleared. The seq number grows; the plugin drops a late one. Pure functions:
// sending and retries are handled by bridge.tsx.

import type { ActiveStepPayload, GearHintPayload, ShoppingPlanPayload } from '../services/runeliteBridge';
import { kgText } from './weight';
import type { PrepLine, PrepPlan, PrepPriority, PrepTiming, PrepWhere, Supply } from './prepPlan';
import type { Detour } from './detours';

export const SNAPSHOT_VERSION = 6;

/** The limit of plan lines and texts is the same as in the plugin (PrepPlan.java): the plugin would reject the excess whole. */
export const MAX_PLAN_LINES = 48;
const MAX_LATER = 12;
const MAX_RECOVERY = 5;
const MAX_BLOCKERS = 4;
const MAX_TEXT = 200;

export interface PrepPlanPayload {
  stepId: string;
  score: { percent: number | null; verdict: 'READY' | 'NOT_READY' | 'UNKNOWN'; critical: number; important: number; optimizations: number; unknown: number };
  lines: { name: string; need: number; where: PrepWhere; priority: PrepPriority; timing: PrepTiming; supply?: Exclude<Supply, 'ENOUGH'>; action?: string }[];
  /** "Do not take now": what will be needed later. */
  later: string[];
  recovery?: { title: string; steps: string[] };
  weight?: string;
  slots?: string;
  blockers?: string[];
  /** A stop worth making on the way ("Detour: Buy Orange dye at ..."): the text and where the arrow leads when it is clicked in the game. */
  detour?: { text: string; x: number; y: number; plane: number; label: string };
}

export interface BankTagsPayload {
  stageId: string;
  itemIds: number[];
}

export interface PrepEnvelope {
  v: typeof SNAPSHOT_VERSION;
  seq: number;
  step: ActiveStepPayload | null;
  shopping: ShoppingPlanPayload | null;
  bankTags: BankTagsPayload | null;
  gearHint: GearHintPayload | null;
  plan: PrepPlanPayload | null;
}

/** A string no longer than the plugin's limit: cut at a word, with an ellipsis. */
export function clipText(s: string, max = MAX_TEXT): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2)))}…`;
}

const countOf = (l: Pick<PrepLine, 'name' | 'count'>) => (l.count > 1 ? `${l.name} ×${l.count}` : l.name);

/** The weight text for the game: what to leave in the bank and what that gives. Empty means nothing to advise. */
export function weightText(plan: PrepPlan): string | undefined {
  const w = plan.weight;
  if (w.level === 'NONE' || !w.items.length) return undefined;
  const names = w.items.slice(0, 3).map((i) => `${i.name}${i.count > 1 ? ` ×${i.count}` : ''}`).join(', ');
  const more = w.items.length > 3 ? ` and ${w.items.length - 3} more` : '';
  const head = w.level === 'HEAVY' ? 'Deposit in the bank' : 'You can leave in the bank';
  const effect = w.current !== null && w.after !== null
    ? ` (${kgText(w.current)} → ${kgText(Math.max(0, w.after))}${w.ratio !== null && w.ratio >= 1.05 ? `, running lasts ~${(Math.round(w.ratio * 10) / 10).toLocaleString('en-US')}x longer` : ''})`
    : ` (−${kgText(w.saving)})`;
  return clipText(`${head}: ${names}${more}${effect}`);
}

/** The bag will not hold everything at once: what to do. Empty means it fits or is unknown. */
export function slotsText(plan: PrepPlan): string | undefined {
  const over = plan.slots.over;
  if (over <= 0) return undefined;
  return clipText(`It will not all fit at once: ${over} ${over === 1 ? 'slot' : 'slots'} too many. Take what the step needs, the rest later`);
}

/** The recovery mode for the game: the heading and the points in order. */
export function recoveryPayload(plan: PrepPlan): PrepPlanPayload['recovery'] | undefined {
  const rec = plan.recovery;
  if (!rec) return undefined;
  const r = rec.recovery;
  const far = r.distance !== null ? ` (~${r.distance} tiles)` : '';
  const title = r.reason === 'DEATH' ? `You died: step ${plan.stepId} is far away${far}` : `You are in Lumbridge: step ${plan.stepId} is far away${far}`;
  const steps = rec.steps.slice(0, MAX_RECOVERY).map((s) => clipText(s.detail ? `${s.label} — ${s.detail}` : s.label));
  return steps.length ? { title: clipText(title), steps } : undefined;
}

/** The preparation plan in the form the plugin draws: without the excess and within its checks. */
export function planPayload(plan: PrepPlan, detour?: Detour | null): PrepPlanPayload {
  const lines = plan.lines
    .filter((l) => l.timing !== 'LATER')
    .slice(0, MAX_PLAN_LINES)
    .map((l) => ({
      name: clipText(l.name),
      need: Math.max(0, Math.min(l.count, 10_000_000)),
      where: l.where,
      priority: l.priority,
      timing: l.timing,
      ...(l.supply && l.supply !== 'ENOUGH' ? { supply: l.supply } : {}),
      ...(l.action ? { action: clipText(l.action.label, 90) } : {}),
    }));
  const weight = weightText(plan);
  const slots = slotsText(plan);
  const recovery = recoveryPayload(plan);
  const s = plan.score;
  return {
    stepId: plan.stepId,
    score: { percent: s.percent, verdict: s.verdict, critical: s.critical, important: s.important, optimizations: s.optimizations, unknown: s.unknown },
    lines,
    later: plan.later.slice(0, MAX_LATER).map((l) => clipText(countOf(l), 60)),
    ...(recovery ? { recovery } : {}),
    ...(weight ? { weight } : {}),
    ...(slots ? { slots } : {}),
    ...(detour ? { detour: { text: clipText(detour.text), x: detour.stop.x, y: detour.stop.y, plane: detour.stop.plane, label: clipText(detour.stop.label, 60) } } : {}),
    ...(plan.blockers.length ? { blockers: plan.blockers.slice(0, MAX_BLOCKERS).map((b) => clipText(b.detail ? `${b.label} — ${b.detail}` : b.label)) } : {}),
  };
}

export interface SnapshotParts {
  step: ActiveStepPayload | null;
  shopping: ShoppingPlanPayload | null;
  bankTags: BankTagsPayload | null;
  gearHint: GearHintPayload | null;
  plan: PrepPlanPayload | null;
}

export const EMPTY_PARTS: SnapshotParts = { step: null, shopping: null, bankTags: null, gearHint: null, plan: null };

/** The number of the next snapshot: it grows between app launches too (by the clock), so that the plugin does not take a new one for a late one. */
export function nextSeq(prev: number, now = Date.now()): number {
  return Math.max(prev + 1, now);
}

export function buildEnvelope(parts: SnapshotParts, seq: number): PrepEnvelope {
  return {
    v: SNAPSHOT_VERSION,
    seq,
    step: parts.step,
    shopping: parts.shopping && parts.shopping.items.length ? parts.shopping : null,
    // An empty list highlights nothing, as "cleared".
    bankTags: parts.bankTags && parts.bankTags.itemIds.length ? parts.bankTags : null,
    gearHint: parts.gearHint,
    // The plugin will not apply a plan from another step; we do not send the excess either.
    plan: parts.plan && (!parts.step || parts.plan.stepId === parts.step.stepId) ? parts.plan : null,
  };
}

/** What the snapshot contains in substance, without the number: the same is not sent a second time. */
export function envelopeKey(parts: SnapshotParts): string {
  const e = buildEnvelope(parts, 0);
  return JSON.stringify({ ...e, seq: 0 });
}
