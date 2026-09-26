// Состояние связи с RuneLite: включена ли она, есть ли плагин, какой шаг показан в игре.
// Автоотметка из игры идёт сюда: шаг отмечается, в игру уходит следующий, страницы открывают его у себя.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Step } from './types';
import { useStore } from './store';
import { desktop, type RuneliteLaunch } from './lib/desktop';
import {
  checkStatus, clearActiveStep, connectEvents, planAutoComplete, syncActiveStep, toInGameTarget, type BridgeEvent,
} from './services/runeliteBridge';

const ENABLED_KEY = 'osrs-put:runelite-bridge';
const AUTOLAUNCH_KEY = 'osrs-put:runelite-autolaunch';
/** Автозапуск — один раз за запуск программы (в разработке StrictMode вызывает эффекты дважды). */
let autoLaunchDone = false;

/** off — связь выключена в настройках; connecting — первая попытка; offline — плагина нет; online — есть. */
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
  /** Шаг, который сейчас показан в игре. */
  activeStepId: string | null;
  pointInGame: (step: Step) => Promise<PointResult>;
  clear: () => Promise<void>;
  /** Последняя автоотметка из игры — страницы «Пути» открывают следующий шаг. */
  advance: AutoAdvance | null;
  /** Программа для ПК умеет сама запускать RuneLite с плагином. */
  canLaunch: boolean;
  launchRuneLite: () => Promise<RuneliteLaunch | null>;
  /** Запускать RuneLite вместе с программой. */
  autoLaunch: boolean;
  setAutoLaunch: (on: boolean) => void;
}

const BridgeContext = createContext<BridgeValue | null>(null);

/** По умолчанию связь включена в программе для ПК и выключена в браузере и на телефоне. */
function loadEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    // Хранилище недоступно — значение по умолчанию.
  }
  return Boolean(desktop()?.bridge);
}

function loadAutoLaunch(): boolean {
  try {
    return localStorage.getItem(AUTOLAUNCH_KEY) !== '0';
  } catch {
    return true;
  }
}

const LAUNCH_TEXT: Partial<Record<RuneliteLaunch['state'], string>> = {
  started: '🎮 Запускаю RuneLite с мостом OSRS Path Bridge…',
  starting: 'RuneLite уже запускается…',
  running: 'RuneLite с мостом уже запущен',
};

export function BridgeProvider({ children }: { children: ReactNode }) {
  const { progress, steps, setStep, notify } = useStore();
  const [enabled, setEnabledState] = useState(loadEnabled);
  const [autoLaunch, setAutoLaunchState] = useState(loadAutoLaunch);
  const runelite = desktop()?.runelite;
  const [state, setState] = useState<BridgeState>(enabled ? 'connecting' : 'off');
  const [inGame, setInGame] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [advance, setAdvance] = useState<AutoAdvance | null>(null);

  // Обработчик событий живёт дольше отрисовки — свежие данные берёт из ссылок.
  const latest = useRef({ progress, steps, setStep, activeStepId });
  latest.current = { progress, steps, setStep, activeStepId };
  /** Уже обработанные автоотметки: одно событие не отмечает шаг дважды и не двигает маршрут дважды. */
  const handled = useRef(new Set<string>());
  const nonce = useRef(0);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* запомнится до перезапуска */ }
  }, []);

  const onCompleted = useCallback((id: string) => {
    const { progress: p, steps: list, setStep: mark, activeStepId: active } = latest.current;
    const plan = planAutoComplete(list, p, id, active, handled.current);
    handled.current.add(id);
    if (!plan.mark) return;
    const next = plan.next;
    mark(id, 'done', `🎮 RuneLite: ${id} выполнен в игре${next ? ` — дальше ${next.id}` : ''}`);
    setAdvance({ from: id, to: next?.id, nonce: ++nonce.current });
    if (plan.inGame === 'sync-next' && next) {
      handled.current.delete(next.id);
      void syncActiveStep(next).then((ok) => setActiveStepId(ok ? next.id : null));
    } else if (plan.inGame === 'clear') {
      void clearActiveStep();
      setActiveStepId(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState('off');
      setInGame(false);
      return;
    }
    setState('connecting');
    let alive = true;
    const onEvent = (e: BridgeEvent) => {
      if (e.type === 'STATUS') setInGame(Boolean((e as { inGame?: unknown }).inGame));
      else if (e.type === 'STEP_AUTO_COMPLETED' && typeof (e as { stepId?: unknown }).stepId === 'string') onCompleted((e as { stepId: string }).stepId);
    };
    const handle = connectEvents(onEvent, (online) => {
      if (!alive) return;
      if (!online) {
        setState('offline');
        setInGame(false);
        return;
      }
      // Поток открыт — сверяемся с /status: индикатор должен показывать то, что отвечает плагин.
      void checkStatus().then((s) => {
        if (!alive) return;
        setState(s.online ? 'online' : 'offline');
        setInGame(s.inGame);
      });
    });
    return () => {
      alive = false;
      handle.close();
    };
  }, [enabled, onCompleted]);

  const setAutoLaunch = useCallback((on: boolean) => {
    setAutoLaunchState(on);
    try { localStorage.setItem(AUTOLAUNCH_KEY, on ? '1' : '0'); } catch { /* запомнится до перезапуска */ }
  }, []);

  const launchRuneLite = useCallback(async (quiet = false): Promise<RuneliteLaunch | null> => {
    if (!runelite) return null;
    const r = await runelite.launch().catch(() => null);
    if (!r) return null;
    const text = r.ok ? LAUNCH_TEXT[r.state] : `RuneLite не запустился: ${r.problems?.[0] ?? 'подробности в настройках'}`;
    // Автозапуск молчит, если RuneLite уже работает; ошибку показываем всегда — иначе непонятно, почему нет связи.
    if (text && !(quiet && r.state === 'running')) notify(text);
    return r;
  }, [runelite, notify]);

  // С запуском программы — RuneLite с плагином, если связь и автозапуск включены.
  useEffect(() => {
    if (autoLaunchDone || !runelite || !enabled || !autoLaunch) return;
    autoLaunchDone = true;
    void launchRuneLite(true);
  }, [runelite, enabled, autoLaunch, launchRuneLite]);

  const pointInGame = useCallback(async (step: Step): Promise<PointResult> => {
    if (!toInGameTarget(step)) return 'empty';
    const ok = await syncActiveStep(step);
    if (!ok) return 'offline';
    // Шаг снова в игре — его новая автоотметка должна сработать, даже если раньше уже была.
    handled.current.delete(step.id);
    setActiveStepId(step.id);
    return 'ok';
  }, []);

  const clear = useCallback(async () => {
    await clearActiveStep();
    setActiveStepId(null);
  }, []);

  const value = useMemo<BridgeValue>(
    () => ({
      enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance,
      canLaunch: Boolean(runelite), launchRuneLite: () => launchRuneLite(), autoLaunch, setAutoLaunch,
    }),
    [enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance, runelite, launchRuneLite, autoLaunch, setAutoLaunch],
  );
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeValue {
  const v = useContext(BridgeContext);
  if (!v) throw new Error('useBridge вне BridgeProvider');
  return v;
}
