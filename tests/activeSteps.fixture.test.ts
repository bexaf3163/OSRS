// Что программа шлёт плагину на /active-step — для каждого шага и каждого быстрого варианта. Копия лежит в
// runelite-bridge/src/test/resources/active-steps.json: тесты плагина проверяют, что он принимает всё это
// (prepare) и что список «Что нужно» на экране игры рисуется без вылезаний, — на настоящих данных, а не на
// пересказе маршрута. Этот тест следит, чтобы копия не отстала от программы. Обновить: UPDATE_FIXTURES=1 npm test.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { toInGameTarget } from '../src/services/runeliteBridge';

const FILE = new URL('../runelite-bridge/src/test/resources/active-steps.json', import.meta.url);

function fresh(): string {
  const rows: string[] = [];
  for (const s of allSteps) {
    const t = toInGameTarget(s);
    if (t) rows.push(JSON.stringify({ step: s.id, branch: null, target: t }));
    for (const b of s.branches ?? []) {
      if (!b.replacementTarget) continue;
      const bt = toInGameTarget(s, b);
      if (bt) rows.push(JSON.stringify({ step: s.id, branch: b.id, target: bt }));
    }
  }
  // Строка на цель — чтобы в истории было видно, какой шаг изменился.
  return `[\n${rows.join(',\n')}\n]\n`;
}

describe('цели шагов для тестов плагина', () => {
  it('копия в runelite-bridge совпадает с тем, что шлёт программа', () => {
    const now = fresh();
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, now);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === now, 'runelite-bridge/src/test/resources/active-steps.json устарел — UPDATE_FIXTURES=1 npm test').toBe(true);
  });
});
