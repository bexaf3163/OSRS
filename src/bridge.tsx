// Состояние связи с RuneLite: включена ли она, есть ли плагин, какой шаг показан в игре.
// Автоотметка из игры идёт сюда: шаг отмечается, в игру уходит следующий, страницы открывают его у себя.
// Отсюда же уровни навыков (быстрые варианты), счёт предметов (проверка вылета) и оптовый список для биржи,
// временная цель «🧭 к месту / в магазин», предметы этапа для банка, снаряжение и темп прокачки из игры.

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
/** Выбранные быстрые варианты: { 'S2-05': 'varrock-teleport' }. */
const BRANCH_KEY = 'osrs-put:branch-choice';
/** Последний оптовый список — уходит в игру снова, когда RuneLite перезапустили. */
const PLAN_KEY = 'osrs-put:shopping-plan';
const MOVES_KEY = 'osrs-put:moves';
const GEAR_KEY = 'osrs-put:last-gear';
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
  /** Последнее известное снаряжение, сумка и монеты — записано, пока игра шла; показывается, когда RuneLite закрыт. Не «сейчас». */
  lastGear: LastGear | null;
  /** Темп прокачки шага, показанного в игре. */
  pacing: PacingState | null;
  /** Временная цель в игре (место или магазин); null — стрелка ведёт к шагу. */
  navTarget: NavTargetPayload | null;
  /** Поставить временную цель. Без связи или при отказе плагина — ответ с причиной. */
  navigate: (target: NavTargetPayload) => Promise<NavResult | { ok: false; reason: 'off' }>;
  clearNav: () => Promise<void>;
  /** Когда игрок сам снял цель стрелки (мс); 0 — не снимал. Автоподготовка после этого не перехватывает стрелку. */
  userClearedAt: number;
  /** Версия плагина и совместимость с программой; null — нет связи. */
  plugin: { protocol: number | null; version: string | null; compat: PluginCompat } | null;
  /** Опыт по навыкам из игры (протокол 5); null — нет связи, старый плагин или передача выключена. */
  xp: PlayerStats | null;
  /** Названия завершённых квестов (протокол 5); null — неизвестно. */
  questsDone: string[] | null;
  /** Имя персонажа из игры (протокол 5). */
  player: string | null;
  /**
   * Часть снимка для игры (протокол 6): совет по снаряжению, предметы для банка, план подготовки. Уходит в плагин вместе
   * со всем остальным одним запросом; у плагина старше протокола 6 вызов ничего не делает — там свои отдельные запросы.
   */
  setPrepPart: <K extends 'gearHint' | 'bankTags' | 'plan'>(key: K, value: SnapshotParts[K]) => void;
  /** Какой профиль и персонаж сейчас: можно ли писать в профиль уровни и отметки из игры. */
  gate: ProfileGate;
  /** Опыта в час по навыку по замерам этого сеанса; null — замеров мало. */
  xpRate: (skill: string) => number | null;
  /** Сеанс: когда начался и с чего (первые уровни и опыт, закрытые шаги) — для сводки. */
  session: SessionBase;
  /** Текст для отчёта об ошибке: версии, связь, последние события моста. */
  diagnostics: () => Promise<string>;
  /** Недавние скачки персонажа (смерть, телепорт) — по ним включается режим восстановления. */
  moves: MoveEvent[];
  /** Где персонаж сейчас: свежий запрос к плагину (протокол 5); null — нет связи, не в игре или плагин не сообщает. */
  locate: () => Promise<{ x: number; y: number; plane: number } | null>;
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

/** Снимок снаряжения для показа без связи: чей, когда записан и что тогда было. */
export interface LastGear {
  at: number;
  player: string;
  gear: GearState;
}

/** Читается с недоверием: хранилище правят руками и другие версии. Мусор — как будто ничего не записывали. */
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

/** Выбор ветки по шагам: берём только пары «шаг → строка». */
function loadBranchChoice(): Record<string, string> {
  const data = loadJson<Record<string, unknown>>(BRANCH_KEY, {}) ?? {};
  return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

function saveJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* запомнится до перезапуска */ }
}

/** Одна строка о событии моста для отчёта: без содержимого сумки и банка. */
function logEvent(log: { t: number; text: string }[], e: BridgeEvent): void {
  const d = e as Record<string, unknown>;
  const n = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : v === null ? 0 : '?');
  let text: string = e.type;
  if (e.type === 'STEP_AUTO_COMPLETED') text += ` ${String(d.stepId)}`;
  else if (e.type === 'STATUS') text += ` inGame=${String(d.inGame)}${d.player ? ' player=да' : ''}`;
  else if (e.type === 'STATS' || e.type === 'XP') text += ` навыков=${n(d.stats ?? d.xp)}`;
  else if (e.type === 'QUESTS') text += ` квестов=${n(d.done)}`;
  else if (e.type === 'OWNED') text += ` предметов=${n(d.items)} банк=${String(d.bankSeen)}`;
  else if (e.type === 'PACING') text += ` ${String(d.stepId ?? '')}`;
  log.push({ t: Date.now(), text });
  if (log.length > 200) log.splice(0, log.length - 200);
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
  const { progress, steps, setStep, setLevels, notify, mode } = useStore();
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
  const [lastGear, setLastGear] = useState<LastGear | null>(loadLastGear);
  const [pacing, setPacing] = useState<PacingState | null>(null);
  const [xp, setXp] = useState<PlayerStats | null>(null);
  const [questsDone, setQuestsDone] = useState<string[] | null>(null);
  // Скачки персонажа (смерть, телепорт): хранятся короткое время — после перезапуска программы режим восстановления не теряется.
  const [moves, setMoves] = useState<MoveEvent[]>(() => (loadJson<{ list: MoveEvent[] }>(MOVES_KEY, null)?.list ?? []).filter((m) => m && typeof m.at === 'number' && Date.now() - m.at < 3_600_000).slice(-8));
  const [player, setPlayer] = useState<string | null>(null);
  // Сумка, надетое и монеты запоминаются, пока игра идёт: закрыли RuneLite или программу — последнее известное остаётся.
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
  /** Последние события моста — для кнопки «Диагностика». */
  const eventLog = useRef<{ t: number; text: string }[]>([]);
  const profiles = useProfiles();
  const gate = useMemo(() => profileGate(profiles, player), [profiles, player]);
  const [navTarget, setNavTargetState] = useState<NavTargetPayload | null>(null);
  const [plugin, setPlugin] = useState<BridgeValue['plugin']>(null);
  const features = useFeatures();
  /** Какие предметы этапа уже в плагине — чтобы не слать одно и то же при каждой отрисовке. */
  const bankSent = useRef('');
  /**
   * Цель стрелки знает плагин (с 2.11 он сообщает её: NAV_SET, NAV_DONE, /status). Номер растёт с каждым событием о
   * цели — ответ /status, отправленный до события, её уже не перетрёт.
   */
  const navSeq = useRef(0);
  /** Протокол плагина на связи — с 4 программа не ставит цель сама, а ждёт NAV_SET. */
  const pluginProtocol = useRef<number | null>(null);
  /**
   * Снимок состояния для игры (протокол 6): всё, что программа хочет видеть в игре, — одним сообщением. parts — что
   * должно быть там сейчас; sentKey — что плагин уже получил (то же не шлём); synced — снимок можно слать: шаг в parts
   * соответствует тому, что показывает программа (иначе пустой шаг снял бы в плагине шаг, о котором программа ещё не знает).
   */
  const snapshot = useRef({ parts: { ...EMPTY_PARTS } as SnapshotParts, seq: 0, sentKey: null as string | null, synced: false, timer: null as ReturnType<typeof setTimeout> | null });
  const setNavFromPlugin = useCallback((t: NavTargetPayload | null) => {
    navSeq.current++;
    setNavTargetState(t);
  }, []);

  // Обработчик событий живёт дольше отрисовки — свежие данные берёт из ссылок.
  const latest = useRef({ progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear, gate });
  latest.current = { progress, steps, setStep, activeStepId, branchChoice, notify, stats, gear, gate };
  /** Уже обработанные автоотметки: одно событие не отмечает шаг дважды и не двигает маршрут дважды. */
  const handled = useRef(new Set<string>());
  const nonce = useRef(0);

  /** Отправить снимок сейчас. true — плагин получил его (или то же уже было у него). */
  const flushSnapshot = useCallback(async (): Promise<boolean> => {
    const sn = snapshot.current;
    if (sn.timer) { clearTimeout(sn.timer); sn.timer = null; }
    const key = envelopeKey(sn.parts);
    if (key === sn.sentKey) return true;
    const seq = nextSeq(sn.seq);
    sn.seq = seq;
    const r = await postPrepPlan(buildEnvelope(sn.parts, seq));
    if (!r.ok) { if (sn.seq === seq) sn.sentKey = null; return false; }
    // Ответ запоздавшего снимка не должен затереть то, что отправлено после него.
    if (sn.seq === seq) sn.sentKey = key;
    return true;
  }, []);

  const setPrepPart = useCallback(<K extends 'gearHint' | 'bankTags' | 'plan'>(key: K, value: SnapshotParts[K]) => {
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, [key]: value };
    if (!supportsSnapshot(pluginProtocol.current) || !sn.synced) return;
    // Сумка и уровни меняются очередью событий — отправляем, когда всё улеглось.
    if (sn.timer) clearTimeout(sn.timer);
    sn.timer = setTimeout(() => { sn.timer = null; void flushSnapshot(); }, 350);
  }, [flushSnapshot]);

  /** Шаг в игру. У шага боя — с первой оценкой времени на противника по нынешнему оружию и уровням. */
  const sendStep = useCallback(async (step: Step, branch?: StepBranch): Promise<boolean> => {
    const { progress: p, stats: live, gear: g, steps: list } = latest.current;
    // Предметы текущего и ближайших шагов — плагин считает их заранее: «одна ходка» знает, что уже есть.
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

  /** Снять шаг в игре: при снимке — частью снимка, иначе — отдельным запросом. */
  const clearStep = useCallback(async (): Promise<void> => {
    if (!supportsSnapshot(pluginProtocol.current)) { await clearActiveStep(); return; }
    const sn = snapshot.current;
    sn.parts = { ...sn.parts, step: null, plan: null };
    sn.synced = true;
    await flushSnapshot();
  }, [flushSnapshot]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* запомнится до перезапуска */ }
  }, []);

  const onCompleted = useCallback((id: string) => {
    const { progress: p, steps: list, setStep: mark, activeStepId: active } = latest.current;
    // В игре другой персонаж, чем в этом профиле, — его квесты и уровни сюда не пишем.
    if (!gateAllows(latest.current.gate)) return;
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
      void clearStep();
      setActiveStepId(null);
    }
  }, [sendStep, clearStep]);

  /** Временная цель снята в игре: дошёл до места, получил предмет или её сняли. Шаг снова ведёт стрелку. */
  const onNavDone = useCallback((e: BridgeEvent) => {
    const { reason, label, itemName } = e as { reason?: unknown; label?: unknown; itemName?: unknown };
    setNavFromPlugin(null);
    const say = latest.current.notify;
    if (reason === 'obtained') say(`✓ ${typeof itemName === 'string' ? itemName : 'Предмет'} получен — стрелка снова ведёт к шагу`);
    else if (reason === 'arrived') say(`📍 На месте${typeof label === 'string' ? `: ${label}` : ''} — стрелка снова ведёт к шагу`);
    // Шаг заново — HUD и цель в игре точно те же, что до отклонения.
    const { activeStepId: active, steps: list, branchChoice: choice } = latest.current;
    const step = active ? list.find((s) => s.id === active) : undefined;
    if (step && reason !== 'cleared') void sendStep(step, chosenBranch(step, choice));
  }, [sendStep, setNavFromPlugin]);

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
      setXp(null);
      setQuestsDone(null);
      setPlayer(null);
      tracker.current.reset();
      setPlugin(null);
      // RuneLite закрыли — временной цели там больше нет.
      setNavFromPlugin(null);
      pluginProtocol.current = null;
      bankSent.current = '';
      // RuneLite закрыли — в новом плагине ничего нет: снимок уйдёт заново, когда программа снова свяжется.
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
      // Цель стрелки — какая в игре сейчас (её могли выбрать в игре или до перезапуска программы). Старый плагин
      // (до 2.11) цель не сообщает — тогда оставляем ту, что знает программа. Пришло событие о цели, пока ждали
      // ответа, — оно новее ответа.
      if (s.online && s.protocol !== null && s.protocol >= 4 && seq === navSeq.current) setNavTargetState(s.navTarget);
      if (s.stats) setStats(s.stats);
      if (s.xp) { setXp(s.xp); tracker.current.push(s.xp, Date.now()); }
      if (s.questsDone) setQuestsDone(s.questsDone);
      setPlayer(s.player);
      setGear(s.gear);
      // RuneLite перезапустили (или программу) — плагин шага не знает: отправляем снова. Тот же шаг не
      // шлём повторно, чтобы не сбросить в плагине путевые точки и замер темпа.
      const want = latest.current.activeStepId;
      if (s.online && supportsSnapshot(s.protocol)) {
        // Протокол 6: снимок полный и плагин не пересбрасывает тот же шаг — после перезапуска любой из сторон просто
        // отправляем всё заново: шаг, закупки, подсветку банка, совет и план.
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
        // RuneLite могли перезапустить — оптовый список для биржи отправляем снова (протокол 6 шлёт его в снимке).
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
        // Вход в игру и выход — повод заново спросить про Shortest Path.
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
      // Поток открыт — сверяемся с /status: индикатор должен показывать то, что отвечает плагин,
      // а шаг, показанный в игре, должен быть и в плагине.
      refresh(true);
    });
    return () => {
      alive = false;
      handle.close();
    };
  }, [enabled, onCompleted, onNavDone, sendStep, setNavFromPlugin, flushSnapshot]);

  // Предметы этапа показанного в игре шага — плагину, для мягкой подсветки в банке.
  // Уходят при смене шага (и этапа), после переподключения и когда функцию включили; выключили — подсветка снимается.
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
    // Шаг снова в игре — его новая автоотметка должна сработать, даже если раньше уже была.
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
    // Шаг уже показан в игре — обновляем цель сразу, без повторного нажатия.
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
    // Шаг в снимке ещё не известен (программа только запустилась) — снимок уйдёт, когда он будет; список сохранён.
    return sn.synced ? flushSnapshot() : true;
  }, [flushSnapshot]);

  const navigate = useCallback(async (target: NavTargetPayload) => {
    if (!enabled) return { ok: false as const, reason: 'off' as const };
    const r = await setNavTarget(target);
    // Плагин 2.11+ сам сообщит цель (NAV_SET) — и снимет её, если предмет уже в сумке (NAV_DONE): ставить её здесь
    // значит рисковать вернуть уже снятую. Старый плагин не сообщает — тогда запоминаем сами.
    if (r.ok && (pluginProtocol.current ?? 0) < 4) setNavTargetState(target);
    return r;
  }, [enabled]);

  const [userClearedAt, setUserClearedAt] = useState(0);
  const clearNav = useCallback(async () => {
    setUserClearedAt(Date.now());
    await clearNavTarget();
    setNavFromPlugin(null);
  }, [setNavFromPlugin]);

  // Уровни из игры сами попадают в поля уровней — только когда персонаж тот же, что в профиле.
  useEffect(() => {
    if (!features.levelsFromGame || !stats || !gateAllows(gate)) return;
    const known: Record<string, number> = {};
    for (const [id, v] of Object.entries(stats)) if (levelById.has(id)) known[id] = v;
    setLevels(known);
  }, [stats, features.levelsFromGame, gate, setLevels]);

  // Первый увиденный персонаж привязывается к профилю без имени.
  useEffect(() => {
    if (gate.kind !== 'link') return;
    const s = readProfiles();
    writeProfiles(linkPlayer(s, s.active, gate.player));
  }, [gate]);

  // Сводка сеанса считается от первых полученных значений; другой персонаж — новый сеанс.
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
    // Журнал плагина (с 2.23.0): сколько записано и какие странности нашёл сторож; подробности — npm run telemetry.
    const log = st.online ? await getTelemetry() : null;
    const done = Object.values(latest.current.progress.steps).filter((v) => v === 'done').length;
    const report = {
      программа: __APP_VERSION__,
      окно: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      связь: { включена: enabled, состояние: state, вИгре: inGame, плагин: plugin, шагВИгре: activeStepId },
      ответПлагина: {
        онлайн: st.online, протокол: st.protocol, версия: st.pluginVersion, шагУПлагина: st.activeStepId,
        уровней: st.stats ? Object.keys(st.stats).length : 0, опыт: Boolean(st.xp), квестов: st.questsDone?.length ?? null, персонаж: Boolean(st.player),
      },
      журналПлагина: log === null ? null : log.enabled
        ? { файл: log.file, событий: log.events, странностей: log.anomalies, обрезан: log.truncated, последнийСнимок: log.lastShot, последниеСтранности: log.recentAnomalies.map((x) => `${x.code}: ${x.message}`) }
        : { включён: false },
      настройки: { автозапуск: autoLaunch, возможности: features, режим: latest.current.progress.gameMode ?? null, профиль: gate.kind },
      прогресс: { выполнено: done, всего: latest.current.steps.length },
      события: eventLog.current.slice(-100).map((x) => `${new Date(x.t).toLocaleTimeString('ru-RU')} ${x.text}`),
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
  if (!v) throw new Error('useBridge вне BridgeProvider');
  return v;
}
