// The link to the RuneLite plugin "OSRS Path Bridge" on this computer: http://127.0.0.1:38282.
// Requests go through the Electron main process (preload → ipc): the plugin accepts only them, and a request
// from a page in a browser (with an Origin header) is rejected. There is no remote server: the bridge listens on loopback only.

import type { MoveEvent } from '../domain/travel/recovery';
import type { PrepEnvelope } from '../domain/prep/prepEnvelope';
import type { InGameTarget, PacingSkill, StageHighlight, StagePre, PlayerStats, Step, StepBranch, StepPacing } from '../types';
import { desktop } from './desktop';
import { parseQuestObservation } from '../domain/player/questObservation';
import type { QuestObservation } from '../domain/player/questObservation';
export type { QuestObservation };
import { parseQuestInstruction } from '../domain/quests/questCursor';
import type { QuestInstruction } from '../domain/quests/questCursor';
export { parseQuestInstruction };
export type { QuestInstruction };
import { toInGameTarget } from '../domain/guide/inGameTarget';
import { parseEvent, parseStats, parseXp, parseQuests, parsePos, parseSeconds, parsePlayer, parseGear } from './bridgeEvents';

export const BRIDGE_ORIGIN = 'http://127.0.0.1:38282';

export interface BridgeStatus {
  /** Canonical quest cursor, separate from navigation; absent in older protocol-6 plugins. */
  questInstruction: QuestInstruction | null;
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
  /** Optional full state; an unlisted quest is not necessarily unstarted. */
  questStates?: QuestObservation | null;
  /** The character name (protocol 5); null — not in the game or the plugin does not report. */
  player: string | null;
  /** Where the character stands (protocol 5): game coordinates; null — unknown. */
  pos: { x: number; y: number; plane: number } | null;
  /** Seconds until the Home Teleport can be cast again (plugin 2.37+); null — it is ready, or the plugin does not know. */
  homeTeleportSeconds: number | null;
  /** The plugin read the Home Teleport state (plugin 2.52+): true — ready or the seconds above; false — the game's value is not a time; null — an older plugin. */
  homeTeleportKnown: boolean | null;
  /** The active spellbook (plugin 2.52+): 0 standard, 1 Ancient, 2 Lunar, 3 Arceuus; null — not in the game or an older plugin. */
  spellbook: number | null;
  /** The Chronicle's charges as the game last told them (plugin 2.53+); null — unknown, never zero. */
  chronicleCharges: number | null;
  /** The quest points and the total level as the game holds them (plugin 2.54+); null — unknown, never zero. */
  questPoints: number | null;
  totalLevel: number | null;
  /** The account kind from the game (plugin 2.59+); null — unknown or an older plugin. */
  accountType?: 'normal' | 'ironman' | null;
  /** The fights recorded on the combat training step (plugin 2.57+); null — none recorded or an older plugin. */
  combatLog: CombatLogState | null;
}

/** Recent clean kills per opponent version on a combat training step: the seconds between them and the damage taken (plugin CombatLog). */
export interface CombatLogState {
  stepId: string;
  foes: { name: string; combat: number; kills: number; seconds: number; damage: number }[];
}

export function parseCombatLog(v: unknown): CombatLogState | null {
  const o = v as { stepId?: unknown; foes?: unknown } | null;
  if (!o || typeof o.stepId !== 'string' || !Array.isArray(o.foes)) return null;
  const n = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : null);
  const foes = o.foes.flatMap((f) => {
    const e = f as Record<string, unknown>;
    const name = typeof e?.name === 'string' && e.name.length <= 60 ? e.name : null;
    const combat = n(e?.combat, 2000);
    const kills = n(e?.kills, 1000);
    const seconds = n(e?.seconds, 1e6);
    const damage = n(e?.damage, 1e6);
    return name && combat !== null && kills !== null && seconds !== null && damage !== null ? [{ name, combat, kills, seconds, damage }] : [];
  });
  return foes.length ? { stepId: o.stepId, foes } : null;
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
  /** A banknote (plugin 2.59+); absent means the item itself. */
  noted?: boolean;
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
  /** Verified scenery at the temporary destination; supported by the existing plugin protocol. */
  objectNames?: string[];
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
  | { type: 'QUESTS'; done?: string[] | null; questStates?: QuestObservation | null }
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
  equip?: boolean;
  name: string;
  id?: number;
  count: number;
  heals?: number;
  alt?: string[];
  /** A potion: the doses `count` potions hold; the game counts every size toward them (Checklist.java). Absent for anything else. */
  doses?: number;
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
  items: { name: string; id?: number; count?: number; where?: string; inStep?: boolean; alt?: string[]; doses?: number }[];
  places: { x: number; y: number; plane: number; label: string; npc?: string; items?: string[] }[];
  /** The step's quick path in order: when everything is collected, the game shows the last item ("Give everything to Hetty…"). */
  steps?: string[];
  /** Quest stages: the plugin reads the quest variable and shows only the current stage. */
  stage?: StagePayload;
  /** The selected combat plan's phase in hand and the one after it, short: the in-game guide leads with them (HUD 2.74.0). */
  plan?: { now?: string; next?: string };
}

export interface StagePayload {
  /** The banks of the surface, for the plugin to turn the arrow to the nearest one when a missing item is in the bank. */
  banks?: { x: number; y: number; plane: number; label: string }[];
  kind: 'varp' | 'varbit';
  id: number;
  stages: { at: number; steps: { t: string; s?: string; x?: number; y?: number; plane?: number; has?: string; need?: string; hl?: StageHighlight; k?: string; pre?: StagePre[]; mh?: number }[]; /** The index of the point in places. */ go?: number; /** The guide's item shape: the plugin reads both lists as GuideItem. */ items?: StepGuidePayload['items'] }[];
}

/** A bulk list for the exchange hint: name — the English name, count — how many are needed in all. */
export interface ShoppingPlanPayload {
  /** doses: a potion, counted in doses of every size (ShoppingPlan.java); count stays potions for an older plugin. */
  items: { name: string; id?: number; count: number; doses?: number }[];
  /** Counted and reported back, not listed at the exchange: every Shopping row, so what is counted does not depend on the count. */
  watch?: string[];
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
    navTarget?: unknown; questInstruction?: unknown; xp?: unknown; questsDone?: unknown; questStates?: unknown; player?: unknown; pos?: unknown; homeTeleportSeconds?: unknown;
    homeTeleportKnown?: unknown; spellbook?: unknown; chronicleCharges?: unknown; questPoints?: unknown; totalLevel?: unknown;
    combatLog?: unknown; accountType?: unknown;
  } | undefined;
  const online = res.ok && d?.status === 'ok';
  const inGame = online && d?.inGame === true;
  const instruction = online && d?.inGame === true ? parseQuestInstruction(d.questInstruction) : null;
  return {
    questInstruction: instruction?.stepId === d?.activeStepId ? instruction : null,
    online,
    inGame,
    stats: inGame ? parseStats(d?.stats) : null,
    shortestPath: Boolean(online && d?.shortestPath === true),
    gear: inGame ? parseGear(d) : null,
    activeStepId: online && typeof d?.activeStepId === 'string' ? d.activeStepId : null,
    protocol: online && typeof d?.protocol === 'number' && Number.isInteger(d.protocol) && d.protocol > 0 ? d.protocol : null,
    pluginVersion: online && typeof d?.pluginVersion === 'string' && d.pluginVersion.length <= 20 ? d.pluginVersion : null,
    navTarget: online ? parseNavTarget(d?.navTarget) : null,
    xp: inGame ? parseXp(d?.xp) : null,
    questsDone: inGame ? parseQuests(d?.questsDone) : null,
    questStates: inGame ? parseQuestObservation(d?.questStates) : null,
    player: inGame ? parsePlayer(d?.player) : null,
    pos: inGame ? parsePos(d?.pos) : null,
    homeTeleportSeconds: inGame ? parseSeconds(d?.homeTeleportSeconds) : null,
    homeTeleportKnown: inGame && typeof d?.homeTeleportKnown === 'boolean' ? d.homeTeleportKnown : null,
    spellbook: inGame && typeof d?.spellbook === 'number' && Number.isInteger(d.spellbook) && d.spellbook >= 0 && d.spellbook <= 3 ? d.spellbook : null,
    chronicleCharges: inGame && typeof d?.chronicleCharges === 'number' && Number.isInteger(d.chronicleCharges) && d.chronicleCharges >= 0 && d.chronicleCharges <= 1000
      ? d.chronicleCharges : null,
    questPoints: inGame && typeof d?.questPoints === 'number' && Number.isInteger(d.questPoints) && d.questPoints >= 0 && d.questPoints <= 500 ? d.questPoints : null,
    totalLevel: inGame && typeof d?.totalLevel === 'number' && Number.isInteger(d.totalLevel) && d.totalLevel >= 0 && d.totalLevel <= 2277 ? d.totalLevel : null,
    combatLog: inGame ? parseCombatLog(d?.combatLog) : null,
    accountType: inGame && (d?.accountType === 'normal' || d?.accountType === 'ironman') ? d.accountType : null,
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
  if (Array.isArray(r.objectNames) && r.objectNames.length <= 8 && r.objectNames.every(n => typeof n === 'string' && n.length > 0 && n.length <= 200)) out.objectNames = r.objectNames as string[];
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
 * ok reports a valid transport reply. Use snapshotAccepted for the parts a caller requires; optional helpers may be disabled independently.
 */
export async function postPrepPlan(envelope: PrepEnvelope, t: BridgeTransport = defaultTransport()): Promise<SnapshotResult & { status: number }> {
  const res = await t.request('POST', '/prep-plan', envelope);
  if (res.data === null || typeof res.data !== 'object' || Array.isArray(res.data)) return { ok: false, stale: false, rejected: {}, status: res.status };
  const d = (res.data ?? {}) as { stale?: unknown; rejected?: unknown };
  const rejected: Record<string, string> = {};
  if (d.rejected && typeof d.rejected === 'object') {
    for (const [k, v] of Object.entries(d.rejected as Record<string, unknown>)) if (typeof v === 'string') rejected[k] = v;
  }
  const malformedRejection = d.rejected != null && (typeof d.rejected !== 'object' || Array.isArray(d.rejected) || Object.values(d.rejected).some(v => typeof v !== 'string'));
  const malformed = d.stale !== undefined && typeof d.stale !== 'boolean';
  return { ok: res.ok && !malformed && !malformedRejection, stale: d.stale === true, rejected, status: res.status };
}

/** A valid HTTP reply is not application acceptance. A disabled unrelated helper must not block an accepted target. */
export function snapshotAccepted(result: SnapshotResult, required?: readonly string[]): boolean {
  return result.ok && !result.stale && Object.keys(result.rejected).every(part => required !== undefined && !required.includes(part));
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
