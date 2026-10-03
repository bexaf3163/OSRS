// Вес и бег. От веса сумки и надетого зависит, как быстро тает шкала бега (Run energy). Формула — OSRS Wiki «Run energy»:
//   потеря за тик = floor(60 + 67 · clamp(вес, 0..64) / 64) × (1 − Agility / 300).
// Вес ниже нуля (лёгкая одежда) считается как ноль, выше 64 кг — как 64. Значит, самый тяжёлый персонаж выдыхается
// не «в разы», а примерно вдвое быстрее лёгкого (127 против 60), а двадцатью килограммами выигрыш — около трети.
// Agility в отношении сокращается, поэтому «во сколько раз дольше» от него не зависит.
// Вес предметов — из вики (weights.json, npm run build-weights). Нет веса — предмета нет в файле, его вес неизвестен,
// и программа не называет число, которого не знает. Ничего не делает за игрока: советует и ведёт к банку.

import weightsJson from '../data/weights.json';
import type { Step } from '../types';
import { nameKey } from './checklist';
import type { PlayerState } from './playerState';
import { FOODS } from './foodAdvice';

const FOOD_KEYS = new Set(FOODS.map((f) => nameKey(f.name)));

const WEIGHTS = new Map(Object.entries((weightsJson as { items: Record<string, number> }).items).map(([n, kg]) => [nameKey(n), kg]));

/** Вес одного предмета, кг; undefined — в вики не указан или предмета нет в базе. */
export const weightOf = (name: string): number | undefined => WEIGHTS.get(nameKey(name));

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Единицы энергии, теряемые за тик бега при весе kg (без учёта Agility). */
export const energyUnits = (kg: number): number => Math.floor(60 + (67 * clamp(kg, 0, 64)) / 64);

/** Во сколько раз дольше продержится бег при весе `to`, чем при весе `from`. */
export const runLengthRatio = (from: number, to: number): number => energyUnits(from) / energyUnits(to);

/** Лёгкий предмет не стоит разговора. */
const MIN_ITEM_KG = 1;
/** Сколько килограммов считается «заметно» и «много». */
export const LIGHT_SAVING = 3;
export const HEAVY_SAVING = 10;

export interface WeightItem {
  name: string;
  /** Вес всех штук, кг. */
  kg: number;
  count: number;
  from: 'EQUIPPED' | 'INVENTORY';
}

export interface WeightAdvice {
  /** Вес сейчас, кг (из игры); null — неизвестен. */
  current: number | null;
  /** Вес без лишнего; null — текущий вес неизвестен. */
  after: number | null;
  /** Сколько снимется, кг. */
  saving: number;
  /** Во сколько раз дольше продержится бег; null — текущий вес неизвестен. */
  ratio: number | null;
  /** Что оставить в банке. */
  items: WeightItem[];
  /** Много: заметно удлиняет бег; немного: мелочь; нет: ничего советовать не надо. */
  level: 'HEAVY' | 'LIGHT' | 'NONE';
}

export const NO_WEIGHT_ADVICE: WeightAdvice = { current: null, after: null, saving: 0, ratio: null, items: [], level: 'NONE' };

const COMBAT_SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'hitpoints']);

/**
 * Шаг без боя: ни противников, ни угроз, не прокачка боевого навыка и не шаг со снаряжением (там броню как раз надевают).
 * Сомнение — «не без боя»: лучше не посоветовать снять, чем оставить игрока без брони там, где она нужна.
 */
export const isCalm = (step: Pick<Step, 'type' | 'foes' | 'threats' | 'targets'>): boolean =>
  step.type !== 'gear' && !step.foes?.length && !step.threats?.length && !(step.targets ?? []).some((t) => COMBAT_SKILLS.has(t.skill));

/**
 * Что можно оставить в банке на шаге без боя. needed — английские названия того, что нужно этому шагу и ближайшим
 * (план подготовки): их не трогаем. Боевой шаг — не советуем ничего: броня там нужна.
 */
export function weightAdvice(step: Pick<Step, 'type' | 'foes' | 'threats' | 'targets'>, state: PlayerState, needed: ReadonlySet<string>): WeightAdvice {
  const current = state.weight.known ? state.weight.value : null;
  if (!isCalm(step)) return { ...NO_WEIGHT_ADVICE, current };
  const keep = new Set([...needed].map((n) => nameKey(n)));
  const items: WeightItem[] = [];
  for (const name of Object.values(state.equipment)) {
    const w = weightOf(name);
    if (w !== undefined && w >= MIN_ITEM_KG && !keep.has(nameKey(name))) items.push({ name, kg: w, count: 1, from: 'EQUIPPED' });
  }
  if (state.bagItems.known) {
    for (const b of state.bagItems.value) {
      const w = weightOf(b.name);
      // Деньги и еда нужны в пути; остальное тяжёлое, чего шаги не просят, — лишнее.
      if (w === undefined || keep.has(nameKey(b.name)) || nameKey(b.name) === 'coins' || FOOD_KEYS.has(nameKey(b.name))) continue;
      if (w * b.count >= MIN_ITEM_KG * 2) items.push({ name: b.name, kg: Math.round(w * b.count * 1000) / 1000, count: b.count, from: 'INVENTORY' });
    }
  }
  items.sort((a, b) => b.kg - a.kg);
  const saving = Math.round(items.reduce((s, i) => s + i.kg, 0) * 1000) / 1000;
  const after = current === null ? null : Math.round((current - saving) * 1000) / 1000;
  const ratio = current === null || after === null ? null : runLengthRatio(current, after);
  const level = saving >= HEAVY_SAVING ? 'HEAVY' : saving >= LIGHT_SAVING ? 'LIGHT' : 'NONE';
  return { current, after, saving, ratio, items: level === 'NONE' ? [] : items, level };
}

/** Килограммы по-русски: «9,98 кг» → «10 кг», «12,3 кг». */
export const kgText = (kg: number): string => `${(Math.round(kg * 10) / 10).toLocaleString('ru-RU')} кг`;
