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
import type { RecommendedTransport } from './transport';
import type { SkillPathPayload } from './skillGuide';
import { items as itemData } from '../data';
import { nameKey } from './checklist';

export const SNAPSHOT_VERSION = 6;

/** The limit of plan lines and texts is the same as in the plugin (PrepPlan.java): the plugin would reject the excess whole. */
export const MAX_PLAN_LINES = 48;
const MAX_LATER = 12;
const MAX_RECOVERY = 5;
const MAX_BLOCKERS = 4;
export const MAX_WITHDRAWALS = 12;
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
  /** A stop worth making on the way ("Detour: Buy Orange dye at ..."): the text, where the arrow leads when it is clicked in the game, and what it costs. */
  activeDetour?: { label: string; targetTile: { x: number; y: number; plane: number }; costTiles: number; actionType: string; text: string };
  /** What lies in the bank and is needed now or soon: the plugin frames it when the bank is open and lists it in the tips. itemId 0 means not known. */
  bankWithdrawals?: { itemId: number; itemName: string; quantity: number }[];
  /** The way that is not walking and is clearly shorter: the plugin shows one line, points at the first stop and frames the item to use. */
  recommendedTransport?: { type: string; destination: string; interactionId: number; interactionName?: string; item?: string; tile?: { x: number; y: number; plane: number }; text: string };
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
  skillPath?: SkillPathPayload;
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

let idByName: Map<string, number> | null = null;
/** The game item id by name, from the project's item database; 0 when the item is not in it. */
function itemIdOf(name: string): number {
  if (!idByName) idByName = new Map(itemData.map((i) => [nameKey(i.nameEn), i.id]));
  return idByName.get(nameKey(name)) ?? 0;
}

/** The items the plan says to take out of the bank (needed now or soon): so a stop at a bank is for something. */
export function bankWithdrawalsOf(plan: Pick<PrepPlan, 'lines'>): NonNullable<PrepPlanPayload['bankWithdrawals']> {
  return plan.lines
    .filter((l) => l.where === 'BANK' && (l.timing === 'NOW' || l.timing === 'SOON'))
    .slice(0, MAX_WITHDRAWALS)
    .map((l) => ({ itemId: itemIdOf(l.name), itemName: clipText(l.name, 60), quantity: Math.max(1, Math.min(l.toGet ?? l.count, 10_000_000)) }));
}

export interface PlanExtras { detour?: Detour | null; transport?: RecommendedTransport | null }

/** The preparation plan in the form the plugin draws: without the excess and within its checks. */
export function planPayload(plan: PrepPlan, extras: PlanExtras = {}): PrepPlanPayload {
  const { detour, transport } = extras;
  const withdrawals = bankWithdrawalsOf(plan);
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
    ...(detour ? {
      activeDetour: {
        label: clipText(detour.stop.label, 60), targetTile: { x: detour.stop.x, y: detour.stop.y, plane: detour.stop.plane },
        costTiles: Math.max(0, Math.round(detour.extraTiles)), actionType: detour.actionType, text: clipText(detour.text),
      },
    } : {}),
    ...(withdrawals.length ? { bankWithdrawals: withdrawals } : {}),
    ...(transport ? {
      recommendedTransport: {
        type: transport.type, destination: clipText(transport.destination, 60), interactionId: transport.interactionId,
        ...(transport.interactionName ? { interactionName: clipText(transport.interactionName, 60) } : {}),
        ...(transport.item ? { item: clipText(transport.item, 60) } : {}),
        ...(transport.tile ? { tile: { x: transport.tile.x, y: transport.tile.y, plane: transport.tile.plane } } : {}),
        text: clipText(transport.text),
      },
    } : {}),
    ...(plan.blockers.length ? { blockers: plan.blockers.slice(0, MAX_BLOCKERS).map((b) => clipText(b.detail ? `${b.label} — ${b.detail}` : b.label)) } : {}),
  };
}

export interface SnapshotParts {
  step: ActiveStepPayload | null;
  shopping: ShoppingPlanPayload | null;
  bankTags: BankTagsPayload | null;
  gearHint: GearHintPayload | null;
  plan: PrepPlanPayload | null;
  /** The tracked skill's whole path (Skills → "Track Skill Path"): while it is there the plugin leads the skill step and ignores the quest step. */
  skillPath?: SkillPathPayload | null;
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
    // Only when there is one: an app that tracks no skill sends the same snapshot as before.
    ...(parts.skillPath && parts.skillPath.steps.length ? { skillPath: parts.skillPath } : {}),
  };
}

/** What the snapshot contains in substance, without the number: the same is not sent a second time. */
export function envelopeKey(parts: SnapshotParts): string {
  const e = buildEnvelope(parts, 0);
  return JSON.stringify({ ...e, seq: 0 });
}
