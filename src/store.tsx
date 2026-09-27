// Состояние прогресса: один источник на всё приложение, сохранение (localStorage + файл в программе для ПК), отмена.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameMode, Progress, Stage, Step, StepStatus } from './types';
import { BASE_QP, known, maxQpFor, stagesFor, stepById, stepsFor } from './data';
import {
  emptyProgress, gameModeOf, loadProgress, normalizeProgress, saveProgress, STORAGE_KEY,
  withGameMode, withLevel, withNote, withReactivated, withReviewed, withStep, withUpgradeDismissed,
} from './lib/progress';
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
  /** Шаги и этапы, видимые в текущем режиме. */
  steps: Step[];
  stages: Stage[];
  qp: number;
  maxQp: number;
  /** message — своя подпись в сообщении внизу (например, «выполнено в игре»). */
  setStep: (id: string, status: StepStatus | null, message?: string) => void;
  setLevel: (id: string, level: number) => void;
  setNote: (id: string, note: string) => void;
  setMode: (mode: GameMode) => void;
  review: (ids: string[]) => void;
  reactivate: (ids: string[]) => void;
  /** «✕ Пропустить» подсказку апгрейда на шаге (dismissed=false — вернуть). */
  dismissUpgrade: (stepId: string, dismissed?: boolean) => void;
  replace: (p: Progress, message: string) => void;
  reset: () => void;
  toast: Toast | null;
  /** Сообщение внизу без отмены. */
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

/** localStorage или файл программы для ПК — что свежее. Файл спасает, если хранилище браузера пропало. */
function initialProgress(): Progress {
  const ls = storage();
  let hasLocal = false;
  try { hasLocal = Boolean(ls?.getItem(STORAGE_KEY)); } catch { /* нет хранилища */ }
  const local = loadProgress(ls, known);
  try {
    const text = desktop()?.loadProgressFile();
    const fromFile = text ? normalizeProgress(JSON.parse(text), known)?.progress : undefined;
    if (fromFile && (!hasLocal || Date.parse(fromFile.updatedAt) > Date.parse(local.updatedAt))) return fromFile;
  } catch {
    // Битый файл — остаёмся на localStorage.
  }
  return local;
}

function persist(p: Progress) {
  saveProgress(storage(), p);
  try {
    desktop()?.saveProgressFile(JSON.stringify(p));
  } catch {
    // Файл не записался — localStorage всё равно сохранён.
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

  // Пришедшее из другой вкладки не пишем обратно, иначе вкладки начнут перекидываться записью.
  const fromOtherTab = useRef(false);
  useEffect(() => {
    if (fromOtherTab.current) fromOtherTab.current = false;
    else persist(progress);
  }, [progress]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      fromOtherTab.current = true;
      setProgress(loadProgress(storage(), known));
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
    // Шаг, отмеченный уже по тексту V2, проверять повторно не нужно.
    if (status === 'done' && stepById.get(id)?.updatedInV2) next = withReviewed(next, [id]);
    setProgress(next);
    show(message ?? (status === 'done' ? `Отмечено ${id}` : status === 'skipped' ? `Пропущено ${id}` : `Снята отметка ${id}`), before);
  }, [show]);

  const setLevel = useCallback((id: string, level: number) => {
    setProgress((p) => (p.levels[id] === level ? p : withLevel(p, id, level)));
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
    show(ids.length > 1 ? 'Обновления V2 отмечены проверенными' : `${ids[0]} проверен`, before);
  }, [show]);

  const reactivate = useCallback((ids: string[]) => {
    const before = current.current;
    setProgress(withReactivated(before, ids, qpOf));
    show(ids.length > 1 ? `Возвращено в активные: ${ids.join(', ')}` : `${ids[0]} снова в плане`, before);
  }, [show]);

  const dismissUpgrade = useCallback((stepId: string, dismissed = true) => {
    setProgress((p) => ((p.upgradeDismissedForSteps ?? []).includes(stepId) === dismissed ? p : withUpgradeDismissed(p, stepId, dismissed)));
  }, []);

  const replace = useCallback((p: Progress, message: string) => {
    const before = current.current;
    setProgress(p);
    show(message, before);
  }, [show]);

  const reset = useCallback(() => {
    const before = current.current;
    // Режим игры — настройка, а не прогресс: сброс его не трогает.
    setProgress({ ...emptyProgress(), ...(before.gameMode ? { gameMode: before.gameMode } : {}) });
    show('Прогресс сброшен', before);
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
      progress, mode, steps, stages, qp, maxQp, setStep, setLevel, setNote, setMode, review, reactivate, dismissUpgrade, replace, reset,
      toast, notify, undo, dismissToast,
    }),
    [progress, mode, steps, stages, qp, maxQp, setStep, setLevel, setNote, setMode, review, reactivate, dismissUpgrade, replace, reset,
      toast, notify, undo, dismissToast],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore вне StoreProvider');
  return v;
}
