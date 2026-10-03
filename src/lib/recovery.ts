// Режим восстановления: игрок умер, нажал телепорт посреди шага или иначе оказался вдали от того места, где шаг.
// Маршрут предполагает, что игрок стоит где нужно, — после срыва «бей зомби» или «иди к лестнице» были бы насмешкой.
// Плагин присылает событие MOVED: DEATH (персонаж умер) и TELEPORT (скачок на 20+ клеток за тик). Здесь решается,
// срыв это или нормальный путь: телепорт к шагу срывом не считается, а возрождение в Lumbridge вдали от шага — считается.
// Чистая логика: время и клетки приходят снаружи. Что делать дальше, строит план подготовки (prepPlan.ts) —
// вещи могли пропасть, и он это сам увидит по сумке и банку; здесь только «срыв ли это» и «что сказать».

import type { Step } from '../types';

export interface Point { x: number; y: number; plane: number }

export interface MoveEvent {
  kind: 'DEATH' | 'TELEPORT';
  /** Откуда: у смерти — где умер. */
  from: Point | null;
  /** Куда попал; у смерти нет — следом придёт TELEPORT возрождения. */
  to: Point | null;
  /** Когда программа получила событие, мс. */
  at: number;
}

/** Куда возрождает после смерти и куда ведёт Home Teleport у большинства игроков. */
export const RESPAWN: Point = { x: 3222, y: 3218, plane: 0 };
/** Не дальше стольких клеток от точки возрождения — «в Лумбридже». */
export const HUB_RADIUS = 15;
/** Дальше стольких клеток от шага — «шаг далеко». */
export const FAR = 100;
/** Ближе стольких — уже у шага, восстановление кончилось. */
export const NEAR = 40;
/** Смерть и возрождение идут подряд: возрождение позже смерти не больше чем на столько мс — это та же смерть. */
export const DEATH_WINDOW_MS = 3 * 60_000;
/** Через сколько режим гаснет сам. */
export const RECOVERY_TTL_MS = 30 * 60_000;
const UNDERGROUND = 6400;

export type RecoveryReason = 'DEATH' | 'TELEPORT';

export interface Recovery {
  reason: RecoveryReason;
  /** Когда случилось, мс. */
  since: number;
  /** Где игрок оказался (Lumbridge); null — ещё не возродился. */
  landedAt: Point | null;
  /** Где умер (только при смерти). */
  diedAt: Point | null;
  /** Клеток до шага по прямой; null — не посчитать (под землёй, нет точки шага). */
  distance: number | null;
  /** Куда идти обратно: точка шага. */
  target: Point | null;
}

const surfaceY = (y: number) => (y >= UNDERGROUND + 1000 ? y - UNDERGROUND : y);
const dist = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(surfaceY(a.y) - surfaceY(b.y)));
const underground = (p: Point) => p.y >= UNDERGROUND + 1000;

/** Точка шага: явная точка для игры, иначе стартовая точка на карте. */
export function stepPoint(step: Pick<Step, 'inGame' | 'mapLocation'>): Point | null {
  const w = step.inGame?.worldPoint ?? step.mapLocation;
  return w ? { x: w.x, y: w.y, plane: w.plane } : null;
}

export const inHub = (p: Point | null | undefined): boolean => !!p && !underground(p) && dist(p, RESPAWN) <= HUB_RADIUS;

export interface RecoveryInput {
  /** События MOVED по порядку (новые в конце). */
  moves: readonly MoveEvent[];
  step: Pick<Step, 'inGame' | 'mapLocation'>;
  now: number;
  /** Игрок нажал «Это не срыв»: всё, что случилось раньше этого момента, не считается. */
  dismissedAt?: number;
  /** Где игрок сейчас, если известно: рядом с шагом — восстановление окончено. */
  here?: Point | null;
}

/**
 * Срыв или нет. Смерть — всегда срыв (вещи могли остаться в могиле), если игрок не оказался сразу у шага. Телепорт —
 * только когда он привёл в Lumbridge, а шаг далеко от него: «Home Teleport посреди квеста». Телепорт ближе к шагу
 * (Varrock Teleport к квесту в Varrock) — нормальный путь, а не срыв.
 */
export function detectRecovery(i: RecoveryInput): Recovery | null {
  const last = i.moves[i.moves.length - 1];
  if (!last) return null;
  if (i.now - last.at > RECOVERY_TTL_MS) return null;
  if (i.dismissedAt !== undefined && i.dismissedAt >= last.at) return null;
  const target = stepPoint(i.step);
  const death = [...i.moves].reverse().find((m) => m.kind === 'DEATH' && last.at - m.at <= DEATH_WINDOW_MS && m.at <= last.at);
  const landedAt = last.kind === 'TELEPORT' ? last.to : null;
  // Где игрок: по данным игры; ещё не возродился — возродится в Lumbridge (место смерти для этого не годится).
  const place = i.here ?? landedAt ?? (death ? RESPAWN : null);
  const distance = place && target && !underground(target) && !underground(place) ? dist(place, target) : null;
  if (distance !== null && distance <= NEAR) return null;
  if (death) {
    // Умер вблизи шага и возродился где угодно — всё равно срыв; но если шаг как раз у возрождения, делать нечего.
    if (target && landedAt && dist(landedAt, target) <= NEAR) return null;
    return { reason: 'DEATH', since: death.at, landedAt, diedAt: death.from, distance, target };
  }
  if (last.kind !== 'TELEPORT') return null;
  // Одинокий телепорт: срыв, только если он привёл в Lumbridge, а шаг далеко от него.
  if (!inHub(last.to) || !target || underground(target) || dist(RESPAWN, target) <= FAR) return null;
  return { reason: 'TELEPORT', since: last.at, landedAt, diedAt: null, distance, target };
}

export interface RecoveryStep { label: string; detail?: string }

/**
 * Что сказать игроку. Порядок: вещи, недостающее, возвращение. «Недостающее» программа берёт из плана подготовки,
 * поэтому пустой список здесь значит «ничего не пропало — просто возвращайся».
 */
export function recoverySteps(r: Recovery, missing: number, stepId: string): RecoveryStep[] {
  const out: RecoveryStep[] = [];
  if (r.reason === 'DEATH') {
    out.push({
      label: 'Забери вещи, которые остались после смерти',
      detail: 'Они лежат на могиле там, где ты умер; если могилу не успел забрать — вещи у Смерти в Death’s Office. Сначала могила, потом банк.',
    });
  } else {
    out.push({ label: 'Проверь сумку и снаряжение', detail: 'Телепорт переместил тебя в Lumbridge: всё, что было с тобой, осталось при тебе.' });
  }
  out.push(missing > 0
    ? { label: `Возьми недостающее: ${missing} ${missing === 1 ? 'пункт' : missing < 5 ? 'пункта' : 'пунктов'}`, detail: 'Список ниже уже пересчитан по тому, что у тебя осталось.' }
    : { label: 'Недостающего нет — всё, что нужно шагу, при тебе' });
  out.push({ label: `Вернись к шагу ${stepId}`, detail: 'Стрелка в игре ведёт к месту шага; «Как добраться» подскажет телепорт или каноэ.' });
  return out;
}
