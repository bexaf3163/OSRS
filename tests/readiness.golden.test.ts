// The "golden" readiness snapshot: the status and the requirement states of every route step in six scenarios.
// The unified engine replaced three separate calculations and was checked against the old code on this same data; the snapshot keeps this
// behaviour: if an answer changed, the test shows which step and scenario. To update deliberately: UPDATE_FIXTURES=1 npm test.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { stepReadiness } from '../src/lib/readiness';
import { emptyProgress, withStep } from '../src/lib/progress';
import { nameKey, preflightItems, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { GearState } from '../src/services/runeliteBridge';
import type { Step } from '../src/types';

const FILE = new URL('./fixtures/readiness.golden.json', import.meta.url);

const gearOf = (coins: number | null, bankCoins: number | null): GearState => ({ equipment: [], inventory: [], coins, bankCoins });
function ownedFor(s: Step, mk: (need: number) => Partial<OwnedItem>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const it of preflightItems(s)) map.set(nameKey(it.nameEn), { name: it.nameEn, id: it.id, carried: 0, noted: 0, ...mk(it.count) });
  return { bankSeen, items: map };
}
const all99 = Object.fromEntries(['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'mining', 'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'agility', 'crafting', 'runecraft', 'herblore', 'thieving', 'fletching', 'slayer', 'farming', 'construction', 'hunter'].map((k) => [k, 99]));
const scenarios: { name: string; stats: Record<string, number> | null; owned: (s: Step) => OwnedState | null; gear: GearState | null }[] = [
  { name: 'everything present', stats: all99, owned: (s) => ownedFor(s, (n) => ({ carried: n + 5 }), true), gear: gearOf(10_000_000, 10_000_000) },
  { name: 'in the bank', stats: { attack: 1, ranged: 17 }, owned: (s) => ownedFor(s, (n) => ({ carried: 0, bank: n }), true), gear: gearOf(0, 10_000_000) },
  { name: 'part', stats: { attack: 1 }, owned: (s) => ownedFor(s, (n) => ({ carried: Math.floor(n / 2), bank: 0 }), true), gear: gearOf(10, 0) },
  { name: 'nothing', stats: { attack: 1 }, owned: (s) => ownedFor(s, () => ({ carried: 0, bank: 0 }), true), gear: gearOf(0, 0) },
  { name: 'bank not open', stats: { attack: 1 }, owned: (s) => ownedFor(s, (n) => ({ carried: Math.floor(n / 2) }), false), gear: gearOf(5, null) },
  { name: 'no connection', stats: null, owned: () => null, gear: null },
];

function fresh(): string {
  const rows: string[] = [];
  for (const sc of scenarios) {
    for (const step of allSteps) {
      let progress = emptyProgress();
      for (const s of allSteps) { if (s.id === step.id) break; progress = withStep(progress, s.id, 'done'); }
      const r = stepReadiness({ step, steps: allSteps, progress, qp: 200, mode: 'members', stats: sc.stats, owned: sc.owned(step), gear: sc.gear });
      rows.push(JSON.stringify([sc.name, step.id, r.status, r.requirements.map((x) => `${x.kind}:${x.label}:${x.state}`)]));
    }
  }
  return `[\n${rows.join(',\n')}\n]\n`;
}

describe('step readiness: the golden snapshot', () => {
  it('the unified engine answers have not changed', () => {
    const now = fresh();
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FILE, now);
    const saved = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
    expect(saved === now, 'tests/fixtures/readiness.golden.json is out of date — UPDATE_FIXTURES=1 npx vitest run tests/readiness.golden.test.ts').toBe(true);
  });
});
