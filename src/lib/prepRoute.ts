// Маршрут подготовки к шагу: что именно сделать до выхода, в каком порядке, и возврат к шагу, когда всё готово.
// Строится из готовности (readiness.ts) — одно состояние, никаких своих проверок. Подготовка не ломает основной
// маршрут: каждый заход за подготовкой — «объезд» (DetourFrame) с условием возврата; глубина объездов не больше трёх,
// повтор того же объезда запрещён, а выполненное не отправляет игрока туда снова. Ничего не покупает.

import type { Step } from '../types';
import type { ReadinessAction, RequirementStatus, StepReadiness } from './readiness';

/** Насколько срочно: сейчас, скоро (следующие шаги), потом. */
export type Urgency = 'NOW' | 'SOON' | 'LATER';
/** Обязательно, рекомендуется, по желанию — по желанию игрока заставлять нельзя. */
export type Need = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

export type TaskKind = 'block' | 'quest' | 'stat' | 'buy' | 'money' | 'bank';

export interface PrepTask {
  /** Стабильный ключ: одна и та же задача — один и тот же id при любом пересчёте. */
  id: string;
  kind: TaskKind;
  label: string;
  detail?: string;
  /** Чем меньше, тем раньше: 1 закрыт, 2 выживание, 3 обязательное снаряжение и предметы, 4 уровни, 5 экономия времени, 6 удобство, 7 по желанию. */
  priority: number;
  need: Need;
  urgency: Urgency;
  action?: ReadinessAction;
  /** Для задачи «добери уровень»: навык и цель — по ним подбирается способ прокачки. */
  stat?: { skill: string; min: number };
  /** Для задач «забрать» и «купить»: английские названия предметов по порядку. */
  items?: string[];
  /** Из каких строк готовности собрана задача. */
  from: RequirementStatus[];
}

export interface PrepRoute {
  stepId: string;
  /** Все задачи по порядку выполнения. */
  tasks: PrepTask[];
  /** Главное сейчас: одно. */
  primary: PrepTask | null;
  /** Не больше двух следующих — остальное свёрнуто. */
  next: PrepTask[];
  hidden: number;
  /** Куда возвращаемся, когда всё сделано. */
  returnTo: string;
  /** Подготовки нет: шаг готов (проблем среди обязательного нет). */
  ready: boolean;
}

const BLOCK = new Set(['mode', 'step', 'qp']);

/** Обязательное ли требование: «нужно по ходу квеста» (hard=false) начать шаг не мешает. */
const needOf = (r: RequirementStatus): Need => (r.hard ? 'REQUIRED' : 'OPTIONAL');

function priorityOf(r: RequirementStatus): number {
  if (!r.hard) return 6;
  if (BLOCK.has(r.kind) || r.kind === 'quest') return 1;
  if (r.kind === 'item' || r.kind === 'coins') return 3;
  if (r.kind === 'skill') return 4;
  return 5;
}

export function buildPrepRoute(r: StepReadiness, step: Pick<Step, 'id'>): PrepRoute {
  const tasks: PrepTask[] = [];
  const bank: RequirementStatus[] = [];
  const buy: RequirementStatus[] = [];
  for (const p of r.problems) {
    if (p.state === 'BANK') {
      bank.push(p);
    } else if (p.kind === 'item' && p.hard) {
      buy.push(p);
    } else if (p.kind === 'coins') {
      tasks.push({ id: 'money', kind: 'money', label: `Монеты: ${p.label}`, detail: p.detail, priority: 3, need: 'REQUIRED', urgency: 'NOW', ...(p.action ? { action: p.action } : {}), from: [p] });
    } else if (p.kind === 'skill') {
      tasks.push({ id: `stat:${p.label.toLowerCase()}`, kind: 'stat', label: p.label, detail: p.detail, priority: priorityOf(p), need: needOf(p), urgency: p.hard ? 'NOW' : 'LATER', ...(p.action ? { action: p.action } : {}), ...(p.stat ? { stat: p.stat } : {}), from: [p] });
    } else if (p.kind === 'quest' || p.kind === 'step' || p.kind === 'qp' || p.kind === 'mode') {
      tasks.push({ id: `${p.kind}:${p.label.toLowerCase()}`, kind: p.kind === 'quest' ? 'quest' : 'block', label: p.label, detail: p.detail, priority: priorityOf(p), need: needOf(p), urgency: 'NOW', ...(p.action ? { action: p.action } : {}), from: [p] });
    } else {
      tasks.push({ id: `${p.kind}:${p.label.toLowerCase()}`, kind: 'buy', label: p.label, detail: p.detail, priority: priorityOf(p), need: needOf(p), urgency: p.hard ? 'NOW' : 'LATER', ...(p.action ? { action: p.action } : {}), from: [p] });
    }
  }
  // Всё, что лежит в банке, — один заход: «забери из банка: A, B, монеты».
  if (bank.length) {
    const nav = bank.find((b) => b.action?.kind === 'nav')?.action;
    tasks.push({
      id: 'bank', kind: 'bank', label: `Забери из банка: ${bank.map((b) => b.label).join(', ')}`, priority: 3, need: 'REQUIRED', urgency: 'NOW',
      ...(nav ? { action: nav } : {}), items: bank.flatMap((b) => (b.item ? [b.item] : [])), from: bank,
    });
  }
  // Всё, что надо купить, — одна закупка.
  if (buy.length) {
    tasks.push({
      id: 'buy', kind: 'buy', label: `Купи: ${buy.map((b) => b.label).join(', ')}`, priority: 3, need: 'REQUIRED', urgency: 'NOW',
      action: { kind: 'link', label: '🛒 В закупки', href: '#/shopping' }, items: buy.flatMap((b) => (b.item ? [b.item] : [])), from: buy,
    });
  }
  tasks.sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const required = tasks.filter((t) => t.need === 'REQUIRED');
  const shown = required.length ? tasks : [];
  return {
    stepId: step.id,
    tasks: shown,
    primary: shown[0] ?? null,
    next: shown.slice(1, 3),
    hidden: Math.max(0, shown.length - 3),
    returnTo: step.id,
    ready: required.length === 0,
  };
}

/**
 * Какие задачи подготовки ещё не выполнены: и те, что точно не сделаны, и те, что проверить нечем. Объезд снимается,
 * только когда задача выполнена по данным, а не когда данные пропали (связь оборвалась, страница перезагрузилась):
 * «неизвестно» — не «готово».
 */
export function openTaskIds(r: StepReadiness, step: Pick<Step, 'id'>): Set<string> {
  const ids = new Set(buildPrepRoute(r, step).tasks.map((t) => t.id));
  for (const u of r.unknown) {
    if (u.kind === 'skill') ids.add(`stat:${u.label.toLowerCase()}`);
    else if (u.kind === 'item') { ids.add('buy'); ids.add('bank'); }
    else if (u.kind === 'coins') { ids.add('money'); ids.add('bank'); }
    else ids.add(`${u.kind}:${u.label.toLowerCase()}`);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Объезды: стек с условием возврата. Хранится между запусками (одна запись на профиль).

export const MAX_DETOUR_DEPTH = 3;

export interface DetourFrame {
  sourceStepId: string;
  /** id задачи подготовки (PrepTask.id), ради которой начат объезд. */
  detourId: string;
  reason: string;
  startedAt: number;
  /** Человеческое условие возврата: «Fishing 20 достигнут». */
  returnCondition: string;
  /** Игрок сам снял стрелку: автоподготовка её больше не ставит, пока он не нажмёт «Продолжить». */
  paused?: boolean;
}

export interface PrepState {
  stack: DetourFrame[];
  /** Выполненные объезды «шаг:задача»: второй раз сами не предлагаем. */
  done: string[];
}

export const emptyPrep = (): PrepState => ({ stack: [], done: [] });

const doneKey = (stepId: string, detourId: string) => `${stepId}:${detourId}`;

export type StartResult =
  | { ok: true; state: PrepState }
  /** Объезд не начат: глубина или цикл — задачи остаются списком на экране. */
  | { ok: false; state: PrepState; reason: 'DEPTH' | 'CYCLE' | 'DONE_BEFORE' };

export function startDetour(state: PrepState, frame: DetourFrame): StartResult {
  if (state.stack.some((f) => f.detourId === frame.detourId && f.sourceStepId === frame.sourceStepId)) return { ok: false, state, reason: 'CYCLE' };
  if (state.done.includes(doneKey(frame.sourceStepId, frame.detourId))) return { ok: false, state, reason: 'DONE_BEFORE' };
  if (state.stack.length >= MAX_DETOUR_DEPTH) return { ok: false, state, reason: 'DEPTH' };
  return { ok: true, state: { ...state, stack: [...state.stack, frame] } };
}

/**
 * Сверка с готовностью: объезд, чья задача больше не открыта, выполнен — снимается со стека, а выполненное
 * запоминается. Возвращает шаг, к которому пора вернуться (источник верхнего объезда, если он остался, иначе
 * источник последнего снятого).
 */
export function reconcile(state: PrepState, openTasks: (stepId: string) => Set<string> | null): { state: PrepState; returnTo: string | null } {
  const stack = [...state.stack];
  const done = new Set(state.done);
  let returnTo: string | null = null;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const open = openTasks(top.sourceStepId);
    // Готовность шага неизвестна (шаг пропал, нет данных) — объезд оставляем: ничего не теряем молча.
    if (open === null) break;
    if (open.has(top.detourId)) break;
    done.add(doneKey(top.sourceStepId, top.detourId));
    stack.pop();
    returnTo = top.sourceStepId;
  }
  return { state: { stack, done: [...done].slice(-200) }, returnTo: stack.length ? stack[stack.length - 1].sourceStepId : returnTo };
}

export const PREP_KEY = 'osrs-put:prep';

/** Битые данные в хранилище — пустое состояние: ничего не падает. */
export function parsePrep(raw: string | null): PrepState {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stack = Array.isArray(d.stack)
      ? d.stack.filter((f): f is DetourFrame => !!f && typeof f === 'object'
        && typeof (f as DetourFrame).sourceStepId === 'string' && typeof (f as DetourFrame).detourId === 'string'
        && typeof (f as DetourFrame).reason === 'string' && typeof (f as DetourFrame).startedAt === 'number'
        && typeof (f as DetourFrame).returnCondition === 'string').slice(0, MAX_DETOUR_DEPTH)
      : [];
    const done = Array.isArray(d.done) ? d.done.filter((x): x is string => typeof x === 'string').slice(-200) : [];
    return { stack, done };
  } catch {
    return emptyPrep();
  }
}
