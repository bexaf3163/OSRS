// The bridge provider's state, which its parts in the bridge*.ts files share, and what the link keeps in local storage.

import { useMemo, useRef, useState } from 'react';
import type { PlayerStats, Step, StepBranch } from '../types';
import { XpTracker } from '../domain/player/xpRate';
import { guardedProfileGate as profileGate, useProfiles } from './profiles';
import { useStore } from './store';
import { desktop } from '../services/desktop';
import type { GearState, NavTargetPayload, PacingState, CombatLogState, QuestInstruction } from '../services/runeliteBridge';
import type { OwnedState } from '../domain/items/checklist';
import type { MoveEvent } from '../domain/travel/recovery';
import { useFeatures } from './hooks/useFeatures';
import { isClosed } from '../domain/quests/next-step';
import { EMPTY_PARTS, type SnapshotParts } from '../domain/prep/prepEnvelope';
import { STORAGE_KEYS } from '../domain/persistence/storageKeys';
import type { AutoAdvance, BridgeState, BridgeValue } from './bridgeValue';
import type { QuestObservation } from '../domain/player/questObservation';

export const ENABLED_KEY = STORAGE_KEYS.runeliteBridge;
/** The chosen quick variants: { 'S2-05': 'varrock-teleport' }. */
export const BRANCH_KEY = STORAGE_KEYS.branchChoice;
/** The last bulk list — goes to the game again when RuneLite was restarted. */
export const PLAN_KEY = STORAGE_KEYS.shoppingPlan;
export const MOVES_KEY = STORAGE_KEYS.moves;
/** The step shown in the game: after a restart of the app or RuneLite it returns to the game by itself. */
export const ACTIVE_KEY = STORAGE_KEYS.activeStep;

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
export function loadJson<T extends object>(key: string, fallback: T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  } catch {
    // No storage or garbage — the default.
  }
  return fallback;
}

/** The choice of branch by steps: we take only "step → string" pairs. */
function loadBranchChoice(): Record<string, string> {
  const data = loadJson<Record<string, unknown>>(BRANCH_KEY, {}) ?? {};
  return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

export function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* it is remembered until a restart */ }
}

/** The chosen quick variant of the step, if the step still has it. */
export function chosenBranch(step: Step, choice: Record<string, string>): StepBranch | undefined {
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

/** The provider's state and the references its parts share. The parts reach it through this object, as the plugin's sections reach the plugin. */
export function useBridgeCore() {
  const { progress, steps, setStep, setLevels, notify, mode, qp: routeQp } = useStore();
  const [enabled, setEnabledState] = useState(loadEnabled);
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
  const [pacing, setPacing] = useState<PacingState | null>(null);
  const [xp, setXp] = useState<PlayerStats | null>(null);
  const [questsDone, setQuestsDone] = useState<string[] | null>(null);
  const [questStates, setQuestStates] = useState<QuestObservation | null>(null);
  // Character jumps (death, teleport): kept for a short time — after an app restart the recovery mode is not lost.
  const [moves, setMoves] = useState<MoveEvent[]>(() => (loadJson<{ list: MoveEvent[] }>(MOVES_KEY, null)?.list ?? []).filter((m) => m && typeof m.at === 'number' && Date.now() - m.at < 3_600_000).slice(-8));
  const [player, setPlayer] = useState<string | null>(null);
  const [position, setPosition] = useState<BridgeValue['position']>(null);
  const liveIdentity = useRef<{ inGame: boolean | null; player: string | null }>({ inGame: null, player: null });
  const sessionEpoch = useRef(0);
  const stepIntent = useRef(0);
  const tracker = useRef(new XpTracker());
  const profiles = useProfiles();
  const gate = useMemo(() => profileGate(profiles, player), [profiles, player]);
  const [navTarget, setNavTargetState] = useState<NavTargetPayload | null>(null);
  const [questInstruction, setQuestInstruction] = useState<QuestInstruction | null>(null);
  const [chronicleCharges, setChronicleCharges] = useState<number | null>(null);
  const [spellbook, setSpellbook] = useState<number | null>(null);
  const [questPoints, setQuestPoints] = useState<number | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLogState | null>(null);
  const [totalLevel, setTotalLevel] = useState<number | null>(null);
  const [accountType, setAccountType] = useState<'normal' | 'ironman' | null>(null);
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

  // The event handler outlives a render — it takes fresh data from refs.
  const qp = questPoints ?? routeQp;
  const latest = useRef({ progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear, gate, mode, qp, questsDone });
  latest.current = { progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear, gate, mode, qp, questsDone };
  /** Already handled auto-marks: one event does not mark a step twice and does not move the route twice. */
  const handled = useRef(new Set<string>());
  return {
    progress, steps, setLevels, notify, mode, enabled, setEnabledState, state, setState, inGame, setInGame, activeStepId, setActiveStepId, advance, setAdvance, stats, setStats, owned, setOwned, shortestPath, setShortestPath, branchChoice, setBranchChoice, gear, setGear, pacing, setPacing, xp, setXp, questsDone, setQuestsDone, questStates, setQuestStates, moves, setMoves, player, setPlayer, position, setPosition, liveIdentity, sessionEpoch, stepIntent, tracker, gate, navTarget, setNavTargetState, questInstruction, setQuestInstruction, chronicleCharges, setChronicleCharges, spellbook, setSpellbook, questPoints, setQuestPoints, combatLog, setCombatLog, totalLevel, setTotalLevel, accountType, setAccountType, plugin, setPlugin, features, bankSent, navSeq, pluginProtocol, snapshot, qp, latest, handled,
  };
}

export type BridgeCore = ReturnType<typeof useBridgeCore>;
