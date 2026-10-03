// Связь с плагином RuneLite «OSRS Path Bridge» на этом компьютере: http://127.0.0.1:38282.
// Запросы идут через главный процесс Electron (preload → ipc): плагин принимает только их, а запрос
// со страницы в браузере (с заголовком Origin) отклоняет. Удалённого сервера нет: мост слушает только loopback.

import type { InGameTarget, PacingSkill, PlayerStats, Progress, Step, StepBranch, StepPacing } from '../types';
import { desktop } from '../lib/desktop';
import { isClosed, openAfter } from '../lib/next-step';
import { parseAmount, preflightItems } from '../lib/checklist';
import { watchedItems } from '../lib/branching';
import { stepMaxHit } from '../lib/foodAdvice';
import { npcSpot, stepPlaces } from '../lib/stepPlaces';

export const BRIDGE_ORIGIN = 'http://127.0.0.1:38282';
/** Заголовок, без которого плагин не принимает POST. Его ставит главный процесс Electron (electron/runelite-bridge.cjs). */
export const BRIDGE_HEADER = 'X-OSRS-Path';

export interface BridgeStatus {
  online: boolean;
  inGame: boolean;
  /** Уровни навыков из игры; null — не в игре, плагин старый или передача выключена в его настройках. */
  stats: PlayerStats | null;
  /** Установлен и включён плагин Shortest Path — маршрут по земле рисует он. */
  shortestPath: boolean;
  /** Снаряжение, сумка и монеты; null — не в игре, плагин старый или подсказки апгрейда выключены. */
  gear: GearState | null;
  /** Шаг, который сейчас показывает плагин; null — никакого (например, RuneLite только что перезапустили). */
  activeStepId: string | null;
  /** Версия протокола моста; null — плагин до 2.9 (поля нет). */
  protocol: number | null;
  pluginVersion: string | null;
  /** Куда ведёт временная цель в игре (с 2.11); null — к шагу или плагин не сообщает. */
  navTarget: NavTargetPayload | null;
  /** Опыт по навыкам (протокол 5); null — не в игре, плагин старый или передача выключена. */
  xp: PlayerStats | null;
  /** Названия завершённых квестов (протокол 5); null — неизвестно. */
  questsDone: string[] | null;
  /** Имя персонажа (протокол 5); null — не в игре или плагин не сообщает. */
  player: string | null;
  /** Где стоит персонаж (протокол 5): координаты игры; null — неизвестно. */
  pos: { x: number; y: number; plane: number } | null;
}

/**
 * Протокол, который ждёт программа. Плагин старше — программа просит его обновить: новые адреса и поля он не
 * знает. Плагин без поля protocol — до 2.9: работает (основные адреса те же), но без новых функций.
 * 4 (2.11) — список «Что нужно» на экране игры; у плагина 2.10 (протокол 3) его нет.
 */
export const APP_PROTOCOL = 5;

/** Чего нет у старого плагина — для предупреждения «обнови плагин»: с какого протокола что появилось. */
export function missingWithPlugin(protocol: number | null): string[] {
  const p = protocol ?? 1;
  const out: string[] = [];
  if (p < 5) out.push('опыт, квесты и имя персонажа из игры (синхронизация с аккаунтом, профили, время до цели)');
  if (p < 4) out.push('список «Что нужно» на экране игры (клик по строке — стрелка и путь туда)');
  if (p < 3) out.push('боковая панель «OSRS Путь» в RuneLite');
  if (p < 2) out.push('большая стрелка и оценка предметов в банке');
  return out;
}

export type PluginCompat = 'ok' | 'legacy' | 'older' | 'newer';

export function pluginCompat(protocol: number | null): PluginCompat {
  if (protocol === null) return 'legacy';
  if (protocol < APP_PROTOCOL) return 'older';
  return protocol > APP_PROTOCOL ? 'newer' : 'ok';
}

/** Предмет из игры: надетый или в сумке. */
export interface GearItem {
  id: number;
  name: string;
  count?: number;
  /** Слот надетого предмета, как в RuneLite (EquipmentInventorySlot): weapon, head, amulet… Старый плагин его не шлёт. */
  slot?: string;
}

/** Снаряжение и монеты для подсказки апгрейда. null в поле — этот контейнер игра ещё не прислала. */
export interface GearState {
  equipment: GearItem[] | null;
  inventory: GearItem[] | null;
  coins: number | null;
  /** Монеты в банке; null — банк в этой сессии не открывали. */
  bankCoins: number | null;
  /**
   * Оценка предметов по ценам биржи (без монет) — сколько выручишь, продав: в сумке и на себе, и в банке.
   * null — неизвестно (банк не открывали или плагин до 2.9). Это не деньги: показывается отдельно, с «~».
   */
  carriedValue?: number | null;
  bankValue?: number | null;
}

/** Темп прокачки шага из игры (событие PACING). */
export interface PacingState {
  stepId: string;
  skill: PacingSkill;
  targetLevel: number;
  xp: number;
  remainingXp: number;
  actionsLeft: number;
  /** null — замеров мало, время не выдумываем. */
  actionsPerMinute: number | null;
  etaSeconds: number | null;
  /** Время — первая оценка из данных шага, а не замер. */
  estimated: boolean;
  almost: boolean;
  done: boolean;
  /** Бой: навыки шага, которые ещё не дошли до цели, кроме показанного. У одного навыка — пусто. */
  left: PacingSkill[];
}

/** Временная цель поверх шага: место с карты или магазин для апгрейда. */
export interface NavTargetPayload {
  label: string;
  x: number;
  y: number;
  plane: number;
  npcNames?: string[];
  /** Предмет, за которым идём: цель снимется, когда он окажется в сумке или надет. */
  itemName?: string;
  itemId?: number;
  stepId?: string;
}

export type NavResult =
  | { ok: true }
  | { ok: false; reason: 'offline' }
  /** Плагин ответил, но отказал: функция выключена в его настройках или старая версия плагина. */
  | { ok: false; reason: 'refused'; message: string };

export type BridgeEvent =
  | { type: 'STEP_AUTO_COMPLETED'; stepId: string }
  | { type: 'STATUS'; inGame: boolean; player?: string | null }
  | { type: 'XP'; xp?: PlayerStats | null }
  | { type: 'QUESTS'; done?: string[] | null }
  | { type: 'STATS'; stats?: PlayerStats | null }
  | { type: 'OWNED'; bankSeen: boolean; items: unknown[] }
  | { type: string; [key: string]: unknown };

/** Все адреса плагина, к которым ходит приложение. Программа для ПК пропускает только их (electron/runelite-bridge.cjs). */
export const BRIDGE_PATHS = ['/status', '/active-step', '/clear', '/shopping-plan', '/nav-target', '/bank-tags', '/gear-hint'] as const;
export type BridgePath = typeof BRIDGE_PATHS[number];

export interface BridgeResponse {
  ok: boolean;
  status: number;
  data?: unknown;
}

/** Способ достучаться до моста: через главный процесс Electron; в тестах — подменный. */
export interface BridgeTransport {
  request(method: 'GET' | 'POST', path: BridgePath, body?: unknown): Promise<BridgeResponse>;
  /** Поток событий. Возвращает функцию закрытия. onError — поток оборвался или не открылся. */
  openEvents(onEvent: (e: BridgeEvent) => void, onOpen: () => void, onError: () => void): () => void;
}

/** Предмет для проверки вылета у банка. */
export interface ChecklistPayloadItem {
  name: string;
  id?: number;
  count: number;
  heals?: number;
}

/** Что уходит в плагин: цель шага плюс код, название, проверка вылета и предметы из условий быстрых вариантов. */
export type ActiveStepPayload = InGameTarget & {
  stepId: string;
  title: string;
  checklist?: ChecklistPayloadItem[];
  watchItems?: string[];
  pacing?: StepPacing;
  guide?: StepGuidePayload;
  /** Самый сильный обычный удар противников шага (вики): HUD предупредит о здоровье ниже двух таких ударов. */
  maxHit?: number;
  useOn?: { item: string; target: string; kind?: string }[];
};

/**
 * Для боковой панели «OSRS Путь» в RuneLite (с протокола 3): что нужно на шаг и где это взять, и точки шага —
 * «Путь сюда» ставит временную цель, стрелка и Shortest Path ведут туда, по приходу стрелка возвращается к шагу.
 */
export interface StepGuidePayload {
  items: { name: string; nameRu?: string; id?: number; count?: number; where?: string; inStep?: boolean }[];
  places: { x: number; y: number; plane: number; label: string; npc?: string; items?: string[] }[];
  /** Быстрый путь шага по порядку: когда всё собрано, игра покажет последний пункт («Отдай всё Hetty…»). */
  steps?: string[];
  /** Этапы квеста: плагин читает переменную квеста и показывает только текущий этап. */
  stage?: StagePayload;
}

export interface StagePayload {
  kind: 'varp' | 'varbit';
  id: number;
  stages: { at: number; steps: { t: string; x?: number; y?: number; plane?: number; has?: string }[]; /** Номер точки в places. */ go?: number; items?: { name: string; nameRu?: string; id?: number; count?: number; where?: string; inStep?: boolean }[] }[];
}

/** Панель RuneLite: предметы шага с «где взять» и точки — главная (NPC, старт) и места из карты шага. */
export function stepGuide(step: Step, branch?: StepBranch): StepGuidePayload {
  const items = (step.itemsRequired ?? []).map((i) => {
    const n = parseAmount(i.amount);
    return {
      name: i.nameEn,
      ...(i.nameRu && i.nameRu !== i.nameEn ? { nameRu: i.nameRu } : {}),
      ...(i.wikiItemId !== undefined ? { id: i.wikiItemId } : {}),
      ...(n !== null ? { count: n } : {}),
      ...(i.howToGet ? { where: i.howToGet } : {}),
      ...(i.inStep ? { inStep: true } : {}),
    };
  });
  // Места — те же, что точки на карте шага в программе: точка шага, места с карты, откуда предметы, NPC квеста.
  const places: StepGuidePayload['places'] = stepPlaces(step, branch).map((p) => ({
    x: p.x, y: p.y, plane: p.plane, label: p.label, ...(p.npc ? { npc: p.npc } : {}), ...(p.items?.length ? { items: p.items } : {}),
  }));
  // Отправляется всегда, даже пустой: без guide плагин считает программу старой и просит её обновить
  // (в 2.10 шаги без предметов и с одной точкой уходили без него — панель зря писала «Обнови программу»).
  const all = (step.quickSteps ?? []).filter((q) => q.length > 0 && q.length <= 500);
  // Длинный маршрут: плагину нужен только последний пункт («Дальше»), а список ограничен — первые пятнадцать и последний.
  const steps = all.length > 16 ? [...all.slice(0, 15), all[all.length - 1]] : all;
  const stage = stagePayload(step, places);
  return { items: items.slice(0, 64), places: places.slice(0, 64), ...(steps.length ? { steps } : {}), ...(stage ? { stage } : {}) };
}

const near = (a: { x: number; y: number; plane: number }, b: { x: number; y: number; plane: number }) =>
  a.plane === b.plane && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

/**
 * Этапы квеста для игры. Точка этапа (NPC по имени или явная) встаёт в places — той же строкой «Куда идти», по которой
 * стрелка и Shortest Path уже умеют вести; этап ссылается на неё номером. Неизвестный NPC — этап без точки.
 */
export function stagePayload(step: Step, places: StepGuidePayload['places']): StagePayload | undefined {
  const qs = step.questStages;
  if (!qs || !qs.stages.length) return undefined;
  const stages: StagePayload['stages'] = [];
  for (const st of [...qs.stages].sort((a, b) => a.at - b.at).slice(0, 40)) {
    let go: number | undefined;
    if (st.go) {
      let p: StepGuidePayload['places'][number] | undefined;
      if (typeof st.go === 'string') {
        const n = npcSpot(st.go, step.id);
        if (n) p = { x: n.x, y: n.y, plane: n.plane, label: `${st.go} — ${n.area}`, npc: st.go };
      } else {
        p = { x: st.go.x, y: st.go.y, plane: st.go.plane, label: st.go.label, ...(st.go.npc ? { npc: st.go.npc } : {}) };
      }
      if (p) {
        let at = places.findIndex((q) => near(q, p!));
        if (at >= 0) {
          if (p.npc && !places[at].npc) places[at] = { ...places[at], npc: p.npc };
        } else if (places.length < 64) {
          places.push(p);
          at = places.length - 1;
        }
        if (at >= 0) go = at;
      }
    }
    stages.push({
      at: st.at, steps: st.do.slice(0, 40).map((l) => ({ t: l.t, ...(l.at ? { x: l.at[0], y: l.at[1], plane: l.at[2] } : {}), ...(l.has ? { has: l.has } : {}) })), ...(go !== undefined ? { go } : {}),
      ...(st.items ? { items: st.items.slice(0, 12).map((i) => ({ ...i })) } : {}),
    });
  }
  return { kind: qs.var[0], id: qs.var[1], stages };
}

/** Оптовый список для подсказки на бирже: name — английское название, count — сколько нужно всего. */
export interface ShoppingPlanPayload {
  items: { name: string; id?: number; count: number }[];
}

export function parseEvent(text: string): BridgeEvent | null {
  try {
    const e = JSON.parse(text) as unknown;
    if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string') return e as BridgeEvent;
  } catch {
    // Не JSON — пропускаем.
  }
  return null;
}

/**
 * Цель шага для игры. Явный inGame из маршрута главнее; без него — точка старта и места сбора с карты шага,
 * чтобы стрелка и клетки работали и у шагов, для которых подсветку ещё не расписали.
 * branch — выбранный быстрый вариант: его точка заменяет точку шага, а путевые точки обычного пути не нужны.
 */
export function toInGameTarget(step: Step, branch?: StepBranch, extraWatch: string[] = []): ActiveStepPayload | null {
  const g = step.inGame ?? {};
  const start = step.mapLocation;
  const alt = branch?.replacementTarget;
  const worldPoint = alt
    ? { x: alt.x, y: alt.y, plane: alt.plane, label: alt.label }
    : g.worldPoint ?? (start ? { x: start.x, y: start.y, plane: start.plane, label: start.label } : undefined);
  const groundTiles = g.groundTiles ?? step.resourceSpots?.map((p) => ({ x: p.x, y: p.y, plane: p.plane, label: p.label }));
  const payload: ActiveStepPayload = { ...g, stepId: step.id, title: step.title };
  if (worldPoint) payload.worldPoint = worldPoint;
  if (groundTiles?.length) payload.groundTiles = groundTiles;
  if (alt) delete payload.pathWaypoints;
  const goal = alt ? (alt.label.startsWith(branch!.label) ? alt.label : `${branch!.label}: ${alt.label}`) : g.goal ?? worldPoint?.label;
  if (goal) payload.goal = goal;
  const checklist = preflightItems(step).map((i) => ({ name: i.nameEn, id: i.id, count: i.count, heals: i.heals }));
  if (checklist.length) payload.checklist = checklist;
  // Ещё — предметы ближайших шагов (одна ходка): плагин сообщает, сколько их есть, и их видно заранее.
  const watch = [...new Set([...watchedItems(step), ...extraWatch])].slice(0, 40);
  if (watch.length) payload.watchItems = watch;
  if (step.pacing) payload.pacing = step.pacing;
  const hit = stepMaxHit(step);
  if (hit) payload.maxHit = hit;
  if (step.useOn?.length) payload.useOn = step.useOn.slice(0, 8);
  const guide = stepGuide(step, branch);
  payload.guide = guide;
  // Шаг без точки, но с предметами (закупка) — тоже в игру: список «Что нужно» с «где взять» там полезен.
  const empty = !worldPoint && !groundTiles?.length && !g.npcNames?.length && !g.objectNames?.length
    && !g.dialogChoices?.length && !g.highlightItems?.length && !g.completionTrigger && !checklist.length && !step.pacing
    && !guide.items.length && !guide.places.length;
  return empty ? null : payload;
}

/** Уровни из события или ответа /status: только числа, только осмысленные. */
export function parseStats(raw: unknown): PlayerStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: PlayerStats = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 126) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Опыт из события XP или ответа /status: целые числа от 0 до 200 млн по навыкам. */
export function parseXp(raw: unknown): PlayerStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: PlayerStats = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z]{3,16}$/.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 200_000_000) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Названия завершённых квестов: строки до 80 знаков, не больше 300 штук. */
export function parseQuests(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((q): q is string => typeof q === 'string' && q.length > 0 && q.length <= 80).slice(0, 300);
  return out;
}

/** Положение персонажа из /status: три целых числа в пределах карты игры. */
export function parsePos(raw: unknown): { x: number; y: number; plane: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
  return ok(r.x, 0, 20000) && ok(r.y, 0, 20000) && ok(r.plane, 0, 3) ? { x: r.x, y: r.y, plane: r.plane } : null;
}

/** Имя персонажа: до 12 знаков (так в игре), без управляющих символов. */
export function parsePlayer(raw: unknown): string | null {
  return typeof raw === 'string' && /^[\w \-\u00a0]{1,12}$/.test(raw) ? raw.replace(/\u00a0/g, ' ') : null;
}

const int = (v: unknown, min = 0): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null);

function gearItems(raw: unknown): GearItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GearItem[] = [];
  for (const r of raw) {
    const o = r as { id?: unknown; name?: unknown; count?: unknown; slot?: unknown } | null;
    const id = int(o?.id, 1);
    if (id === null || typeof o?.name !== 'string') continue;
    const count = int(o.count, 1);
    const slot = typeof o.slot === 'string' && /^[a-z]{2,10}$/.test(o.slot) ? o.slot : undefined;
    out.push({ id, name: o.name, ...(count !== null ? { count } : {}), ...(slot ? { slot } : {}) });
  }
  return out;
}

/** Снаряжение из /status или события GEAR. null — ничего не известно (Gson плагина не пишет null-поля). */
export function parseGear(raw: unknown): GearState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const g: GearState = {
    equipment: gearItems(o.equipment), inventory: gearItems(o.inventory), coins: int(o.coins), bankCoins: int(o.bankCoins),
    // Оценки нет у плагина до 2.9 и пока банк не открывали (Gson не пишет null) — поле тогда не заводим.
    ...(int(o.carriedValue) !== null ? { carriedValue: int(o.carriedValue) } : {}),
    ...(int(o.bankValue) !== null ? { bankValue: int(o.bankValue) } : {}),
  };
  return g.equipment || g.inventory || g.coins !== null ? g : null;
}

const PACING_SKILLS = new Set<PacingSkill>(['fishing', 'woodcutting', 'cooking', 'mining', 'attack', 'strength', 'defence']);

/** Событие PACING. null — у шага нет темпа или он выключен в плагине. */
export function parsePacing(e: unknown): PacingState | null {
  const o = e as { stepId?: unknown; pacing?: Record<string, unknown> | null } | null;
  const p = o?.pacing;
  if (!p || typeof o?.stepId !== 'string' || !PACING_SKILLS.has(p.skill as PacingSkill)) return null;
  const xp = int(p.xp);
  const remainingXp = int(p.remainingXp);
  const actionsLeft = int(p.actionsLeft);
  const targetLevel = int(p.targetLevel, 1);
  if (xp === null || remainingXp === null || actionsLeft === null || targetLevel === null) return null;
  const apm = typeof p.actionsPerMinute === 'number' && p.actionsPerMinute > 0 ? p.actionsPerMinute : null;
  const left = Array.isArray(p.left) ? p.left.filter((k): k is PacingSkill => PACING_SKILLS.has(k as PacingSkill)) : [];
  return {
    stepId: o.stepId, skill: p.skill as PacingSkill, targetLevel, xp, remainingXp, actionsLeft,
    actionsPerMinute: apm, etaSeconds: int(p.etaSeconds), estimated: p.estimated === true, almost: p.almost === true, done: p.done === true, left,
  };
}

// ---------- Транспорты ----------

interface DesktopBridgeApi {
  request(method: string, path: string, body?: unknown): Promise<BridgeResponse>;
  openEvents(onEvent: (data: string) => void, onState: (state: 'open' | 'closed') => void): () => void;
}

function desktopTransport(api: DesktopBridgeApi): BridgeTransport {
  return {
    request: (method, path, body) => api.request(method, path, body).catch(() => ({ ok: false, status: 0 })),
    openEvents(onEvent, onOpen, onError) {
      let done = false;
      const close = api.openEvents(
        (data) => { const e = parseEvent(data); if (e) onEvent(e); },
        (state) => {
          if (done) return;
          if (state === 'open') onOpen();
          else { done = true; onError(); }
        },
      );
      return () => { done = true; close(); };
    },
  };
}

/** Без программы для ПК (страница в браузере при разработке) моста нет: всё работает, плагин «не отвечает». */
const offlineTransport: BridgeTransport = {
  request: async () => ({ ok: false, status: 0 }),
  openEvents(_onEvent, _onOpen, onError) {
    const timer = setTimeout(onError, 0);
    return () => clearTimeout(timer);
  },
};

export function defaultTransport(): BridgeTransport {
  const api = (desktop() as unknown as { bridge?: DesktopBridgeApi } | undefined)?.bridge;
  return api ? desktopTransport(api) : offlineTransport;
}

// ---------- Запросы ----------

export async function checkStatus(t: BridgeTransport = defaultTransport()): Promise<BridgeStatus> {
  const res = await t.request('GET', '/status');
  const d = res.data as {
    status?: string; inGame?: boolean; stats?: unknown; shortestPath?: unknown; activeStepId?: unknown; protocol?: unknown; pluginVersion?: unknown;
    navTarget?: unknown; xp?: unknown; questsDone?: unknown; player?: unknown; pos?: unknown;
  } | undefined;
  const online = res.ok && d?.status === 'ok';
  return {
    online,
    inGame: Boolean(online && d?.inGame),
    stats: online ? parseStats(d?.stats) : null,
    shortestPath: Boolean(online && d?.shortestPath === true),
    gear: online ? parseGear(d) : null,
    activeStepId: online && typeof d?.activeStepId === 'string' ? d.activeStepId : null,
    protocol: online && typeof d?.protocol === 'number' && Number.isInteger(d.protocol) && d.protocol > 0 ? d.protocol : null,
    pluginVersion: online && typeof d?.pluginVersion === 'string' && d.pluginVersion.length <= 20 ? d.pluginVersion : null,
    navTarget: online ? parseNavTarget(d?.navTarget) : null,
    xp: online ? parseXp(d?.xp) : null,
    questsDone: online ? parseQuests(d?.questsDone) : null,
    player: online ? parsePlayer(d?.player) : null,
    pos: online ? parsePos(d?.pos) : null,
  };
}

/**
 * Временная цель из плагина (NAV_SET, /status): её могли выбрать в игре — в списке «Что нужно» или в панели.
 * Только проверенные поля; что-то не так — null (программа тогда просто не отмечает цель).
 */
export function parseNavTarget(raw: unknown): NavTargetPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
  if (typeof r.label !== 'string' || !r.label || r.label.length > 200 || !int(r.x) || !int(r.y) || !int(r.plane)) return null;
  const out: NavTargetPayload = { label: r.label, x: r.x as number, y: r.y as number, plane: r.plane as number };
  if (Array.isArray(r.npcNames) && r.npcNames.every((n) => typeof n === 'string')) out.npcNames = r.npcNames as string[];
  if (typeof r.itemName === 'string') out.itemName = r.itemName;
  if (int(r.itemId)) out.itemId = r.itemId as number;
  if (typeof r.stepId === 'string') out.stepId = r.stepId;
  return out;
}

export const getBridgeStatus = checkStatus;

/** Уровни навыков из игры или null. Для живых обновлений есть событие STATS. */
export async function getPlayerStats(t: BridgeTransport = defaultTransport()): Promise<PlayerStats | null> {
  return (await checkStatus(t)).stats;
}

/** Отправить шаг в игру. false — моста нет или у шага нечего показывать. */
export async function syncActiveStep(step: Step, t: BridgeTransport = defaultTransport(), branch?: StepBranch, extraWatch: string[] = []): Promise<boolean> {
  const payload = toInGameTarget(step, branch, extraWatch);
  if (!payload) return false;
  return (await t.request('POST', '/active-step', payload)).ok;
}

/** Оптовый список — в подсказку на бирже. Пустой список убирает подсказку. */
export async function syncShoppingPlan(plan: ShoppingPlanPayload, t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/shopping-plan', plan)).ok;
}

export async function clearActiveStep(t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/clear')).ok;
}

/**
 * Временная цель в игру: стрелка, маршрут Shortest Path и HUD ведут к месту, шаг возвращается сам,
 * когда игрок дошёл или получил предмет. Координаты — только из поиска мест, не «на глаз».
 */
export async function setNavTarget(target: NavTargetPayload, t: BridgeTransport = defaultTransport()): Promise<NavResult> {
  const res = await t.request('POST', '/nav-target', target);
  if (res.ok) return { ok: true };
  if (res.status === 0) return { ok: false, reason: 'offline' };
  const message = (res.data as { error?: unknown } | undefined)?.error;
  return {
    ok: false,
    reason: 'refused',
    message: typeof message === 'string' ? message
      : res.status === 404 ? 'плагин OSRS Path Bridge старой версии — обнови его' : `плагин ответил ${res.status}`,
  };
}

export async function clearNavTarget(t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/nav-target', { clear: true })).ok;
}

/** Предметы этапа — для мягкой подсветки в банке. Пустой список снимает подсветку. */
export async function syncBankTags(stageId: string, itemIds: number[], t: BridgeTransport = defaultTransport()): Promise<boolean> {
  return (await t.request('POST', '/bank-tags', { stageId, itemIds })).ok;
}

/** Совет по снаряжению для плагина: строка HUD, про какие предметы сказать счёт в банке, что подсветить. */
export interface GearHintPayload {
  text?: string;
  watchItems: string[];
  highlightItems: string[];
}

/**
 * Совет по снаряжению — в игру (POST /gear-hint). 'old' — плагин старой версии (404): он совета не знает,
 * это не ошибка; 'off' — подсказки апгрейда выключены в настройках плагина (409).
 */
export async function setGearHint(hint: GearHintPayload | null, t: BridgeTransport = defaultTransport()): Promise<'ok' | 'offline' | 'old' | 'off'> {
  const res = await t.request('POST', '/gear-hint', hint ?? { clear: true });
  if (res.ok) return 'ok';
  if (res.status === 0) return 'offline';
  return res.status === 404 ? 'old' : 'off';
}

// ---------- Поток событий с переподключением ----------

/** Паузы между попытками: 1, 2, 4, 8, 16, 30, 30… секунд. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export interface EventsHandle {
  close(): void;
}

/**
 * Держит поток /events открытым: оборвался — пауза и новая попытка, пауза растёт до 30 секунд.
 * onState сообщает, есть ли связь; close() останавливает всё, в том числе запланированные попытки.
 */
export function connectEvents(
  onEvent: (e: BridgeEvent) => void,
  onState: (online: boolean) => void,
  t: BridgeTransport = defaultTransport(),
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancel: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
): EventsHandle {
  let attempt = 0;
  let closed = false;
  let timer: unknown;
  let closeStream: (() => void) | null = null;

  // Номер текущего потока: сигналы от прежних (уже брошенных) потоков не считаются.
  let generation = 0;
  const open = () => {
    if (closed) return;
    const mine = ++generation;
    const current = () => !closed && mine === generation;
    closeStream = t.openEvents(
      (e) => { if (current()) onEvent(e); },
      () => { if (!current()) return; attempt = 0; onState(true); },
      () => {
        if (!current()) return;
        generation++;
        closeStream = null;
        onState(false);
        timer = schedule(open, backoffMs(attempt++));
      },
    );
  };
  open();
  return {
    close() {
      closed = true;
      cancel(timer);
      closeStream?.();
      closeStream = null;
    },
  };
}

// ---------- Автоотметка ----------

export interface AutoCompletePlan {
  /** Отметить шаг выполненным. */
  mark: boolean;
  /** Следующий незакрытый шаг — его открывают страницы. */
  next?: Step;
  /** Что отправить в игру после отметки: следующий шаг, очистить или ничего не трогать. */
  inGame: 'sync-next' | 'clear' | 'keep';
}

/**
 * Что делать с событием STEP_AUTO_COMPLETED. handled — уже обработанные события: повтор ничего не меняет.
 * В игру уходит следующий шаг, только если в игре был показан именно выполненный — чужой не перебиваем.
 */
export function planAutoComplete(steps: Step[], p: Progress, stepId: string, activeStepId: string | null, handled: ReadonlySet<string>): AutoCompletePlan {
  const idle: AutoCompletePlan = { mark: false, inGame: 'keep' };
  if (handled.has(stepId)) return idle;
  const step = steps.find((s) => s.id === stepId);
  if (!step || isClosed(p, stepId)) return idle;
  const next = openAfter(steps, p, stepId);
  if (activeStepId !== stepId) return { mark: true, next, inGame: 'keep' };
  return { mark: true, next, inGame: next && toInGameTarget(next) ? 'sync-next' : 'clear' };
}
