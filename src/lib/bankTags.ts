// Строка импорта для плагина RuneLite «Bank Tags»: вкладка банка с предметами этапа.
//
// Формат проверен по коду RuneLite 1.12.39 (TabInterface.importTag): текст из буфера обмена
// разбирается Text.fromCSV — «banktags», версия, имя вкладки, ID предмета-значка, затем ID предметов;
// после необязательного «layout» идут пары «позиция, ID» (раскладка Bank Tag Layouts).
// Из имени плагин выкидывает символы < > : — здесь они убираются заранее, как и запятые (разделитель).
// «banktag:имя» из примера ТЗ — это строка поиска в банке, а не импорт: плагин её не примет.
//
// Раскладки (layout) не генерируются: в маршруте нет позиций ячеек, а выдумывать их незачем.

import type { GameMode, Step } from '../types';
import { itemById, stepsFor } from '../data';

export const BANK_TAGS_VERSION = 1;

/** Имя вкладки без символов, которые плагин отбрасывает или принимает за разделитель. */
export function bankTagName(name: string): string {
  return name.replace(/[<>:,]/g, '').replace(/\s+/g, ' ').trim();
}

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

/**
 * Строка импорта вкладки. Пустая строка — нечего импортировать (нет предметов или имени):
 * такую строку плагин отверг бы, поэтому её и не показываем.
 */
export function generateBankTag(tagName: string, itemIds: number[]): string {
  const name = bankTagName(tagName);
  const ids = uniqueIds(itemIds);
  if (!name || !ids.length) return '';
  // Значок вкладки — первый предмет.
  return ['banktags', BANK_TAGS_VERSION, name, ids[0], ...ids].join(',');
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

export function stageTagName(stage: number): string {
  return `osrspath_stage${stage}`;
}

export function generateStageBankTag(stage: number, mode: GameMode = 'f2p', steps?: Step[]): string {
  return generateBankTag(stageTagName(stage), stageBankItemIds(stage, mode, steps));
}
