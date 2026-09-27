// Предметы этапа для банка: плагин OSRS Path Bridge мягко подсвечивает их в основном окне банка RuneLite
// (POST /bank-tags), пока шаг этапа показан в игре. Отдельной вкладки и строки импорта нет: подсветка
// приходит сама и меняется вместе с этапом, а строку пришлось бы копировать и вставлять заново на каждом этапе.

import type { GameMode, Step } from '../types';
import { itemById, stepsFor } from '../data';

/** ID без повторов и мусора, в исходном порядке. */
export function uniqueIds(ids: Iterable<number>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Предметы шага, которые берут из банка (не те, что выдадут или подберёшь по ходу шага). */
export function stepBankItemIds(step: Step): number[] {
  const items = [...(step.itemsRequired ?? []), ...(step.itemsRecommended ?? [])];
  return items.filter((i) => !i.inStep && i.wikiItemId).map((i) => i.wikiItemId!);
}

/**
 * Предметы этапа для банка: из всех шагов этапа в выбранном режиме, без повторов.
 * В F2P не попадают предметы Members — по базе предметов вики.
 */
export function stageBankItemIds(stage: number, mode: GameMode = 'f2p', steps: Step[] = stepsFor(mode)): number[] {
  const ids = uniqueIds(steps.filter((s) => s.stage === stage).flatMap(stepBankItemIds));
  return mode === 'members' ? ids : ids.filter((id) => itemById.get(id)?.members !== true);
}
