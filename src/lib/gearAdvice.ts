// Разбор снаряжения для экрана: уровни (из игры главнее введённых вручную), надетое, сумка и банк из RuneLite,
// цены биржи, бесплатен ли шлагбаум Al Kharid, что маршрут ещё купит и с кем дерётся шаг. Сам разбор —
// чистая функция adviseGear; здесь только сбор входных данных.

import { useEffect, useMemo, useState } from 'react';
import type { Progress, Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from './next-step';
import { getGePrice } from '../services/pricesApi';
import { adviseGear, gearData, routeNeeds, stepFoes, type AdvisorInput, type GearAdvice } from '../services/gearAdvisor';

/** Цены биржи всех предметов снаряжения. Сервис цен скачивает их одним файлом и держит 5 минут. */
async function loadGearPrices(): Promise<Map<number, number>> {
  const rows = await Promise.all(gearData.items.filter((i) => i.tradeable).map(async (i) => [i.id, (await getGePrice(i.id))?.buyPrice] as const));
  return new Map(rows.filter((r): r is readonly [number, number] => typeof r[1] === 'number' && r[1] > 0));
}

/** С кем сравнивать оружие: шаг с противниками — его; иначе ближайший невыполненный шаг с боем; иначе никто (корова). */
export function fightStepFor(steps: Step[], p: Progress, step?: Step | null): Step | null {
  if (step?.foes?.length) return step;
  return steps.find((s) => s.foes?.length && !isClosed(p, s.id)) ?? null;
}

/** Шлагбаум Al Kharid бесплатный после Prince Ali Rescue — по названию, а не по коду шага. */
function freeToll(steps: Step[], p: Progress): boolean {
  const quest = steps.find((s) => s.title === 'Prince Ali Rescue');
  return Boolean(quest && isClosed(p, quest.id));
}

export interface GearAdviceView {
  advice: GearAdvice;
  input: AdvisorInput;
  /** Шаг, чьи противники в сравнении (или null — корова). */
  fightStep: Step | null;
  /** Цены биржи загружены; нет — у покупок на бирже цены нет, и они не попадают в «по карману». */
  pricesReady: boolean;
  pricesFailed: boolean;
}

export function useGearAdvice(step?: Step | null): GearAdviceView {
  const { progress, mode, steps } = useStore();
  const { gear, stats, owned } = useBridge();
  const [prices, setPrices] = useState<ReadonlyMap<number, number>>(new Map());
  const [pricesFailed, setPricesFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGearPrices()
      .then((m) => { if (alive) { setPrices(m); setPricesFailed(false); } })
      .catch(() => { if (alive) setPricesFailed(true); });
    return () => { alive = false; };
  }, []);

  const fightStep = fightStepFor(steps, progress, step);
  const input = useMemo<AdvisorInput>(() => ({
    // Уровни из игры главнее введённых вручную: они точные и свежие.
    levels: { ...progress.levels, ...(stats ?? {}) },
    gear,
    owned,
    mode,
    gePrices: prices,
    freeToll: freeToll(steps, progress),
    routeNeeds: routeNeeds(steps, (id) => isClosed(progress, id)),
    foes: fightStep ? stepFoes(fightStep) : [],
  }), [progress, stats, gear, owned, mode, prices, steps, fightStep]);
  const advice = useMemo(() => adviseGear(input), [input]);
  return { advice, input, fightStep, pricesReady: prices.size > 0, pricesFailed };
}
