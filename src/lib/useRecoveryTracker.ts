// Режим восстановления для экранов: следит за событиями MOVED из игры (смерть, телепорт), решает, срыв ли это
// (lib/recovery.ts), пока срыв — раз в полминуты спрашивает у плагина, где игрок: рядом с шагом — режим кончился.
// «Это не срыв» запоминается: то, что было до этой кнопки, больше не считается.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { detectRecovery, stepPoint, type Point, type Recovery } from './recovery';

const DISMISS_KEY = 'osrs-put:recovery-dismissed';
const POLL_MS = 30_000;

export interface ActiveRecovery {
  stepId: string;
  recovery: Recovery;
}

function loadDismissed(): number {
  try { return Number(localStorage.getItem(DISMISS_KEY)) || 0; } catch { return 0; }
}

export function useRecoveryTracker(): { active: ActiveRecovery | null; dismiss: () => void } {
  const { moves, activeStepId, locate, state } = useBridge();
  const { steps } = useStore();
  const [dismissedAt, setDismissedAt] = useState(loadDismissed);
  const [here, setHere] = useState<Point | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const step = activeStepId ? steps.find((s) => s.id === activeStepId) ?? null : null;

  const candidate = useMemo(
    () => (step ? detectRecovery({ moves, step: step, now, dismissedAt, here }) : null),
    [moves, step, now, dismissedAt, here],
  );

  // Пока срыв — смотрим, не дошёл ли игрок до шага; раз в полминуты, не чаще.
  const active = Boolean(candidate);
  useEffect(() => {
    if (!active || state !== 'online') return undefined;
    let alive = true;
    const tick = () => {
      setNow(Date.now());
      void locate().then((p) => { if (alive && p) setHere(p); });
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [active, state, locate]);

  // Новый скачок — прежнее «где я» устарело.
  useEffect(() => { setHere(null); }, [moves.length]);

  const dismiss = useCallback(() => {
    const t = Date.now();
    setDismissedAt(t);
    try { localStorage.setItem(DISMISS_KEY, String(t)); } catch { /* запомнится до перезапуска */ }
  }, []);

  const value = useMemo<ActiveRecovery | null>(() => (step && candidate ? { stepId: step.id, recovery: candidate } : null), [step, candidate]);
  return { active: value, dismiss };
}

export { stepPoint };
