// Состояние связи с RuneLite: включена ли она, есть ли плагин, какой шаг показан в игре.
// Автоотметка из игры идёт сюда: шаг отмечается, в игру уходит следующий, страницы открывают его у себя.
// Отсюда же уровни навыков (быстрые варианты), счёт предметов (проверка вылета) и оптовый список для биржи,
// временная цель «🧭 к месту / в магазин», предметы этапа для банка, снаряжение и темп прокачки из игры.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerStats, Step, StepBranch } from './types';
import { useStore } from './store';
import { desktop, type RuneliteLaunch } from './lib/desktop';
import {
  checkStatus, clearActiveStep, clearNavTarget, connectEvents, parseGear, parsePacing, parseStats, planAutoComplete, setNavTarget,
  syncActiveStep, syncBankTags, syncShoppingPlan, toInGameTarget,
  type BridgeEvent, type GearState, type NavResult, type NavTargetPayload, type PacingState, type ShoppingPlanPayload,
} from './services/runeliteBridge';
import { parseOwned, type OwnedState } from './lib/checklist';
import { stageBankItemIds } from './lib/bankTags';
import { useFeatures } from './lib/features';
import { isClosed, openAfter } from './lib/next-step';
import { withKillEstimate } from './services/gearAdvisor';

const ENABLED_KEY = 'osrs-put:runelite-bridge';
const AUTOLAUNCH_KEY = 'osrs-put:runelite-autolaunch';
/** Выбранные быстрые варианты: { 'S2-05': 'varrock-teleport' }. */
const BRANCH_KEY = 'osrs-put:branch-choice';
/** Последний оптовый список — уходит в игру снова, когда RuneLite перезапустили. */
const PLAN_KEY = 'osrs-put:shopping-plan';
/** Шаг, показанный в игре: после перезапуска программы или RuneLite он возвращается в игру сам. */
const ACTIVE_KEY = 'osrs-put:active-step';
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
  /** Уровни из игры; null — нет связи или передача выключена в плагине. */
  stats: PlayerStats | null;
  /** Сколько есть предметов шага и списка закупок (сумка, банкноты, банк). */
  owned: OwnedState | null;
  /** В игре установлен Shortest Path — путь по земле рисует он. */
  shortestPath: boolean;
  /** Выбранный быстрый вариант шага (id) — с ним шаг уходит в игру. */
  branchChoice: Record<string, string>;
  chooseBranch: (step: Step, branchId: string | null) => void;
  /** Оптовый список — в подсказку на бирже (и запомнить до следующего запуска RuneLite). */
  syncPlan: (plan: ShoppingPlanPayload) => Promise<boolean>;
  /** Снаряжение, сумка и монеты из игры; null — неизвестно. */
  gear: GearState | null;
  /** Темп прокачки шага, показанного в игре. */
  pacing: PacingState | null;
  /** Временная цель в игре (место или магазин); null — стрелка ведёт к шагу. */
  navTarget: NavTargetPayload | null;
  /** Поставить временную цель. Без связи или при отказе плагина — ответ с причиной. */
  navigate: (target: NavTargetPayload) => Promise<NavResult | { ok: false; reason: 'off' }>;
  clearNav: () => Promise<void>;
}

const BridgeContext = createContext<BridgeValue | null>(null);

/** По умолчанию связь включена; без программы для ПК (страница при разработке) — выключена, моста там нет. */
function loadEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    // Хранилище недоступно — значение по умолчанию.
  }
  return Boolean(desktop()?.bridge);
}

/** Только объект: `null`, массив, строка в хранилище — как будто ничего не сохраняли. */
function loadJson<T extends object>(key: string, fallback: T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  } catch {
    // Нет хранилища или мусор — по умолчанию.
  }
  return fallback;
}

/** Выбор ветки по шагам: берём только пары «шаг → строка». */
function loadBranchChoice(): Record<string, string> {
  const data = loadJson<Record<string, unknown>>(BRANCH_KEY, {}) ?? {};
  return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* запомнится до перезапуска */ }
}

/** Выбранный быстрый вариант шага, если он у шага ещё есть. */
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
  started: '🎮 Запускаю RuneLite с мостом OSRS Path Bridge…',
  starting: 'RuneLite уже запускается…',
  running: 'RuneLite с мостом уже запущен',
};

export function BridgeProvider({ children }: { children: ReactNode }) {
  const { progress, steps, setStep, notify, mode } = useStore();
  const [enabled, setEnabledState] = useState(loadEnabled);
  const [autoLaunch, setAutoLaunchState] = useState(loadAutoLaunch);
  const runelite = desktop()?.runelite;
  const [state, setState] = useState<BridgeState>(enabled ? 'connecting' : 'off');
  const [inGame, setInGame] = useState(false);
  // Показанный в игре шаг переживает перезапуск программы, если он ещё не выполнен.
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
  const [navTarget, setNavTargetState] = useState<NavTargetPayload | null>(null);
  const features = useFeatures();
  /** Какие предметы этапа уже в плагине — чтобы не слать одно и то же при каждой отрисовке. */
  const bankSent = useRef('');

  // Обработчик событий живёт дольше отрисовки — свежие данные берёт из ссылок.
  const latest = useRef({ progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear });
  latest.current = { progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear };
  /** Уже обработанные автоотметки: одно событие не отмечает шаг дважды и не двигает маршрут дважды. */
  const handled = useRef(new Set<string>());
  const nonce = useRef(0);

  /** Шаг в игру. У шага боя — с первой оценкой времени на противника по нынешнему оружию и уровням. */
  const sendStep = useCallback((step: Step, branch?: StepBranch) => {
    const { progress: p, stats: live, gear: g } = latest.current;
    return syncActiveStep(withKillEstimate(step, { ...p.levels, ...(live ?? {}) }, g), undefined, branch);
  }, []);

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
      void sendStep(next, chosenBranch(next, latest.current.branchChoice)).then((ok) => setActiveStepId(ok ? next.id : null));
    } else if (plan.inGame === 'clear') {
      void clearActiveStep();
      setActiveStepId(null);
    }
  }, [sendStep]);

  /** Временная цель снята в игре: дошёл до места, получил предмет или её сняли. Шаг снова ведёт стрелку. */
  const onNavDone = useCallback((e: BridgeEvent) => {
    const { reason, label, itemName } = e as { reason?: unknown; label?: unknown; itemName?: unknown };
    setNavTargetState(null);
    const say = latest.current.notify;
    if (reason === 'obtained') say(`✓ ${typeof itemName === 'string' ? itemName : 'Предмет'} получен — стрелка снова ведёт к шагу`);
    else if (reason === 'arrived') say(`📍 На месте${typeof label === 'string' ? `: ${label}` : ''} — стрелка снова ведёт к шагу`);
    // Шаг заново — HUD и цель в игре точно те же, что до отклонения.
    const { activeStepId: active, steps: list, branchChoice: choice } = latest.current;
    const step = active ? list.find((s) => s.id === active) : undefined;
    if (step && reason !== 'cleared') void sendStep(step, chosenBranch(step, choice));
  }, [sendStep]);

  useEffect(() => {
    try {
      if (activeStepId) localStorage.setItem(ACTIVE_KEY, activeStepId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Хранилище недоступно — шаг просто не вернётся после перезапуска.
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
      // RuneLite закрыли — временной цели там больше нет.
      setNavTargetState(null);
      bankSent.current = '';
    };
    if (!enabled) {
      setState('off');
      forget();
      return;
    }
    setState('connecting');
    let alive = true;
    const refresh = (resync = false) => void checkStatus().then((s) => {
      if (!alive) return;
      setState(s.online ? 'online' : 'offline');
      setInGame(s.inGame);
      setShortestPath(s.shortestPath);
      if (s.stats) setStats(s.stats);
      setGear(s.gear);
      // RuneLite перезапустили (или программу) — плагин шага не знает: отправляем снова. Тот же шаг не
      // шлём повторно, чтобы не сбросить в плагине путевые точки и замер темпа.
      const want = latest.current.activeStepId;
      if (resync && s.online && want && s.activeStepId !== want) {
        const step = latest.current.steps.find((x) => x.id === want);
        if (step) void sendStep(step, chosenBranch(step, latest.current.branchChoice));
      }
    });
    const onEvent = (e: BridgeEvent) => {
      if (e.type === 'STATUS') {
        setInGame(Boolean((e as { inGame?: unknown }).inGame));
        // Вход в игру и выход — повод заново спросить про Shortest Path.
        refresh();
      } else if (e.type === 'STATS') setStats(parseStats((e as { stats?: unknown }).stats));
      else if (e.type === 'OWNED') setOwned(parseOwned(e));
      else if (e.type === 'GEAR') setGear(parseGear((e as { gear?: unknown }).gear));
      else if (e.type === 'PACING') setPacing(parsePacing(e));
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
      // Поток открыт — сверяемся с /status: индикатор должен показывать то, что отвечает плагин,
      // а шаг, показанный в игре, должен быть и в плагине.
      refresh(true);
      // RuneLite могли перезапустить — оптовый список для биржи отправляем снова.
      const plan = loadJson<ShoppingPlanPayload>(PLAN_KEY, null);
      if (Array.isArray(plan?.items) && plan.items.length) void syncShoppingPlan(plan);
    });
    return () => {
      alive = false;
      handle.close();
    };
  }, [enabled, onCompleted, onNavDone, sendStep]);

  // Предметы этапа показанного в игре шага — плагину, для мягкой подсветки в банке.
  // Уходят при смене шага (и этапа), после переподключения и когда функцию включили; выключили — подсветка снимается.
  useEffect(() => {
    if (state !== 'online') return;
    const step = activeStepId ? steps.find((s) => s.id === activeStepId) : undefined;
    const ids = features.bankTags && step ? stageBankItemIds(step.stage, mode) : [];
    const key = `${step?.stage ?? '-'}|${mode}|${ids.join(',')}`;
    if (key === bankSent.current || (!ids.length && !bankSent.current)) return;
    bankSent.current = key;
    void syncBankTags(step ? `stage-${step.stage}` : 'none', ids);
  }, [state, activeStepId, steps, mode, features.bankTags]);

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

  // Шаг, который ведёт в игре, отметили в программе (кнопкой или галочкой) — в игру сразу уходит следующий
  // открытый шаг. Автоотметку из игры это не повторяет: её шаг уже в handled, и onCompleted двигает сам.
  // Только переход «был открыт → закрыт»: уже пройденный шаг, показанный в игре вручную, остаётся на месте.
  const activeWasOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStepId) return;
    if (!isClosed(progress, activeStepId)) { activeWasOpen.current = activeStepId; return; }
    if (activeWasOpen.current !== activeStepId || handled.current.has(activeStepId)) return;
    const next = openAfter(steps, progress, activeStepId);
    const branch = next ? chosenBranch(next, latest.current.branchChoice) : undefined;
    if (!next || !toInGameTarget(next, branch)) {
      void clearActiveStep();
      setActiveStepId(null);
      return;
    }
    handled.current.delete(next.id);
    setActiveStepId(next.id);
    void sendStep(next, branch);
  }, [activeStepId, progress, steps, sendStep]);

  const pointInGame = useCallback(async (step: Step): Promise<PointResult> => {
    const branch = chosenBranch(step, latest.current.branchChoice);
    if (!toInGameTarget(step, branch)) return 'empty';
    const ok = await sendStep(step, branch);
    if (!ok) return 'offline';
    // Шаг снова в игре — его новая автоотметка должна сработать, даже если раньше уже была.
    handled.current.delete(step.id);
    setActiveStepId(step.id);
    return 'ok';
  }, [sendStep]);

  const clear = useCallback(async () => {
    await clearActiveStep();
    setActiveStepId(null);
  }, []);

  const chooseBranch = useCallback((step: Step, branchId: string | null) => {
    setBranchChoice((prev) => {
      const next = { ...prev };
      if (branchId) next[step.id] = branchId;
      else delete next[step.id];
      saveJson(BRANCH_KEY, next);
      latest.current.branchChoice = next;
      return next;
    });
    // Шаг уже показан в игре — обновляем цель сразу, без повторного нажатия.
    if (latest.current.activeStepId === step.id) {
      const branch = branchId ? step.branches?.find((b) => b.id === branchId) : undefined;
      void sendStep(step, branch);
    }
  }, [sendStep]);

  const syncPlan = useCallback(async (plan: ShoppingPlanPayload) => {
    saveJson(PLAN_KEY, plan);
    return syncShoppingPlan(plan);
  }, []);

  const navigate = useCallback(async (target: NavTargetPayload) => {
    if (!enabled) return { ok: false as const, reason: 'off' as const };
    const r = await setNavTarget(target);
    if (r.ok) setNavTargetState(target);
    return r;
  }, [enabled]);

  const clearNav = useCallback(async () => {
    await clearNavTarget();
    setNavTargetState(null);
  }, []);

  const value = useMemo<BridgeValue>(
    () => ({
      enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance,
      canLaunch: Boolean(runelite), launchRuneLite: () => launchRuneLite(), autoLaunch, setAutoLaunch,
      stats, owned, shortestPath, branchChoice, chooseBranch, syncPlan, gear, pacing, navTarget, navigate, clearNav,
    }),
    [enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance, runelite, launchRuneLite, autoLaunch, setAutoLaunch,
      stats, owned, shortestPath, branchChoice, chooseBranch, syncPlan, gear, pacing, navTarget, navigate, clearNav],
  );
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeValue {
  const v = useContext(BridgeContext);
  if (!v) throw new Error('useBridge вне BridgeProvider');
  return v;
}
