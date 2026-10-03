// «Еда на бой»: сколько бьёт противник шага и когда есть. Числа — с вики (threats.json, build-threats): максимальный удар,
// скорость, лечение еды. От себя только правило порога: есть, пока HP не упало ниже двух максимальных ударов.

import threatsJson from '../data/threats.json';
import type { Step } from '../types';

export interface Hit { n: number; label: string }
export interface Threat { page: string; version?: string; hits: Hit[]; speedTicks: number; hitpoints: number; combat: number }
export interface Food { name: string; heals: number }

export const THREATS = threatsJson.threats as unknown as Record<string, Threat>;
export const FOODS = threatsJson.foods as Food[];
export const THREATS_DATE = threatsJson.generatedAt;

/** Название противников шага: foes и threats; те, о ком вики-данных нет (корова), пропускаются. */
export function threatKeys(step: Pick<Step, 'foes' | 'threats'>): string[] {
  return [...new Set([...(step.foes ?? []), ...(step.threats ?? [])])].filter((k) => THREATS[k]);
}

/**
 * Обычный максимальный удар: удары «без защиты» (драконье пламя без щита) в расчёт порога не входят — их отдельно
 * предупреждаем текстом. Возвращает также самый сильный удар и признак, что он исключён.
 */
export function typicalHit(t: Threat): { typical: number; worst: number; excluded: Hit | null } {
  const isUnprotected = (h: Hit) => /dragonfire/i.test(h.label) && !/with/i.test(h.label);
  const kept = t.hits.filter((h) => !isUnprotected(h));
  const typical = Math.max(...(kept.length ? kept : t.hits).map((h) => h.n));
  const worst = Math.max(...t.hits.map((h) => h.n));
  return { typical, worst, excluded: t.hits.find(isUnprotected) ?? null };
}

/** Самый сильный обычный удар противников шага для HUD; 0 — у шага нет противников с вики-данными. */
export function stepMaxHit(step: Pick<Step, 'foes' | 'threats'>): number {
  return Math.max(0, ...threatKeys(step).map((k) => typicalHit(THREATS[k]).typical));
}

export interface FoodView {
  key: string;
  threat: Threat;
  typical: number;
  worst: number;
  excluded: Hit | null;
  /** Секунд между ударами. */
  everySeconds: number;
  /** Есть, когда здоровье ниже этого. */
  eatBelow: number;
  /** Сколько максимальных ударов подряд выдержит текущее здоровье; null — здоровье неизвестно. */
  survives: number | null;
}

export function viewThreat(key: string, hp: number | undefined): FoodView {
  const threat = THREATS[key];
  const { typical, worst, excluded } = typicalHit(threat);
  return {
    key, threat, typical, worst, excluded,
    everySeconds: Math.round(threat.speedTicks * 0.6 * 10) / 10,
    eatBelow: typical * 2,
    survives: hp ? Math.max(0, Math.ceil(hp / typical) - 1) : null,
  };
}

/** Еда из сумки по названию (с учётом количества), лучшая по лечению сверху. */
export function foodInBag(items: readonly { name: string; count?: number }[] | null): { food: Food; count: number }[] {
  if (!items) return [];
  return FOODS.flatMap((f) => {
    const count = items.filter((i) => i.name === f.name).reduce((s, i) => s + (i.count ?? 1), 0);
    return count > 0 ? [{ food: f, count }] : [];
  }).sort((a, b) => b.food.heals - a.food.heals);
}

/** Какая еда одним укусом перекрывает максимальный удар, самая слабая сверху (экономнее). */
export function foodsCovering(hit: number): Food[] {
  return FOODS.filter((f) => f.heals >= hit).sort((a, b) => a.heals - b.heals);
}
