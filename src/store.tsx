// The progress state: one source for the whole app, saving (localStorage + a file in the desktop app), undo.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameMode, Progress, Stage, Step, StepStatus } from './types';
import { BASE_QP, known, maxQpFor, stagesFor, stepById, stepsFor } from './data';
import {
  emptyProgress, gameModeOf, loadProgress, normalizeProgress, saveProgress, STORAGE_KEY,
  withGameMode, withLevel, withLevels, withNote, withReactivated, withReviewed, withStep, withUpgradeDismissed, withOwnedManual,
} from './lib/progress';
import { profileStorageKey, readProfiles } from './lib/profiles';
import { questPoints } from './lib/qp';
import { desktop } from './lib/desktop';

export interface Toast {
  id: number;
  message: string;
  undo?: Progress;
}

interface StoreValue {
  progress: Progress;
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
function initialProgress(): Progress {
  const ls = storage();
  let hasLocal = false;
  try { hasLocal = Boolean(ls?.getItem(progressKey())); } catch { /* no storage */ }
  const local = loadProgress(ls, known, progressKey());
  try {
    const text = desktop()?.loadProgressFile(readProfiles().active);
    const fromFile = text ? normalizeProgress(JSON.parse(text), known)?.progress : undefined;
    if (fromFile && (!hasLocal || Date.parse(fromFile.updatedAt) > Date.parse(local.updatedAt))) return fromFile;
  } catch {
    // A broken file — we stay on localStorage.
  }
  return local;
}

/** The progress key of the active profile: the main one keeps the old key. */
function progressKey(): string {
  return profileStorageKey(STORAGE_KEY, readProfiles().active);
}

function persist(p: Progress) {
  saveProgress(storage(), p, progressKey());
  try {
    desktop()?.saveProgressFile(JSON.stringify(p), readProfiles().active);
  } catch {
    // The file was not written — localStorage is saved anyway.
  }
}

const qpOf = (id: string) => stepById.get(id)?.qp ?? 0;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [toast, setToast] = useState<Toast | null>(null);
  const current = useRef(progress);
  current.current = progress;
  const toastId = useRef(0);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // What came from another tab is not written back, otherwise the tabs start bouncing the write between them.
  const fromOtherTab = useRef(false);
  useEffect(() => {
    if (fromOtherTab.current) fromOtherTab.current = false;
    else persist(progress);
  }, [progress]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== progressKey()) return;
      fromOtherTab.current = true;
      setProgress(loadProgress(storage(), known, progressKey()));
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
    const before = current.current;
    setProgress(p);
    show(message, before);
  }, [show]);

  const reset = useCallback(() => {
    const before = current.current;
    // The game mode is a setting, not progress: a reset does not touch it.
    setProgress({ ...emptyProgress(), ...(before.gameMode ? { gameMode: before.gameMode } : {}) });
    show('Progress reset', before);
  }, [show]);

  const undo = useCallback(() => {
    const t = toastRef.current;
    if (t?.undo) setProgress(t.undo);
    setToast(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = useCallback((message: string) => show(message), [show]);

  const mode = gameModeOf(progress);
  const steps = useMemo(() => stepsFor(mode), [mode]);
  const stages = useMemo(() => stagesFor(mode), [mode]);
  const qp = useMemo(() => questPoints(steps, progress, BASE_QP), [steps, progress]);
  const maxQp = useMemo(() => maxQpFor(mode), [mode]);

  const value = useMemo<StoreValue>(
    () => ({
      progress, mode, steps, stages, qp, maxQp, setStep, setLevel, setLevels, setNote, setMode, review, reactivate, dismissUpgrade, setOwnedManual, replace, reset,
      toast, notify, undo, dismissToast,
    }),
    [progress, mode, steps, stages, qp, maxQp, setStep, setLevel, setLevels, setNote, setMode, review, reactivate, dismissUpgrade, setOwnedManual, replace, reset,
      toast, notify, undo, dismissToast],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
