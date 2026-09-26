// Состояние прогресса: один источник на всё приложение, сохранение в localStorage, отмена.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Progress, StepStatus } from './types';
import { BASE_QP, known, steps } from './data';
import { emptyProgress, loadProgress, saveProgress, STORAGE_KEY, withLevel, withNote, withStep } from './lib/progress';
import { questPoints } from './lib/qp';

export interface Toast {
  id: number;
  message: string;
  undo?: Progress;
}

interface StoreValue {
  progress: Progress;
  qp: number;
  setStep: (id: string, status: StepStatus | null) => void;
  setLevel: (id: string, level: number) => void;
  setNote: (id: string, note: string) => void;
  replace: (p: Progress, message: string) => void;
  reset: () => void;
  toast: Toast | null;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress(storage(), known));
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
    else saveProgress(storage(), progress);
  }, [progress]);

  // Прогресс, изменённый в другой вкладке.
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

  const setStep = useCallback((id: string, status: StepStatus | null) => {
    const before = current.current;
    setProgress(withStep(before, id, status));
    show(status === 'done' ? `Отмечено ${id}` : status === 'skipped' ? `Пропущено ${id}` : `Снята отметка ${id}`, before);
  }, [show]);

  const setLevel = useCallback((id: string, level: number) => {
    setProgress((p) => (p.levels[id] === level ? p : withLevel(p, id, level)));
  }, []);

  const setNote = useCallback((id: string, note: string) => {
    setProgress((p) => ((p.notes[id] ?? '') === note ? p : withNote(p, id, note)));
  }, []);

  const replace = useCallback((p: Progress, message: string) => {
    const before = current.current;
    setProgress(p);
    show(message, before);
  }, [show]);

  const reset = useCallback(() => {
    const before = current.current;
    setProgress(emptyProgress());
    show('Прогресс сброшен', before);
  }, [show]);

  const undo = useCallback(() => {
    const t = toastRef.current;
    if (t?.undo) setProgress(t.undo);
    setToast(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const qp = useMemo(() => questPoints(steps, progress, BASE_QP), [progress]);

  const value = useMemo<StoreValue>(
    () => ({ progress, qp, setStep, setLevel, setNote, replace, reset, toast, undo, dismissToast }),
    [progress, qp, setStep, setLevel, setNote, replace, reset, toast, undo, dismissToast],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore вне StoreProvider');
  return v;
}
