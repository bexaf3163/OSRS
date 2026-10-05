// What the app sends the plugin on /active-step — for every step and every quick variant. The copy lies in
// runelite-bridge/src/test/resources/active-steps.json: the plugin tests check that it accepts all of it
// (prepare) and that the "What you need" list on the game screen is drawn without overflows — on the real data, not on
// a retelling of the route. This test makes sure the copy does not fall behind the app. To update: UPDATE_FIXTURES=1 npm test.

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
  // A row per target — so the history shows which step changed.
  return `[\n${rows.join(',\n')}\n]\n`;
}

describe('step targets for the plugin tests', () => {
  it('the copy in runelite-bridge matches what the app sends', () => {
    const now = fresh();
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, now);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === now, 'runelite-bridge/src/test/resources/active-steps.json is out of date — UPDATE_FIXTURES=1 npm test').toBe(true);
  });
});
