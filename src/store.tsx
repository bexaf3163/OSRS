// The progress state: one source for the whole app, saving (localStorage + a file in the desktop app), undo.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameMode, Progress, Stage, Step, StepStatus } from './types';
import { BASE_QP, known, maxQpFor, stagesFor, stepById, stepsFor } from './data';
import {
  emptyProgress, gameModeOf, STORAGE_KEY,
  withGameMode, withLevel, withLevels, withNote, withReactivated, withReviewed, withStep, withUpgradeDismissed, withOwnedManual, withSellRestrictions, withTaskDone,
} from './lib/progress';
import { profileStorageKey, readProfiles } from './lib/profiles';
import { questPoints } from './lib/qp';
import { desktop } from './lib/desktop';
import { readProgressText, restoreProgress, type RestoredProgress } from './lib/progressStorage';
import { samePicks } from './lib/methodPick';
import { withTrainingMethod, type TrainingPick } from './lib/methodStep';
import { sameFoodPicks, withFoodPlan, type FoodPick } from './lib/foodPlan';
import { samePicks as sameCombatPicks, withCombatPlan, type CombatPick } from './lib/combatRoute/pick';
import { persistProgress } from './lib/persistProgress';

export interface Toast {
  id: number;
  message: string;
  undo?: Progress;
}

interface StoreValue {
  progress: Progress;
  persistenceWarning: string | null;
  mode: GameMode;
  /** The steps and stages visible in the current mode. */
  steps: Step[];
  stages: Stage[];
  qp: number;
  maxQp: number;
  /** message — a custom caption in the message at the bottom (for example, "done in the game"). */
  setStep: (id: string, status: StepStatus | null, message?: string) => void;
  setLevel: (id: string, level: number) => void;
  /** Several levels at once — the levels from the game. */
  setLevels: (levels: Record<string, number>) => void;
  setNote: (id: string, note: string) => void;
  setMode: (mode: GameMode) => void;
  /** The player's word on the Grand Exchange sale restrictions of a new account; null — decide from the game. */
  setSellRestrictions: (value: 'lifted' | 'active' | null) => void;
  /** Ticks or unticks a step's task that has no game check (key "<stepId>:<taskId>"). */
  setTaskDone: (key: string, done: boolean) => void;
  /** The training method each skill step that follows one is on now (step id -> method id): set by the provider that owns the player state. */
  setMethodPicks: (picks: Record<string, TrainingPick>) => void;
  /** The food of combat training steps from this player's estimate (lib/foodPlan.ts): one trip for readiness, the whole goal for shopping. */
  setFoodPicks: (picks: Record<string, FoodPick>) => void;
  /** The combat plans the player adopted, in the phase they are in now (lib/combatRoute/pick.ts): the step is fought where and against what the plan says. */
  setCombatPicks: (picks: Record<string, CombatPick>) => void;
  review: (ids: string[]) => void;
  reactivate: (ids: string[]) => void;
  /** "✕ Skip" the upgrade hint on a step (dismissed=false — bring it back). */
  dismissUpgrade: (stepId: string, dismissed?: boolean) => void;
  /** "I already have it" in the bulk shopping: a quantity or null — remove the mark. */
  setOwnedManual: (key: string, count: number | null) => void;
  replace: (p: Progress, message: string) => void;
  reset: () => void;
  toast: Toast | null;
  /** A message at the bottom without undo. */
  notify: (message: string) => void;
  undo: () => void;
  dismissToast: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** localStorage or the desktop app's file — whichever is fresher. The file saves things if the browser storage is gone. */
function initialProgress(): RestoredProgress {
  return restoreProgress(storage(), known, progressKey(), () => desktop()?.loadProgressFile(readProfiles().active) ?? null);
}

/** The progress key of the active profile: the main one keeps the old key. */
function progressKey(): string {
  return profileStorageKey(STORAGE_KEY, readProfiles().active);
}

const qpOf = (id: string) => stepById.get(id)?.qp ?? 0;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [restored] = useState(initialProgress);
  const [progress, setProgress] = useState<Progress>(restored.progress);
  const canPersist = useRef(restored.writable);
  const preserved = useRef(restored.preserved);
  const [persistenceWarning, setPersistenceWarning] = useState(restored.warning);
  const [toast, setToast] = useState<Toast | null>(null);
  const current = useRef(progress);
  current.current = progress;
  const toastId = useRef(0);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // What came from another tab is not written back, otherwise the tabs start bouncing the write between them.
  const fromOtherTab = useRef(false);
  useEffect(() => {
    let alive = true;
    const profile = readProfiles().active;
    if (fromOtherTab.current) fromOtherTab.current = false;
    else if (canPersist.current) {
      void persistProgress(progress, storage(), progressKey(), desktop(), profile).then(warning => {
        if (alive && canPersist.current && readProfiles().active === profile) setPersistenceWarning(warning);
      });
    }
    return () => { alive = false; };
  }, [progress]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== progressKey()) return;
      const incoming = readProgressText(e.newValue, known);
      if (incoming.kind !== 'valid') {
        if (incoming.kind !== 'missing') {
          const recovery = initialProgress();
          preserved.current = recovery.preserved;
          canPersist.current = false;
          setPersistenceWarning(recovery.warning ?? 'Automatic saving is paused: saved progress changed in another window. Restore a backup in Settings.');
        }
        return;
      }
      fromOtherTab.current = true;
      setProgress(incoming.progress);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const show = useCallback((message: string, undo?: Progress) => {
    setToast({ id: ++toastId.current, message, undo });
  }, []);

  const setStep = useCallback((id: string, status: StepStatus | null, message?: string) => {
    const before = current.current;
    let next = withStep(before, id, status);
    // A step already marked by the V2 text does not need to be checked again.
    if (status === 'done' && stepById.get(id)?.updatedInV2) next = withReviewed(next, [id]);
    setProgress(next);
    show(message ?? (status === 'done' ? `Marked ${id}` : status === 'skipped' ? `Skipped ${id}` : `Unmarked ${id}`), before);
  }, [show]);

  const setLevel = useCallback((id: string, level: number) => {
    setProgress((p) => (p.levels[id] === level ? p : withLevel(p, id, level)));
  }, []);

  const setLevels = useCallback((levels: Record<string, number>) => {
    setProgress((p) => withLevels(p, levels));
  }, []);

  const setNote = useCallback((id: string, note: string) => {
    setProgress((p) => ((p.notes[id] ?? '') === note ? p : withNote(p, id, note)));
  }, []);

  const setMode = useCallback((mode: GameMode) => {
    setProgress((p) => (gameModeOf(p) === mode ? p : withGameMode(p, mode)));
  }, []);

  const setSellRestrictions = useCallback((value: 'lifted' | 'active' | null) => {
    setProgress((p) => ((p.sellRestrictions ?? null) === value ? p : withSellRestrictions(p, value)));
  }, []);

  const setTaskDone = useCallback((key: string, done: boolean) => {
    setProgress((p) => ((p.tasksDone?.[key] === true) === done ? p : withTaskDone(p, key, done)));
  }, []);

  const review = useCallback((ids: string[]) => {
    const before = current.current;
    setProgress(withReviewed(before, ids));
    show(ids.length > 1 ? 'V2 updates marked as checked' : `${ids[0]} checked`, before);
  }, [show]);

  const reactivate = useCallback((ids: string[]) => {
    const before = current.current;
    setProgress(withReactivated(before, ids, qpOf));
    show(ids.length > 1 ? `Returned to active: ${ids.join(', ')}` : `${ids[0]} is back in the plan`, before);
  }, [show]);

  const dismissUpgrade = useCallback((stepId: string, dismissed = true) => {
    setProgress((p) => ((p.upgradeDismissedForSteps ?? []).includes(stepId) === dismissed ? p : withUpgradeDismissed(p, stepId, dismissed)));
  }, []);

  const setOwnedManual = useCallback((key: string, count: number | null) => {
    setProgress((p) => withOwnedManual(p, key, count));
  }, []);

  const replace = useCallback((p: Progress, message: string) => {
    if (!canPersist.current && !preserved.current) {
      show('Progress could not be replaced safely. Export it and make a copy of the original data first.');
      return;
    }
    canPersist.current = true;
    setPersistenceWarning(null);
    const before = current.current;
    setProgress(p);
    show(message, before);
  }, [show]);

  const reset = useCallback(() => {
    const before = current.current;
    // The game mode and the sale restrictions' answer are settings, not progress: a reset does not touch them.
    replace({
      ...emptyProgress(), ...(before.gameMode ? { gameMode: before.gameMode } : {}), ...(before.sellRestrictions ? { sellRestrictions: before.sellRestrictions } : {}),
    }, 'Progress reset');
  }, [replace]);

  const undo = useCallback(() => {
    const t = toastRef.current;
    if (t?.undo) setProgress(t.undo);
    setToast(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = useCallback((message: string) => show(message), [show]);

  const mode = gameModeOf(progress);
  const [methodPicks, setPicks] = useState<Record<string, TrainingPick>>({});
  const setMethodPicks = useCallback((p: Record<string, TrainingPick>) => setPicks((prev) => (samePicks(prev, p) ? prev : p)), []);
  const [foodPicks, setFood] = useState<Record<string, FoodPick>>({});
  const setFoodPicks = useCallback((p: Record<string, FoodPick>) => setFood((prev) => (sameFoodPicks(prev, p) ? prev : p)), []);
  const [combatPicks, setCombat] = useState<Record<string, CombatPick>>({});
  const setCombatPicks = useCallback((p: Record<string, CombatPick>) => setCombat((prev) => (sameCombatPicks(prev, p) ? prev : p)), []);
  const baseSteps = useMemo(() => stepsFor(mode), [mode]);
  // A step that follows a training method asks for that method's tools and place; a combat training step with an estimate asks for one trip of
  // food and the shopping list buys its whole goal; every other step is the same object as in the data.
  // An adopted combat plan first (it decides the opponent and the place), then the method and the food that follow from it.
  const steps = useMemo(
    () => baseSteps.map((s) => withFoodPlan(withTrainingMethod(withCombatPlan(s, combatPicks[s.id]), methodPicks[s.id]), foodPicks[s.id])),
    [baseSteps, combatPicks, methodPicks, foodPicks],
  );
  const stages = useMemo(() => stagesFor(mode), [mode]);
  const qp = useMemo(() => questPoints(steps, progress, BASE_QP), [steps, progress]);
  const maxQp = useMemo(() => maxQpFor(mode), [mode]);

  const value = useMemo<StoreValue>(
    () => ({
      progress, mode, steps, stages, qp, maxQp, setStep, setLevel, setLevels, setNote, setMode, setSellRestrictions, setTaskDone, setMethodPicks, setFoodPicks, setCombatPicks, review, reactivate, dismissUpgrade, setOwnedManual, replace, reset,
      toast, notify, undo, dismissToast, persistenceWarning,
    }),
    [progress, mode, steps, stages, qp, maxQp, setStep, setLevel, setLevels, setNote, setMode, setSellRestrictions, setTaskDone, setMethodPicks, setFoodPicks, setCombatPicks, review, reactivate, dismissUpgrade, setOwnedManual, replace, reset,
      toast, notify, undo, dismissToast, persistenceWarning],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
