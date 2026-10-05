// The link to the RuneLite plugin "OSRS Path Bridge" on this computer: http://127.0.0.1:38282.
// Requests go through the Electron main process (preload → ipc): the plugin accepts only them, and a request
// from a page in a browser (with an Origin header) is rejected. There is no remote server: the bridge listens on loopback only.

import type { MoveEvent } from '../lib/recovery';
import type { PrepEnvelope } from '../lib/prepEnvelope';
import type { InGameTarget, PacingSkill, StageHighlight, PlayerStats, Progress, Step, StepBranch, StepPacing } from '../types';
import { desktop } from '../lib/desktop';
import { isClosed, openAfter } from '../lib/next-step';
import { parseAmount, preflightItems } from '../lib/checklist';
import { watchedItems } from '../lib/branching';
import { stepMaxHit } from '../lib/foodAdvice';
import { npcSpot, stepPlaces } from '../lib/stepPlaces';
import { shortLine } from '../lib/shortText';
import { summarizeBridge, type BridgeTelemetry } from '../lib/telemetryReport';

export const BRIDGE_ORIGIN = 'http://127.0.0.1:38282';

export interface BridgeStatus {
  online: boolean;
  inGame: boolean;
  /** Skill levels from the game; null — not in the game, the plugin is old or sending is turned off in its settings. */
  stats: PlayerStats | null;
  /** The Shortest Path plugin is installed and enabled — it draws the route over land. */
  shortestPath: boolean;
  /** Equipment, bag and coins; null — not in the game, the plugin is old or the upgrade hints are turned off. */
  gear: GearState | null;
  /** The step the plugin shows now; null — none (for example, RuneLite was just restarted). */
  activeStepId: string | null;
  /** The bridge protocol version; null — a plugin before 2.9 (no such field). */
  protocol: number | null;
  pluginVersion: string | null;
  /** Where the temporary target in the game leads (since 2.11); null — to the step or the plugin does not report. */
  navTarget: NavTargetPayload | null;
  /** XP by skill (protocol 5); null — not in the game, the plugin is old or sending is turned off. */
  xp: PlayerStats | null;
  /** Names of completed quests (protocol 5); null — unknown. */
  questsDone: string[] | null;
  /** The character name (protocol 5); null — not in the game or the plugin does not report. */
  player: string | null;
  /** Where the character stands (protocol 5): game coordinates; null — unknown. */
  pos: { x: number; y: number; plane: number } | null;
  /** Seconds until the Home Teleport can be cast again (plugin 2.37+); null — it is ready, or the plugin does not know. */
  homeTeleportSeconds: number | null;
}

/**
 * The protocol the app expects. With an older plugin the app asks to update it: it does not
 * know the new addresses and fields. A plugin without the protocol field is before 2.9: it works (the main addresses are the same), but without the new features.
 * 4 (2.11) — the "What you need" list on the game screen; plugin 2.10 (protocol 3) does not have it.
 * 6 (2.22) — one /prep-plan state snapshot instead of five requests, the preparation plan on the game screen.
 */
export const APP_PROTOCOL = 6;

/** What an old plugin lacks — for the "update the plugin" warning: what appeared since which protocol. */
export function missingWithPlugin(protocol: number | null): string[] {
  const p = protocol ?? 1;
  const out: string[] = [];
  if (p < 6) out.push('a single state snapshot and the preparation plan on the game screen (readiness percent, "do not take now", recovery mode)');
  if (p < 5) out.push('XP, quests and the character name from the game (account sync, profiles, time to the goal)');
  if (p < 4) out.push('the "What you need" list on the game screen (a click on a row gives an arrow and the path there)');
  if (p < 3) out.push('the "OSRS Path" side panel in RuneLite');
  if (p < 2) out.push('the big arrow and the valuation of items in the bank');
  return out;
}

/** The plugin understands the single /prep-plan snapshot (protocol 6). */
export function supportsSnapshot(protocol: number | null): boolean {
  return protocol !== null && protocol >= 6;
}

export type PluginCompat = 'ok' | 'legacy' | 'older' | 'newer';

export function pluginCompat(protocol: number | null): PluginCompat {
  if (protocol === null) return 'legacy';
  if (protocol < APP_PROTOCOL) return 'older';
  return protocol > APP_PROTOCOL ? 'newer' : 'ok';
}

/** An item from the game: worn or in the bag. */
export interface GearItem {
  id: number;
  name: string;
  count?: number;
  /** The slot of a worn item as in RuneLite (EquipmentInventorySlot): weapon, head, amulet… An old plugin does not send it. */
  slot?: string;
}

/** Equipment and coins for the upgrade hint. null in a field — the game has not yet sent that container. */
export interface GearState {
  equipment: GearItem[] | null;
  inventory: GearItem[] | null;
  /** Occupied bag cells (out of 28); absent in a plugin before 2.20 — then there is nothing to check the space with. */
  inventorySlots?: number | null;
  /** The weight of the bag and worn items, kg (client.getWeight); absent in a plugin before 2.20. */
  weight?: number | null;
  coins: number | null;
  /** Coins in the bank; null — the bank was not opened in this session. */
  bankCoins: number | null;
  /**
   * The valuation of items at exchange prices (without coins) — how much you get by selling: in the bag and worn, and in the bank.
   * null — unknown (the bank was not opened or the plugin is before 2.9). It is not money: shown separately, with "~".
   */
  carriedValue?: number | null;
  bankValue?: number | null;
}

/** The training pace of a step from the game (the PACING event). */
export interface PacingState {
  stepId: string;
  skill: PacingSkill;
  targetLevel: number;
  xp: number;
  remainingXp: number;
  actionsLeft: number;
  /** null — too few measurements, we do not invent the time. */
  actionsPerMinute: number | null;
  etaSeconds: number | null;
  /** The time is a first estimate from the step's data, not a measurement. */
  estimated: boolean;
  almost: boolean;
  done: boolean;
  /** Combat: the step's skills that have not reached the goal yet, except the shown one. For a single skill — empty. */
  left: PacingSkill[];
}

/** A temporary target over the step: a place from the map or a shop for an upgrade. */
export interface NavTargetPayload {
  label: string;
  x: number;
  y: number;
  plane: number;
  npcNames?: string[];
  /** The item we are going for: the target is cleared when it is in the bag or worn. */
  itemName?: string;
  itemId?: number;
  stepId?: string;
}

export type NavResult =
  | { ok: true }
  | { ok: false; reason: 'offline' }
  /** The plugin answered but refused: the feature is turned off in its settings or the plugin is old. */
  | { ok: false; reason: 'refused'; message: string };

export type BridgeEvent =
  | { type: 'STEP_AUTO_COMPLETED'; stepId: string }
  | { type: 'STATUS'; inGame: boolean; player?: string | null }
  | { type: 'XP'; xp?: PlayerStats | null }
  | { type: 'QUESTS'; done?: string[] | null }
  | { type: 'STATS'; stats?: PlayerStats | null }
  | { type: 'OWNED'; bankSeen: boolean; items: unknown[] }
  | { type: string; [key: string]: unknown };

/** All the plugin addresses the app uses. The desktop app lets only them through (electron/runelite-bridge.cjs). */
export const BRIDGE_PATHS = ['/status', '/active-step', '/clear', '/shopping-plan', '/nav-target', '/bank-tags', '/gear-hint', '/prep-plan', '/telemetry'] as const;
export type BridgePath = typeof BRIDGE_PATHS[number];

export interface BridgeResponse {
  ok: boolean;
  status: number;
  data?: unknown;
}

/** A way to reach the bridge: through the Electron main process; in tests — a stub. */
export interface BridgeTransport {
  request(method: 'GET' | 'POST', path: BridgePath, body?: unknown): Promise<BridgeResponse>;
  /** The event stream. Returns a close function. onError — the stream broke or did not open. */
  openEvents(onEvent: (e: BridgeEvent) => void, onOpen: () => void, onError: () => void): () => void;
}

/** An item for the departure check at the bank. */
export interface ChecklistPayloadItem {
  name: string;
  id?: number;
  count: number;
  heals?: number;
}

/** What goes to the plugin: the step target plus the code, the title, the departure check and the items from the quick variants' conditions. */
export type ActiveStepPayload = InGameTarget & {
  stepId: string;
  title: string;
  checklist?: ChecklistPayloadItem[];
  watchItems?: string[];
  pacing?: StepPacing;
  guide?: StepGuidePayload;
  /** The strongest ordinary hit of the step's opponents (wiki): the HUD warns about health below two such hits. */
  maxHit?: number;
  useOn?: { item: string; target: string; kind?: string }[];
};

/**
 * For the "OSRS Path" side panel in RuneLite (since protocol 3): what the step needs and where to get it, and the step's points —
 * "Go here" sets a temporary target, the arrow and Shortest Path lead there, and on arrival the arrow returns to the step.
 */
export interface StepGuidePayload {
  items: { name: string; id?: number; count?: number; where?: string; inStep?: boolean }[];
  places: { x: number; y: number; plane: number; label: string; npc?: string; items?: string[] }[];
  /** The step's quick path in order: when everything is collected, the game shows the last item ("Give everything to Hetty…"). */
  steps?: string[];
  /** Quest stages: the plugin reads the quest variable and shows only the current stage. */
  stage?: StagePayload;
}

export interface StagePayload {
  kind: 'varp' | 'varbit';
  id: number;
  stages: { at: number; steps: { t: string; s?: string; x?: number; y?: number; plane?: number; has?: string; need?: string; hl?: StageHighlight; k?: string }[]; /** The index of the point in places. */ go?: number; items?: { name: string; id?: number; count?: number; where?: string; inStep?: boolean }[] }[];
}

/** The RuneLite panel: the step's items with "where to get" and the points — the main one (NPC, start) and places from the step map. */
export function stepGuide(step: Step, branch?: StepBranch): StepGuidePayload {
  const items = (step.itemsRequired ?? []).map((i) => {
    const n = parseAmount(i.amount);
    return {
      name: i.nameEn,
      ...(i.wikiItemId !== undefined ? { id: i.wikiItemId } : {}),
      ...(n !== null ? { count: n } : {}),
      ...(i.howToGet ? { where: i.howToGet } : {}),
      ...(i.inStep ? { inStep: true } : {}),
    };
  });
  // The places are the same as the points on the step map in the app: the step point, places from the map, where items come from, quest NPCs.
  const places: StepGuidePayload['places'] = stepPlaces(step, branch).map((p) => ({
    x: p.x, y: p.y, plane: p.plane, label: p.label, ...(p.npc ? { npc: p.npc } : {}), ...(p.items?.length ? { items: p.items } : {}),
  }));
  // Always sent, even if empty: without guide the plugin considers the app old and asks to update it
  // (in 2.10 steps without items and with one point went without it — the panel wrote "Update the app" for nothing).
  const all = (step.quickSteps ?? []).filter((q) => q.length > 0 && q.length <= 500);
  // A long route: the plugin needs only the last item ("Next"), and the list is limited — the first fifteen and the last.
  const steps = all.length > 16 ? [...all.slice(0, 15), all[all.length - 1]] : all;
  const stage = stagePayload(step, places);
  return { items: items.slice(0, 64), places: places.slice(0, 64), ...(steps.length ? { steps } : {}), ...(stage ? { stage } : {}) };
}

const near = (a: { x: number; y: number; plane: number }, b: { x: number; y: number; plane: number }) =>
  a.plane === b.plane && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

/**
 * Quest stages for the game. A stage point (an NPC by name or explicit) goes into places — the same "Where to go" row that the
 * arrow and Shortest Path already know how to lead to; the stage refers to it by number. An unknown NPC — a stage without a point.
 */
/** A short row text for the game: the ready s from the data, otherwise an abbreviation; not sent if it is not shorter than the full one. */
function shortOf(l: { t: string; s?: string }): { s?: string } {
  const short = l.s?.trim() || shortLine(l.t);
  return short && short !== l.t ? { s: short } : {};
}

export function stagePayload(step: Step, places: StepGuidePayload['places']): StagePayload | undefined {
  const qs = step.questStages;
  if (!qs || !qs.stages.length) return undefined;
  const stages: StagePayload['stages'] = [];
  for (const st of [...qs.stages].sort((a, b) => a.at - b.at).slice(0, 40)) {
    let go: number | undefined;
    if (st.go) {
      let p: StepGuidePayload['places'][number] | undefined;
      if (typeof st.go === 'string') {
        const n = npcSpot(st.go, step.id);
        if (n) p = { x: n.x, y: n.y, plane: n.plane, label: `${st.go} — ${n.area}`, npc: st.go };
      } else {
        p = { x: st.go.x, y: st.go.y, plane: st.go.plane, label: st.go.label, ...(st.go.npc ? { npc: st.go.npc } : {}) };
      }
      if (p) {
        let at = places.findIndex((q) => near(q, p!));
        if (at >= 0) {
          if (p.npc && !places[at].npc) places[at] = { ...places[at], npc: p.npc };
        } else if (places.length < 64) {
          places.push(p);
          at = places.length - 1;
        }
        if (at >= 0) go = at;
      }
    }
    stages.push({
      at: st.at, steps: st.do.slice(0, 40).map((l) => ({ t: l.t, ...shortOf(l), ...(l.at ? { x: l.at[0], y: l.at[1], plane: l.at[2] } : {}), ...(l.has ? { has: l.has } : {}), ...(l.need ? { need: l.need } : {}), ...(l.hl ? { hl: l.hl } : {}), ...(l.k ? { k: l.k } : {}) })), ...(go !== undefined ? { go } : {}),
      ...(st.items ? { items: st.items.slice(0, 12).map((i) => ({ ...i })) } : {}),
    });
  }
  return { kind: qs.var[0], id: qs.var[1], stages };
}

/** A bulk list for the exchange hint: name — the English name, count — how many are needed in all. */
export interface ShoppingPlanPayload {
  items: { name: string; id?: number; count: number }[];
}

export function parseEvent(text: string): BridgeEvent | null {
  try {
    const e = JSON.parse(text) as unknown;
    if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string') return e as BridgeEvent;
  } catch {
    // Not JSON — skip.
  }
  return null;
}

/**
 * The step target for the game. An explicit inGame from the route wins; without it — the start point and the gathering places from the step map,
 * so the arrow and tiles work for steps whose highlight is not yet written out.
 * branch — the chosen quick variant: its point replaces the step point, and the waypoints of the ordinary path are not needed.
 */
export function toInGameTarget(step: Step, branch?: StepBranch, extraWatch: string[] = []): ActiveStepPayload | null {
  const g = step.inGame ?? {};
  const start = step.mapLocation;
  const alt = branch?.replacementTarget;
  const worldPoint = alt
    ? { x: alt.x, y: alt.y, plane: alt.plane, label: alt.label }
    : g.worldPoint ?? (start ? { x: start.x, y: start.y, plane: start.plane, label: start.label } : undefined);
  const groundTiles = g.groundTiles ?? step.resourceSpots?.map((p) => ({ x: p.x, y: p.y, plane: p.plane, label: p.label }));
  const payload: ActiveStepPayload = { ...g, stepId: step.id, title: step.title };
  if (worldPoint) payload.worldPoint = worldPoint;
  if (groundTiles?.length) payload.groundTiles = groundTiles;
  if (alt) delete payload.pathWaypoints;
  const goal = alt ? (alt.label.startsWith(branch!.label) ? alt.label : `${branch!.label}: ${alt.label}`) : g.goal ?? worldPoint?.label;
  if (goal) payload.goal = goal;
  const checklist = preflightItems(step).map((i) => ({ name: i.nameEn, id: i.id, count: i.count, heals: i.heals }));
  if (checklist.length) payload.checklist = checklist;
  // Also — the items of the nearest steps (one trip): the plugin reports how many of them there are, and they are visible in advance.
  const watch = [...new Set([...watchedItems(step), ...extraWatch])].slice(0, 40);
  if (watch.length) payload.watchItems = watch;
  if (step.pacing) payload.pacing = step.pacing;
  const hit = stepMaxHit(step);
  if (hit) payload.maxHit = hit;
  if (step.useOn?.length) payload.useOn = step.useOn.slice(0, 8);
  const guide = stepGuide(step, branch);
  payload.guide = guide;
  // A step without a point but with items (a shopping step) goes to the game too: the "What you need" list with "where to get" is useful there.
  const empty = !worldPoint && !groundTiles?.length && !g.npcNames?.length && !g.objectNames?.length
    && !g.dialogChoices?.length && !g.highlightItems?.length && !g.completionTrigger && !checklist.length && !step.pacing
    && !guide.items.length && !guide.places.length;
  return empty ? null : payload;
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
    const o = r as { id?: unknown; name?: unknown; count?: unknown; slot?: unknown } | null;
    const id = int(o?.id, 1);
    if (id === null || typeof o?.name !== 'string') continue;
    const count = int(o.count, 1);
    const slot = typeof o.slot === 'string' && /^[a-z]{2,10}$/.test(o.slot) ? o.slot : undefined;
    out.push({ id, name: o.name, ...(count !== null ? { count } : {}), ...(slot ? { slot } : {}) });
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

// ---------- Transports ----------

interface DesktopBridgeApi {
  request(method: string, path: string, body?: unknown): Promise<BridgeResponse>;
  openEvents(onEvent: (data: string) => void, onState: (state: 'open' | 'closed') => void): () => void;
}

function desktopTransport(api: DesktopBridgeApi): BridgeTransport {
  return {
    request: (method, path, body) => api.request(method, path, body).catch(() => ({ ok: false, status: 0 })),
    openEvents(onEvent, onOpen, onError) {
      let done = false;
      const close = api.openEvents(
        (data) => { const e = parseEvent(data); if (e) onEvent(e); },
        (state) => {
          if (done) return;
          if (state === 'open') onOpen();
          else { done = true; onError(); }
        },
      );
      return () => { done = true; close(); };
    },
  };
}

/** Without the desktop app (a page in a browser during development) there is no bridge: everything works, the plugin "does not respond". */
const offlineTransport: BridgeTransport = {
  request: async () => ({ ok: false, status: 0 }),
  openEvents(_onEvent, _onOpen, onError) {
    const timer = setTimeout(onError, 0);
    return () => clearTimeout(timer);
  },
};

export function defaultTransport(): BridgeTransport {
  const api = (desktop() as unknown as { bridge?: DesktopBridgeApi } | undefined)?.bridge;
  return api ? desktopTransport(api) : offlineTransport;
}

// ---------- Requests ----------

export async function checkStatus(t: BridgeTransport = defaultTransport()): Promise<BridgeStatus> {
  const res = await t.request('GET', '/status');
  const d = res.data as {
    status?: string; inGame?: boolean; stats?: unknown; shortestPath?: unknown; activeStepId?: unknown; protocol?: unknown; pluginVersion?: unknown;
    navTarget?: unknown; xp?: unknown; questsDone?: unknown; player?: unknown; pos?: unknown; homeTeleportSeconds?: unknown;
  } | undefined;
  const online = res.ok && d?.status === 'ok';
  return {
    online,
    inGame: Boolean(online && d?.inGame),
    stats: online ? parseStats(d?.stats) : null,
    shortestPath: Boolean(online && d?.shortestPath === true),
    gear: online ? parseGear(d) : null,
    activeStepId: online && typeof d?.activeStepId === 'string' ? d.activeStepId : null,
    protocol: online && typeof d?.protocol === 'number' && Number.isInteger(d.protocol) && d.protocol > 0 ? d.protocol : null,
    pluginVersion: online && typeof d?.pluginVersion === 'string' && d.pluginVersion.length <= 20 ? d.pluginVersion : null,
    navTarget: online ? parseNavTarget(d?.navTarget) : null,
    xp: online ? parseXp(d?.xp) : null,
    questsDone: online ? parseQuests(d?.questsDone) : null,
    player: online ? parsePlayer(d?.player) : null,
    pos: online ? parsePos(d?.pos) : null,
    homeTeleportSeconds: online ? parseSeconds(d?.homeTeleportSeconds) : null,
  };
}

/** The MOVED event from the plugin: a teleport (a jump of 20+ tiles) or death. Garbage — null. */
export function parseMove(raw: unknown): Omit<MoveEvent, 'at'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'DEATH' && o.kind !== 'TELEPORT') return null;
  const point = (v: unknown): { x: number; y: number; plane: number } | null => {
    if (!v || typeof v !== 'object') return null;
    const p = v as Record<string, unknown>;
    return Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.plane)
      && (p.x as number) > 0 && (p.x as number) < 20000 && (p.y as number) > 0 && (p.y as number) < 20000 && (p.plane as number) >= 0 && (p.plane as number) <= 3
      ? { x: p.x as number, y: p.y as number, plane: p.plane as number }
      : null;
  };
  return { kind: o.kind, from: point(o.from), to: point(o.to) };
}

/**
 * A temporary target from the plugin (NAV_SET, /status): it could have been chosen in the game — in the "What you need" list or in the panel.
 * Only checked fields; anything wrong — null (the app then simply does not mark the target).
 */
export function parseNavTarget(raw: unknown): NavTargetPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
  if (typeof r.label !== 'string' || !r.label || r.label.length > 200 || !int(r.x) || !int(r.y) || !int(r.plane)) return null;
  const out: NavTargetPayload = { label: r.label, x: r.x as number, y: r.y as number, plane: r.plane as number };
  if (Array.isArray(r.npcNames) && r.npcNames.every((n) => typeof n === 'string')) out.npcNames = r.npcNames as string[];
  if (typeof r.itemName === 'string') out.itemName = r.itemName;
  if (int(r.itemId)) out.itemId = r.itemId as number;
  if (typeof r.stepId === 'string') out.stepId = r.stepId;
  return out;
}

/** Send a step to the game. false — there is no bridge or the step has nothing to show. */
export async function syncActiveStep(step: Step, t: BridgeTransport = defaultTransport(), branch?: StepBranch, extraWatch: string[] = []): Promise<boolean> {
  const payload = toInGameTarget(step, branch, extraWatch);
  if (!payload) return false;
  return (await t.request('POST', '/active-step', payload)).ok;
}

/** The snapshot result: which parts the plugin did not accept (unfit or turned off in its settings) and whether the snapshot was late. */
export interface SnapshotResult {
  ok: boolean;
  stale: boolean;
  rejected: Record<string, string>;
}

/**
 * The state snapshot into the game (protocol 6): step, shopping, bank highlight, gear advice and plan — in one request.
 * ok false — there is no bridge or the plugin answered with an error (an old plugin does not know the address: 404).
 */
export async function postPrepPlan(envelope: PrepEnvelope, t: BridgeTransport = defaultTransport()): Promise<SnapshotResult & { status: number }> {
  const res = await t.request('POST', '/prep-plan', envelope);
  const d = (res.data ?? {}) as { stale?: unknown; rejected?: unknown };
  const rejected: Record<string, string> = {};
  if (d.rejected && typeof d.rejected === 'object') {
    for (const [k, v] of Object.entries(d.rejected as Record<string, unknown>)) if (typeof v === 'string') rejected[k] = v;
  }
  return { ok: res.ok, stale: d.stale === true, rejected, status: res.status };
}

/** The summary of the plugin's debug journal (since 2.23.0; an old plugin answers 404 — null). */
export async function getTelemetry(t: BridgeTransport = defaultTransport()): Promise<BridgeTelemetry | null> {
  const res = await t.request('GET', '/telemetry');
  return res.ok ? summarizeBridge(res.data) : null;
}

/** A bulk list for the exchange hint. An empty list removes the hint. */
export async function syncShoppingPlan(plan: ShoppingPlanPayload, t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/shopping-plan', plan)).ok;
}

export async function clearActiveStep(t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/clear')).ok;
}

/**
 * A temporary target into the game: the arrow, the Shortest Path route and the HUD lead to the place, the step returns by itself
 * when the player arrived or got the item. Coordinates only from place search, not "by eye".
 */
export async function setNavTarget(target: NavTargetPayload, t: BridgeTransport = defaultTransport()): Promise<NavResult> {
  const res = await t.request('POST', '/nav-target', target);
  if (res.ok) return { ok: true };
  if (res.status === 0) return { ok: false, reason: 'offline' };
  const message = (res.data as { error?: unknown } | undefined)?.error;
  return {
    ok: false,
    reason: 'refused',
    message: typeof message === 'string' ? message
      : res.status === 404 ? 'the OSRS Path Bridge plugin is an old version — update it' : `the plugin answered ${res.status}`,
  };
}

export async function clearNavTarget(t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/nav-target', { clear: true })).ok;
}

/** The stage items — for a soft highlight in the bank. An empty list removes the highlight. */
export async function syncBankTags(stageId: string, itemIds: number[], t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/bank-tags', { stageId, itemIds })).ok;
}

/** Gear advice for the plugin: the HUD line, which items to report the bank count for, what to highlight. */
export interface GearHintPayload {
  text?: string;
  watchItems: string[];
  highlightItems: string[];
}

/**
 * Gear advice into the game (POST /gear-hint). 'old' — an old plugin version (404): it does not know the advice,
 * this is not an error; 'off' — the upgrade hints are turned off in the plugin settings (409).
 */
export async function setGearHint(hint: GearHintPayload | null, t: BridgeTransport = defaultTransport()): Promise<'ok' | 'offline' | 'old' | 'off'> {
  const res = await t.request('POST', '/gear-hint', hint ?? { clear: true });
  if (res.ok) return 'ok';
  if (res.status === 0) return 'offline';
  return res.status === 404 ? 'old' : 'off';
}

// ---------- An event stream with reconnection ----------

/** Pauses between attempts: 1, 2, 4, 8, 16, 30, 30… seconds. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export interface EventsHandle {
  close(): void;
}

/**
 * Keeps the /events stream open: if it breaks — a pause and a new attempt, the pause grows up to 30 seconds.
 * onState reports whether there is a connection; close() stops everything, including scheduled attempts.
 */
export function connectEvents(
  onEvent: (e: BridgeEvent) => void,
  onState: (online: boolean) => void,
  t: BridgeTransport = defaultTransport(),
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancel: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
): EventsHandle {
  let attempt = 0;
  let closed = false;
  let timer: unknown;
  let closeStream: (() => void) | null = null;

  // The number of the current stream: signals from earlier (already abandoned) streams do not count.
  let generation = 0;
  const open = () => {
    if (closed) return;
    const mine = ++generation;
    const current = () => !closed && mine === generation;
    closeStream = t.openEvents(
      (e) => { if (current()) onEvent(e); },
      () => { if (!current()) return; attempt = 0; onState(true); },
      () => {
        if (!current()) return;
        generation++;
        closeStream = null;
        onState(false);
        timer = schedule(open, backoffMs(attempt++));
      },
    );
  };
  open();
  return {
    close() {
      closed = true;
      cancel(timer);
      closeStream?.();
      closeStream = null;
    },
  };
}

// ---------- Auto-completion ----------

export interface AutoCompletePlan {
  /** Mark a step as done. */
  mark: boolean;
  /** The next unclosed step — the pages open it. */
  next?: Step;
  /** What to send to the game after the mark: the next step, clear, or touch nothing. */
  inGame: 'sync-next' | 'clear' | 'keep';
}

/**
 * What to do with the STEP_AUTO_COMPLETED event. handled — the events already processed: a repeat changes nothing.
 * The next step goes to the game only if the game was showing exactly the completed one — we do not override someone else's.
 */
export function planAutoComplete(steps: Step[], p: Progress, stepId: string, activeStepId: string | null, handled: ReadonlySet<string>): AutoCompletePlan {
  const idle: AutoCompletePlan = { mark: false, inGame: 'keep' };
  if (handled.has(stepId)) return idle;
  const step = steps.find((s) => s.id === stepId);
  if (!step || isClosed(p, stepId)) return idle;
  const next = openAfter(steps, p, stepId);
  if (activeStepId !== stepId) return { mark: true, next, inGame: 'keep' };
  return { mark: true, next, inGame: next && toInGameTarget(next) ? 'sync-next' : 'clear' };
}
