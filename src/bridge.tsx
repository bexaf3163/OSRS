// The RuneLite link state: whether it is on, whether the plugin is there, which step is shown in the game.
// The auto-mark from the game comes here: the step is marked, the next one goes to the game, the pages open it on their own.
// Also from here: the skill levels (quick variants), the item count (departure check) and the bulk list for the exchange,
// the temporary target "🧭 to a place / to a shop", the stage items for the bank, the gear and the training pace from the game.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerStats, Step, StepBranch } from './types';
import { levelById } from './data';
import { XpTracker } from './lib/xpRate';
import type { SessionBase } from './lib/session';
import { gateAllows, linkPlayer, profileGate, readProfiles, useProfiles, writeProfiles, type ProfileGate } from './lib/profiles';
import { useStore } from './store';
import { desktop, type RuneliteLaunch } from './lib/desktop';
import {
  checkStatus, clearActiveStep, clearNavTarget, connectEvents, getTelemetry, parseGear, parseNavTarget, parseMove, parsePacing, parsePlayer, parseQuests, parseStats, parseXp, planAutoComplete, setNavTarget,
  postPrepPlan, supportsSnapshot, syncActiveStep, syncBankTags, syncShoppingPlan, toInGameTarget,
  pluginCompat, type BridgeEvent, type GearState, type NavResult, type NavTargetPayload, type PacingState, type PluginCompat, type ShoppingPlanPayload,
} from './services/runeliteBridge';
import { parseOwned, preflightItems, type OwnedState } from './lib/checklist';
import { tripWindow } from './lib/oneTrip';
import type { MoveEvent } from './lib/recovery';
import { stageBankItemIds } from './lib/bankTags';
import { useFeatures } from './lib/features';
import { isClosed, openAfter } from './lib/next-step';
import { withKillEstimate } from './services/gearAdvisor';
import { buildEnvelope, EMPTY_PARTS, envelopeKey, nextSeq, type SnapshotParts } from './lib/prepEnvelope';

const ENABLED_KEY = 'osrs-put:runelite-bridge';
const AUTOLAUNCH_KEY = 'osrs-put:runelite-autolaunch';
/** The chosen quick variants: { 'S2-05': 'varrock-teleport' }. */
const BRANCH_KEY = 'osrs-put:branch-choice';
/** The last bulk list — goes to the game again when RuneLite was restarted. */
const PLAN_KEY = 'osrs-put:shopping-plan';
const MOVES_KEY = 'osrs-put:moves';
const GEAR_KEY = 'osrs-put:last-gear';
/** The step shown in the game: after a restart of the app or RuneLite it returns to the game by itself. */
const ACTIVE_KEY = 'osrs-put:active-step';
/** Auto-launch — once per app launch (in development StrictMode runs the effects twice). */
let autoLaunchDone = false;

/** off — the link is turned off in settings; connecting — the first attempt; offline — no plugin; online — there. */
export type BridgeState = 'off' | 'connecting' | 'offline' | 'online';
export type PointResult = 'ok' | 'offline' | 'empty';

export interface AutoAdvance {
  from: string;
  to?: string;
  nonce: number;
}

interface BridgeValue {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  state: BridgeState;
  inGame: boolean;
  /** The step currently shown in the game. */
  activeStepId: string | null;
  pointInGame: (step: Step) => Promise<PointResult>;
  clear: () => Promise<void>;
  /** The last auto-mark from the game — the "Path" pages open the next step. */
  advance: AutoAdvance | null;
  /** The desktop app can start RuneLite with the plugin by itself. */
  canLaunch: boolean;
  launchRuneLite: () => Promise<RuneliteLaunch | null>;
  /** Start RuneLite together with the app. */
  autoLaunch: boolean;
  setAutoLaunch: (on: boolean) => void;
  /** Levels from the game; null — no link or the sending is turned off in the plugin. */
  stats: PlayerStats | null;
  /** How many of the step's and the shopping list's items there are (bag, banknotes, bank). */
  owned: OwnedState | null;
  /** Shortest Path is installed in the game — it draws the path over land. */
  shortestPath: boolean;
  /** The chosen quick variant of the step (id) — the step goes to the game with it. */
  branchChoice: Record<string, string>;
  chooseBranch: (step: Step, branchId: string | null) => void;
  /** The bulk list — into the exchange hint (and remember until the next RuneLite launch). */
  syncPlan: (plan: ShoppingPlanPayload) => Promise<boolean>;
  /** Gear, bag and coins from the game; null — unknown. */
  gear: GearState | null;
  /** The last known gear, bag and coins — recorded while the game was running; shown when RuneLite is closed. Not "now". */
  lastGear: LastGear | null;
  /** The training pace of the step shown in the game. */
  pacing: PacingState | null;
  /** The temporary target in the game (a place or a shop); null — the arrow leads to the step. */
  navTarget: NavTargetPayload | null;
  /** Set a temporary target. Without a link or on a refusal by the plugin — an answer with the reason. */
  navigate: (target: NavTargetPayload) => Promise<NavResult | { ok: false; reason: 'off' }>;
  clearNav: () => Promise<void>;
  /** When the player cleared the arrow target themselves (ms); 0 — never. Auto preparation does not take over the arrow after that. */
  userClearedAt: number;
  /** The plugin version and compatibility with the app; null — no link. */
  plugin: { protocol: number | null; version: string | null; compat: PluginCompat } | null;
  /** XP by skill from the game (protocol 5); null — no link, an old plugin or the sending is turned off. */
  xp: PlayerStats | null;
  /** Names of completed quests (protocol 5); null — unknown. */
  questsDone: string[] | null;
  /** The character name from the game (protocol 5). */
  player: string | null;
  /**
   * A part of the snapshot for the game (protocol 6): gear advice, items for the bank, the preparation plan. It goes to the plugin together
   * with everything else in one request; for a plugin older than protocol 6 the call does nothing — it has its own separate requests.
   */
  setPrepPart: <K extends 'gearHint' | 'bankTags' | 'plan'>(key: K, value: SnapshotParts[K]) => void;
  /** Which profile and character are current: whether levels and marks from the game may be written into the profile. */
  gate: ProfileGate;
  /** XP per hour by skill from this session's measurements; null — too few measurements. */
  xpRate: (skill: string) => number | null;
  /** The session: when it began and with what (the first levels and XP, closed steps) — for the summary. */
  session: SessionBase;
  /** The text for an error report: versions, the link, the last bridge events. */
  diagnostics: () => Promise<string>;
  /** Recent character jumps (death, teleport) — they turn on the recovery mode. */
  moves: MoveEvent[];
  /** Where the character is now: a fresh request to the plugin (protocol 5); null — no link, not in the game or the plugin does not report. */
  locate: () => Promise<{ x: number; y: number; plane: number } | null>;
}

const BridgeContext = createContext<BridgeValue | null>(null);

/** By default the link is on; without the desktop app (a page in development) it is off, there is no bridge. */
function loadEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    // Storage is unavailable — the default value.
  }
  return Boolean(desktop()?.bridge);
}

/** An object only: `null`, an array, a string in the storage — as if nothing had been saved. */
function loadJson<T extends object>(key: string, fallback: T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  } catch {
    // No storage or garbage — the default.
  }
  return fallback;
}

/** A gear snapshot for showing without a link: whose, when recorded and what there was then. */
export interface LastGear {
  at: number;
  player: string;
  gear: GearState;
}

/** Read with distrust: the storage is edited by hand and by other versions. Garbage — as if nothing had been written. */
export function parseLastGear(raw: unknown): LastGear | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const gear = parseGear(o.gear);
  if (!gear || typeof o.at !== 'number' || !Number.isFinite(o.at) || o.at <= 0 || typeof o.player !== 'string' || !o.player || o.player.length > 40) return null;
  return { at: o.at, player: o.player, gear };
}

function loadLastGear(): LastGear | null {
  return parseLastGear(loadJson<Record<string, unknown>>(GEAR_KEY, null));
}

/** The choice of branch by steps: we take only "step → string" pairs. */
function loadBranchChoice(): Record<string, string> {
  const data = loadJson<Record<string, unknown>>(BRANCH_KEY, {}) ?? {};
  return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* it is remembered until a restart */ }
}

/** One line about a bridge event for the report: without the contents of the bag and bank. */
function logEvent(log: { t: number; text: string }[], e: BridgeEvent): void {
  const d = e as Record<string, unknown>;
  const n = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : v === null ? 0 : '?');
  let text: string = e.type;
  if (e.type === 'STEP_AUTO_COMPLETED') text += ` ${String(d.stepId)}`;
  else if (e.type === 'STATUS') text += ` inGame=${String(d.inGame)}${d.player ? ' player=yes' : ''}`;
  else if (e.type === 'STATS' || e.type === 'XP') text += ` skills=${n(d.stats ?? d.xp)}`;
  else if (e.type === 'QUESTS') text += ` quests=${n(d.done)}`;
  else if (e.type === 'OWNED') text += ` items=${n(d.items)} bank=${String(d.bankSeen)}`;
  else if (e.type === 'PACING') text += ` ${String(d.stepId ?? '')}`;
  log.push({ t: Date.now(), text });
  if (log.length > 200) log.splice(0, log.length - 200);
}

/** The chosen quick variant of the step, if the step still has it. */
function chosenBranch(step: Step, choice: Record<string, string>): StepBranch | undefined {
  const id = choice[step.id];
  return id ? step.branches?.find((b) => b.id === id) : undefined;
}

function loadActiveStep(): string | null {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v && v.length <= 16 ? v : null;
  } catch {
    return null;
  }
}

function loadAutoLaunch(): boolean {
  try {
    return localStorage.getItem(AUTOLAUNCH_KEY) !== '0';
  } catch {
    return true;
  }
}

const LAUNCH_TEXT: Partial<Record<RuneliteLaunch['state'], string>> = {
  started: '🎮 Starting RuneLite with the OSRS Path Bridge…',
  starting: 'RuneLite is already starting…',
  running: 'RuneLite with the bridge is already running',
};

export function BridgeProvider({ children }: { children: ReactNode }) {
  const { progress, steps, setStep, setLevels, notify, mode } = useStore();
  const [enabled, setEnabledState] = useState(loadEnabled);
  const [autoLaunch, setAutoLaunchState] = useState(loadAutoLaunch);
  const runelite = desktop()?.runelite;
  const [state, setState] = useState<BridgeState>(enabled ? 'connecting' : 'off');
  const [inGame, setInGame] = useState(false);
  // A step shown in the game survives an app restart if it is not done yet.
  const [activeStepId, setActiveStepId] = useState<string | null>(() => {
    const id = loadActiveStep();
    return id && steps.some((s) => s.id === id) && !isClosed(progress, id) ? id : null;
  });
  const [advance, setAdvance] = useState<AutoAdvance | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [owned, setOwned] = useState<OwnedState | null>(null);
  const [shortestPath, setShortestPath] = useState(false);
  const [branchChoice, setBranchChoice] = useState<Record<string, string>>(loadBranchChoice);
  const [gear, setGear] = useState<GearState | null>(null);
  const [lastGear, setLastGear] = useState<LastGear | null>(loadLastGear);
  const [pacing, setPacing] = useState<PacingState | null>(null);
  const [xp, setXp] = useState<PlayerStats | null>(null);
  const [questsDone, setQuestsDone] = useState<string[] | null>(null);
  // Character jumps (death, teleport): kept for a short time — after an app restart the recovery mode is not lost.
  const [moves, setMoves] = useState<MoveEvent[]>(() => (loadJson<{ list: MoveEvent[] }>(MOVES_KEY, null)?.list ?? []).filter((m) => m && typeof m.at === 'number' && Date.now() - m.at < 3_600_000).slice(-8));
  const [player, setPlayer] = useState<string | null>(null);
  // The bag, the worn items and the coins are remembered while the game is running: if RuneLite or the app is closed, the last known stays.
  useEffect(() => {
    if (!gear || !player) return undefined;
    const t = setTimeout(() => {
      const saved: LastGear = { at: Date.now(), player, gear };
      saveJson(GEAR_KEY, saved);
      setLastGear(saved);
    }, 2000);
    return () => clearTimeout(t);
  }, [gear, player]);
  const [session, setSession] = useState<SessionBase>(() => ({
    startedAt: Date.now(), levels0: null, xp0: null,
    closed0: Object.entries(progress.steps).filter(([, v]) => v === 'done' || v === 'skipped').map(([k]) => k),
  }));
  const tracker = useRef(new XpTracker());
  /** The latest bridge events — for the "Diagnostics" button. */
  const eventLog = useRef<{ t: number; text: string }[]>([]);
  const profiles = useProfiles();
  const gate = useMemo(() => profileGate(profiles, player), [profiles, player]);
  const [navTarget, setNavTargetState] = useState<NavTargetPayload | null>(null);
  const [plugin, setPlugin] = useState<BridgeValue['plugin']>(null);
  const features = useFeatures();
  /** Which stage items are already in the plugin — so as not to send the same on every render. */
  const bankSent = useRef('');
  /**
   * The arrow target is known to the plugin (since 2.11 it reports it: NAV_SET, NAV_DONE, /status). The number grows with every event about the
   * target — a /status reply sent before the event cannot overwrite it any more.
   */
  const navSeq = useRef(0);
  /** The protocol of the plugin on the link — since 4 the app does not set the target itself, but waits for NAV_SET. */
  const pluginProtocol = useRef<number | null>(null);
  /**
   * The state snapshot for the game (protocol 6): everything the app wants to see in the game — in one message. parts — what
   * should be there now; sentKey — what the plugin has already received (the same is not sent); synced — the snapshot may be sent: the step in parts
   * matches what the app shows (otherwise an empty step would clear in the plugin a step the app does not know about yet).
   */
  const snapshot = useRef({ parts: { ...EMPTY_PARTS } as SnapshotParts, seq: 0, sentKey: null as string | null, synced: false, timer: null as ReturnType<typeof setTimeout> | null });
  const setNavFromPlugin = useCallback((t: NavTargetPayload | null) => {
    navSeq.current++;
    setNavTargetState(t);
  }, []);

  // The event handler outlives a render — it takes fresh data from refs.
  const latest = useRef({ progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear, gate });
  latest.current = { progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear, gate };
  /** Already handled auto-marks: one event does not mark a step twice and does not move the route twice. */
  const handled = useRef(new Set<string>());
  const nonce = useRef(0);

  /** Send the snapshot now. true — the plugin received it (or already had the same). */
  const flushSnapshot = useCallback(async (): Promise<boolean> => {
    const sn = snapshot.current;
    if (sn.timer) { clearTimeout(sn.timer); sn.timer = null; }
    const key = envelopeKey(sn.parts);
    if (key === sn.sentKey) return true;
    const seq = nextSeq(sn.seq);
    sn.seq = seq;
    const r = await postPrepPlan(buildEnvelope(sn.parts, seq));
    if (!r.ok) { if (sn.seq === seq) sn.sentKey = null; return false; }
    // The answer of a late snapshot must not overwrite what was sent after it.
    if (sn.seq === seq) sn.sentKey = key;
    return true;
  }, []);

  const setPrepPart = useCallback(<K extends 'gearHint' | 'bankTags' | 'plan'>(key: K, value: SnapshotParts[K]) => {
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, [key]: value };
    if (!supportsSnapshot(pluginProtocol.current) || !sn.synced) return;
    // The bag and levels change through an event queue — we send when everything has settled.
    if (sn.timer) clearTimeout(sn.timer);
    sn.timer = setTimeout(() => { sn.timer = null; void flushSnapshot(); }, 350);
  }, [flushSnapshot]);

  /** A step into the game. For a combat step — with a first time estimate per opponent by the current weapon and levels. */
  const sendStep = useCallback(async (step: Step, branch?: StepBranch): Promise<boolean> => {
    const { progress: p, stats: live, gear: g, steps: list } = latest.current;
    // The items of the current and the nearest steps — the plugin counts them in advance: "one trip" knows what is already there.
    const ahead = tripWindow(list, p, step.id).slice(1).flatMap((s) => preflightItems(s).map((i) => i.nameEn));
    const target = withKillEstimate(step, { ...p.levels, ...(live ?? {}) }, g);
    if (!supportsSnapshot(pluginProtocol.current)) return syncActiveStep(target, undefined, branch, ahead);
    const payload = toInGameTarget(target, branch, ahead);
    if (!payload) return false;
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, step: payload };
    sn.synced = true;
    return flushSnapshot();
  }, [flushSnapshot]);

  /** Remove the step in the game: with a snapshot — as part of it, otherwise — by a separate request. */
  const clearStep = useCallback(async (): Promise<void> => {
    if (!supportsSnapshot(pluginProtocol.current)) { await clearActiveStep(); return; }
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, step: null, plan: null };
    sn.synced = true;
    await flushSnapshot();
  }, [flushSnapshot]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* it is remembered until a restart */ }
  }, []);

  const onCompleted = useCallback((id: string) => {
    const { progress: p, steps: list, setStep: mark, activeStepId: active } = latest.current;
    // The game has a different character than this profile — its quests and levels are not written here.
    if (!gateAllows(latest.current.gate)) return;
    const plan = planAutoComplete(list, p, id, active, handled.current);
    handled.current.add(id);
    if (!plan.mark) return;
    const next = plan.next;
    mark(id, 'done', `🎮 RuneLite: ${id} done in the game${next ? ` — next ${next.id}` : ''}`);
    setAdvance({ from: id, to: next?.id, nonce: ++nonce.current });
    if (plan.inGame === 'sync-next' && next) {
      handled.current.delete(next.id);
      void sendStep(next, chosenBranch(next, latest.current.branchChoice)).then((ok) => setActiveStepId(ok ? next.id : null));
    } else if (plan.inGame === 'clear') {
      void clearStep();
      setActiveStepId(null);
    }
  }, [sendStep, clearStep]);

  /** The temporary target was cleared in the game: the player reached the place, got the item or it was cleared. The step leads the arrow again. */
  const onNavDone = useCallback((e: BridgeEvent) => {
    const { reason, label, itemName } = e as { reason?: unknown; label?: unknown; itemName?: unknown };
    setNavFromPlugin(null);
    const say = latest.current.notify;
    if (reason === 'obtained') say(`✓ ${typeof itemName === 'string' ? itemName : 'The item'} obtained — the arrow leads to the step again`);
    else if (reason === 'arrived') say(`📍 You are there${typeof label === 'string' ? `: ${label}` : ''} — the arrow leads to the step again`);
    // The step anew — the HUD and the target in the game are exactly the same as before the detour.
    const { activeStepId: active, steps: list, branchChoice: choice } = latest.current;
    const step = active ? list.find((s) => s.id === active) : undefined;
    if (step && reason !== 'cleared') void sendStep(step, chosenBranch(step, choice));
  }, [sendStep, setNavFromPlugin]);

  useEffect(() => {
    try {
      if (activeStepId) localStorage.setItem(ACTIVE_KEY, activeStepId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Storage is unavailable — the step simply will not return after a restart.
    }
  }, [activeStepId]);

  useEffect(() => {
    const forget = () => {
      setInGame(false);
      setStats(null);
      setOwned(null);
      setShortestPath(false);
      setGear(null);
      setPacing(null);
      setXp(null);
      setQuestsDone(null);
      setPlayer(null);
      tracker.current.reset();
      setPlugin(null);
      // RuneLite was closed — there is no temporary target there any more.
      setNavFromPlugin(null);
      pluginProtocol.current = null;
      bankSent.current = '';
      // RuneLite was closed — there is nothing in the new plugin: the snapshot goes again when the app connects again.
      snapshot.current.sentKey = null;
      snapshot.current.synced = false;
      if (snapshot.current.timer) { clearTimeout(snapshot.current.timer); snapshot.current.timer = null; }
    };
    if (!enabled) {
      setState('off');
      forget();
      return;
    }
    setState('connecting');
    let alive = true;
    const refresh = (resync = false) => {
      const seq = navSeq.current;
      void checkStatus().then((s) => onStatus(s, resync, seq));
    };
    const onStatus = (s: Awaited<ReturnType<typeof checkStatus>>, resync: boolean, seq: number) => {
      if (!alive) return;
      setState(s.online ? 'online' : 'offline');
      setInGame(s.inGame);
      setShortestPath(s.shortestPath);
      setPlugin(s.online ? { protocol: s.protocol, version: s.pluginVersion, compat: pluginCompat(s.protocol) } : null);
      pluginProtocol.current = s.online ? s.protocol : null;
      // The arrow target — whichever is in the game now (it could have been chosen in the game or before the app restart). An old plugin
      // (before 2.11) does not report the target — then we keep the one the app knows. If an event about the target came while waiting
      // for the reply — it is newer than the reply.
      if (s.online && s.protocol !== null && s.protocol >= 4 && seq === navSeq.current) setNavTargetState(s.navTarget);
      if (s.stats) setStats(s.stats);
      if (s.xp) { setXp(s.xp); tracker.current.push(s.xp, Date.now()); }
      if (s.questsDone) setQuestsDone(s.questsDone);
      setPlayer(s.player);
      setGear(s.gear);
      // RuneLite was restarted (or the app) — the plugin does not know the step: we send it again. We do not
      // send the same step twice, so as not to reset the waypoints and the pace measurement in the plugin.
      const want = latest.current.activeStepId;
      if (s.online && supportsSnapshot(s.protocol)) {
        // Protocol 6: the snapshot is full and the plugin does not re-reset the same step — after a restart of either side we simply
        // send everything anew: the step, shopping, the bank highlight, the advice and the plan.
        const sn = snapshot.current;
        if (!sn.synced || resync) {
          const step = want ? latest.current.steps.find((x) => x.id === want) : undefined;
          sn.synced = true;
          if (!sn.parts.shopping) sn.parts = { ...sn.parts, shopping: loadJson<ShoppingPlanPayload>(PLAN_KEY, null) };
          sn.sentKey = null;
          if (step) void sendStep(step, chosenBranch(step, latest.current.branchChoice));
          else void flushSnapshot();
        }
      } else if (resync && s.online) {
        if (want && s.activeStepId !== want) {
          const step = latest.current.steps.find((x) => x.id === want);
          if (step) void sendStep(step, chosenBranch(step, latest.current.branchChoice));
        }
        // RuneLite could have been restarted — we send the exchange bulk list again (protocol 6 sends it in the snapshot).
        const plan = loadJson<ShoppingPlanPayload>(PLAN_KEY, null);
        if (Array.isArray(plan?.items) && plan.items.length) void syncShoppingPlan(plan);
      }
    };
    const onEvent = (e: BridgeEvent) => {
      logEvent(eventLog.current, e);
      if (e.type === 'XP') {
        const next = parseXp((e as { xp?: unknown }).xp);
        setXp(next);
        if (next) tracker.current.push(next, Date.now());
        else tracker.current.reset();
      } else if (e.type === 'QUESTS') setQuestsDone(parseQuests((e as { done?: unknown }).done));
      else if (e.type === 'STATUS') {
        setPlayer(parsePlayer((e as { player?: unknown }).player));
        setInGame(Boolean((e as { inGame?: unknown }).inGame));
        // Entering and leaving the game is a reason to ask about Shortest Path again.
        refresh();
      } else if (e.type === 'STATS') setStats(parseStats((e as { stats?: unknown }).stats));
      else if (e.type === 'OWNED') setOwned(parseOwned(e));
      else if (e.type === 'GEAR') setGear(parseGear((e as { gear?: unknown }).gear));
      else if (e.type === 'PACING') setPacing(parsePacing(e));
      else if (e.type === 'MOVED') {
        const m = parseMove(e);
        if (m) {
          setMoves((prev) => {
            const next = [...prev, { ...m, at: Date.now() }].slice(-8);
            saveJson(MOVES_KEY, { list: next });
            return next;
          });
        }
      }
      else if (e.type === 'NAV_SET') setNavFromPlugin(parseNavTarget((e as { target?: unknown }).target));
      else if (e.type === 'NAV_DONE') onNavDone(e);
      else if (e.type === 'STEP_AUTO_COMPLETED' && typeof (e as { stepId?: unknown }).stepId === 'string') onCompleted((e as { stepId: string }).stepId);
    };
    const handle = connectEvents(onEvent, (online) => {
      if (!alive) return;
      if (!online) {
        setState('offline');
        forget();
        return;
      }
      // The stream is open — we check against /status: the indicator must show what the plugin answers,
      // and the step shown in the game must be in the plugin too.
      refresh(true);
    });
    return () => {
      alive = false;
      handle.close();
    };
  }, [enabled, onCompleted, onNavDone, sendStep, setNavFromPlugin, flushSnapshot]);

  // The items of the stage of the step shown in the game — to the plugin, for a soft highlight in the bank.
  // They go on a step (and stage) change, after a reconnect and when the feature is turned on; turned off — the highlight is removed.
  useEffect(() => {
    if (state !== 'online') return;
    const step = activeStepId ? steps.find((s) => s.id === activeStepId) : undefined;
    const ids = features.bankTags && step ? stageBankItemIds(step.stage, mode) : [];
    const snap = supportsSnapshot(plugin?.protocol ?? null);
    const key = `${snap ? 'v6' : 'v5'}|${step?.stage ?? '-'}|${mode}|${ids.join(',')}`;
    if (key === bankSent.current || (!ids.length && !bankSent.current)) return;
    bankSent.current = key;
    if (snap) setPrepPart('bankTags', ids.length ? { stageId: step ? `stage-${step.stage}` : 'none', itemIds: ids } : null);
    else void syncBankTags(step ? `stage-${step.stage}` : 'none', ids);
  }, [state, activeStepId, steps, mode, features.bankTags, plugin?.protocol, setPrepPart]);

  const setAutoLaunch = useCallback((on: boolean) => {
    setAutoLaunchState(on);
    try { localStorage.setItem(AUTOLAUNCH_KEY, on ? '1' : '0'); } catch { /* it is remembered until a restart */ }
  }, []);

  const launchRuneLite = useCallback(async (quiet = false): Promise<RuneliteLaunch | null> => {
    if (!runelite) return null;
    const r = await runelite.launch().catch(() => null);
    if (!r) return null;
    const text = r.ok ? LAUNCH_TEXT[r.state] : `RuneLite did not start: ${r.problems?.[0] ?? 'details in settings'}`;
    // The auto-launch is silent if RuneLite is already running; we always show an error — otherwise it is unclear why there is no link.
    if (text && !(quiet && r.state === 'running')) notify(text);
    return r;
  }, [runelite, notify]);

  // With the app launch — RuneLite with the plugin, if the link and auto-launch are on.
  useEffect(() => {
    if (autoLaunchDone || !runelite || !enabled || !autoLaunch) return;
    autoLaunchDone = true;
    void launchRuneLite(true);
  }, [runelite, enabled, autoLaunch, launchRuneLite]);

  // A step that leads in the game was marked in the app (by a button or a tick) — the next open step goes to the game at once.
  // The auto-mark from the game does not repeat this: its step is already in handled, and onCompleted moves by itself.
  // Only the "was open → closed" transition: an already completed step shown in the game by hand stays where it is.
  const activeWasOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStepId) return;
    if (!isClosed(progress, activeStepId)) { activeWasOpen.current = activeStepId; return; }
    if (activeWasOpen.current !== activeStepId || handled.current.has(activeStepId)) return;
    const next = openAfter(steps, progress, activeStepId);
    const branch = next ? chosenBranch(next, latest.current.branchChoice) : undefined;
    if (!next || !toInGameTarget(next, branch)) {
      void clearStep();
      setActiveStepId(null);
      return;
    }
    handled.current.delete(next.id);
    setActiveStepId(next.id);
    void sendStep(next, branch);
  }, [activeStepId, progress, steps, sendStep, clearStep]);

  const pointInGame = useCallback(async (step: Step): Promise<PointResult> => {
    const branch = chosenBranch(step, latest.current.branchChoice);
    if (!toInGameTarget(step, branch)) return 'empty';
    const ok = await sendStep(step, branch);
    if (!ok) return 'offline';
    // The step is in the game again — its new auto-mark must work even if there already was one earlier.
    handled.current.delete(step.id);
    setActiveStepId(step.id);
    return 'ok';
  }, [sendStep]);

  const clear = useCallback(async () => {
    await clearStep();
    setActiveStepId(null);
  }, [clearStep]);

  const chooseBranch = useCallback((step: Step, branchId: string | null) => {
    setBranchChoice((prev) => {
      const next = { ...prev };
      if (branchId) next[step.id] = branchId;
      else delete next[step.id];
      saveJson(BRANCH_KEY, next);
      latest.current.branchChoice = next;
      return next;
    });
    // The step is already shown in the game — we update the target at once, without a repeated press.
    if (latest.current.activeStepId === step.id) {
      const branch = branchId ? step.branches?.find((b) => b.id === branchId) : undefined;
      void sendStep(step, branch);
    }
  }, [sendStep]);

  const syncPlan = useCallback(async (plan: ShoppingPlanPayload) => {
    saveJson(PLAN_KEY, plan);
    if (!supportsSnapshot(pluginProtocol.current)) return syncShoppingPlan(plan);
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, shopping: plan };
    // The step in the snapshot is not known yet (the app has just started) — the snapshot goes when it is; the list is saved.
    return sn.synced ? flushSnapshot() : true;
  }, [flushSnapshot]);

  const navigate = useCallback(async (target: NavTargetPayload) => {
    if (!enabled) return { ok: false as const, reason: 'off' as const };
    const r = await setNavTarget(target);
    // Plugin 2.11+ reports the target itself (NAV_SET) — and clears it if the item is already in the bag (NAV_DONE): setting it here
    // means risking bringing back an already cleared one. An old plugin does not report — then we remember ourselves.
    if (r.ok && (pluginProtocol.current ?? 0) < 4) setNavTargetState(target);
    return r;
  }, [enabled]);

  const [userClearedAt, setUserClearedAt] = useState(0);
  const clearNav = useCallback(async () => {
    setUserClearedAt(Date.now());
    await clearNavTarget();
    setNavFromPlugin(null);
  }, [setNavFromPlugin]);

  // Levels from the game go into the level fields by themselves — only when the character is the same as in the profile.
  useEffect(() => {
    if (!features.levelsFromGame || !stats || !gateAllows(gate)) return;
    const known: Record<string, number> = {};
    for (const [id, v] of Object.entries(stats)) if (levelById.has(id)) known[id] = v;
    setLevels(known);
  }, [stats, features.levelsFromGame, gate, setLevels]);

  // The first character seen is bound to the profile without a name.
  useEffect(() => {
    if (gate.kind !== 'link') return;
    const s = readProfiles();
    writeProfiles(linkPlayer(s, s.active, gate.player));
  }, [gate]);

  // The session summary is counted from the first received values; another character — a new session.
  const sessionPlayer = useRef<string | null>(null);
  useEffect(() => {
    if (player && sessionPlayer.current && sessionPlayer.current !== player) {
      setSession({ startedAt: Date.now(), levels0: null, xp0: null, closed0: Object.entries(latest.current.progress.steps).filter(([, v]) => v === 'done' || v === 'skipped').map(([k]) => k) });
      tracker.current.reset();
    }
    if (player) sessionPlayer.current = player;
  }, [player]);
  useEffect(() => {
    setSession((s) => {
      const levels0 = s.levels0 ?? stats;
      const xp0 = s.xp0 ?? xp;
      return levels0 === s.levels0 && xp0 === s.xp0 ? s : { ...s, levels0, xp0 };
    });
  }, [stats, xp]);

  const xpRate = useCallback((skill: string) => tracker.current.rate(skill), []);

  const locate = useCallback(async () => {
    const st = await checkStatus();
    return st.online && st.inGame ? st.pos : null;
  }, []);

  const diagnostics = useCallback(async () => {
    const st = await checkStatus();
    // The plugin journal (since 2.23.0): how much is written and what oddities the watchdog found; details — npm run telemetry.
    const log = st.online ? await getTelemetry() : null;
    const done = Object.values(latest.current.progress.steps).filter((v) => v === 'done').length;
    const report = {
      app: __APP_VERSION__,
      window: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      link: { enabled, state, inGame, plugin, activeStep: activeStepId },
      pluginReply: {
        online: st.online, protocol: st.protocol, version: st.pluginVersion, pluginStep: st.activeStepId,
        levels: st.stats ? Object.keys(st.stats).length : 0, xp: Boolean(st.xp), quests: st.questsDone?.length ?? null, character: Boolean(st.player),
      },
      pluginJournal: log === null ? null : log.enabled
        ? { file: log.file, events: log.events, anomalies: log.anomalies, truncated: log.truncated, lastShot: log.lastShot, recentAnomalies: log.recentAnomalies.map((x) => `${x.code}: ${x.message}`) }
        : { enabled: false },
      settings: { autoLaunch, features, mode: latest.current.progress.gameMode ?? null, profile: gate.kind },
      progress: { done, total: latest.current.steps.length },
      events: eventLog.current.slice(-100).map((x) => `${new Date(x.t).toLocaleTimeString('en-US')} ${x.text}`),
    };
    return JSON.stringify(report, null, 2);
  }, [enabled, state, inGame, plugin, activeStepId, autoLaunch, features, gate.kind]);

  const value = useMemo<BridgeValue>(
    () => ({
      enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance,
      canLaunch: Boolean(runelite), launchRuneLite: () => launchRuneLite(), autoLaunch, setAutoLaunch,
      stats, owned, shortestPath, branchChoice, chooseBranch, syncPlan, gear, lastGear, pacing, navTarget, navigate, clearNav, userClearedAt, plugin,
      xp, questsDone, player, gate, xpRate, session, diagnostics, locate, moves, setPrepPart,
    }),
    [enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance, runelite, launchRuneLite, autoLaunch, setAutoLaunch,
      stats, owned, shortestPath, branchChoice, chooseBranch, syncPlan, gear, lastGear, pacing, navTarget, navigate, clearNav, userClearedAt, plugin,
      xp, questsDone, player, gate, xpRate, session, diagnostics, locate, moves, setPrepPart],
  );
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeValue {
  const v = useContext(BridgeContext);
  if (!v) throw new Error('useBridge outside BridgeProvider');
  return v;
}
