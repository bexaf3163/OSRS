// Автоочередь подготовки: сама выстраивает, что сделать до шага, и сама ведёт стрелку к первому, потом ко второму —
// пока не останется ничего, и тогда возвращает к шагу. Игроку не нужно нажимать «Начать подготовку».
//
// Правила безопасности:
//  — стрелку ставим только когда у задачи есть место (банк, магазин, место прокачки) и у игрока нет другой цели;
//  — если игрок сам снял стрелку — очередь на паузе, пока он не нажмёт «Продолжить»;
//  — «неизвестно» не запускает ничего и не закрывает ничего (данных нет — молчим);
//  — повторы и циклы запрещены теми же правилами объездов (prepRoute.startDetour); выполненное заново не предлагается;
//  — ничего не покупается и не делается в игре за игрока: стрелка и подсказка, решает он.

import type { GameMode } from '../types';
import type { ReadinessAction } from './readiness';
import { startDetour, type DetourFrame, type PrepRoute, type PrepState, type PrepTask } from './prepRoute';
import type { PlayerState } from './playerState';
import { adviseTraining } from './trainingRouter';
import { exchangeNav, trainingNav } from './trainingNav';
import type { PlayStyle } from './playStyle';

export interface QueueTask extends PrepTask {
  /** Куда вести стрелку; null — места нет (квест, шаг, монеты): только подсказка. */
  guide: ReadinessAction | null;
  /** Название способа прокачки — для задач «добери уровень». */
  method?: string;
}

export interface PrepQueue {
  stepId: string;
  tasks: QueueTask[];
  ready: boolean;
}

export interface QueueContext {
  state: PlayerState;
  mode: GameMode;
  style: PlayStyle;
}

/** К маршруту подготовки добавляет «куда вести»: банк — как есть, уровень — место способа, покупка — Grand Exchange. */
export function buildQueue(route: PrepRoute, ctx: QueueContext): PrepQueue {
  const tasks = route.tasks.map((t): QueueTask => {
    if (t.action?.kind === 'nav') return { ...t, guide: t.action };
    if (t.kind === 'stat' && t.stat) {
      const advice = adviseTraining({ skill: t.stat.skill, target: t.stat.min, state: ctx.state, mode: ctx.mode, style: ctx.style });
      const best = advice.best;
      if (best) {
        const nav = trainingNav(best.method);
        return { ...t, method: best.method.name, guide: nav ? { kind: 'nav', label: `🧭 К месту: ${nav.label}`, target: nav } : null };
      }
      return { ...t, guide: null };
    }
    if (t.kind === 'buy' && t.items?.length) {
      const nav = exchangeNav(t.items[0]);
      return { ...t, guide: nav ? { kind: 'nav', label: `🧭 К бирже — ${t.items[0]}`, target: nav } : null };
    }
    return { ...t, guide: null };
  });
  return { stepId: route.stepId, tasks, ready: route.ready };
}

// ---------------------------------------------------------------------------
// Решение: что делать очереди сейчас

export interface AutoInput {
  queue: PrepQueue | null;
  stepId: string;
  prep: PrepState;
  /** Автоподготовка включена в настройках. */
  enabled: boolean;
  /** Есть живая связь с игрой: без неё «не хватает» может оказаться «не знаю». */
  online: boolean;
  /** Сейчас в игре уже стоит какая-то цель стрелки. */
  navActive: boolean;
  announce: 'quiet' | 'full';
  now: number;
  /** Когда последний раз перенацеливали эту задачу: ключ → время. Не чаще раза в минуту. */
  recent: ReadonlyMap<string, number>;
  /** Отказы игрока в этом сеансе: «шаг:задача». */
  declined: ReadonlySet<string>;
}

export type AutoDecision =
  /** Начать объезд и поставить стрелку. */
  | { kind: 'start'; task: QueueTask; frame: DetourFrame; state: PrepState }
  /** Объезд идёт, а стрелку плагин снял (предмет взят, место достигнуто), задача ещё не готова — поставить к следующему. */
  | { kind: 'renav'; task: QueueTask; key: string }
  /** Следующая задача без места — просто сказать, что дальше. */
  | { kind: 'announce'; task: QueueTask; key: string };

export const RENAV_GAP_MS = 60_000;

const targetKey = (a: ReadinessAction | null): string => (a?.kind === 'nav' ? `${a.target.x},${a.target.y},${a.target.itemName ?? ''}` : '');

export function decideAuto(i: AutoInput): AutoDecision | null {
  const { queue, stepId } = i;
  if (!i.enabled || !i.online || !queue || queue.stepId !== stepId || queue.ready) return null;
  const mine = i.prep.stack.filter((f) => f.sourceStepId === stepId);
  if (mine.some((f) => f.paused)) return null;

  if (mine.length) {
    // Объезд идёт: перенацеливаем, только если стрелки нет, а задача ещё открыта и у неё есть место.
    const top = mine[mine.length - 1];
    const task = queue.tasks.find((t) => t.id === top.detourId);
    if (!task || i.navActive || task.guide?.kind !== 'nav') return null;
    const key = `${stepId}:${task.id}:${targetKey(task.guide)}`;
    const last = i.recent.get(key);
    if (last !== undefined && i.now - last < RENAV_GAP_MS) return null;
    return { kind: 'renav', task, key };
  }

  const task = queue.tasks.find((t) => t.need === 'REQUIRED');
  if (!task || i.declined.has(`${stepId}:${task.id}`)) return null;
  if (i.navActive) return null;
  if (task.guide?.kind === 'nav') {
    const frame: DetourFrame = {
      sourceStepId: stepId, detourId: task.id, reason: task.label, startedAt: i.now,
      returnCondition: `${task.label} — готово`,
    };
    const res = startDetour(i.prep, frame);
    return res.ok ? { kind: 'start', task, frame, state: res.state } : null;
  }
  return i.announce === 'full' ? { kind: 'announce', task, key: `${stepId}:${task.id}` } : null;
}
