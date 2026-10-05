import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { stepReadiness } from '../src/lib/readiness';
import { buildPlayerState } from '../src/lib/playerState';
import { evaluate, type Requirement } from '../src/lib/requirements';
import { navigationTarget } from '../src/lib/navigation';
import { toInGameTarget } from '../src/services/runeliteBridge';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, preflightItems, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import type { GearState } from '../src/services/runeliteBridge';
import type { Step } from '../src/types';

// The new requirements engine and the step readiness — one state, one answer.
// If they diverge, one screen will say "short", another — "ready".

const COINS = 995;
const gearOf = (coins: number | null, bankCoins: number | null): GearState => ({ equipment: [], inventory: [], coins, bankCoins });

type Scenario = { name: string; stats: Record<string, number> | null; owned: (s: Step) => OwnedState | null; gear: GearState | null };

function ownedFor(s: Step, mk: (need: number) => Partial<OwnedItem>, bankSeen: boolean): OwnedState {
  const map = new Map<string, OwnedItem>();
  for (const it of preflightItems(s)) map.set(nameKey(it.nameEn), { name: it.nameEn, id: it.id, carried: 0, noted: 0, ...mk(it.count) });
  return { bankSeen, items: map };
}

const scenarios: Scenario[] = [
  { name: 'everything present', stats: Object.fromEntries(['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'mining', 'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'agility', 'crafting', 'runecraft', 'herblore', 'thieving', 'fletching', 'slayer', 'farming', 'construction', 'hunter'].map((k) => [k, 99])), owned: (s) => ownedFor(s, (n) => ({ carried: n + 5 }), true), gear: gearOf(10_000_000, 10_000_000) },
  { name: 'all in the bank', stats: { attack: 1, ranged: 17 }, owned: (s) => ownedFor(s, (n) => ({ carried: 0, bank: n }), true), gear: gearOf(0, 10_000_000) },
  { name: 'part', stats: { attack: 1 }, owned: (s) => ownedFor(s, (n) => ({ carried: Math.floor(n / 2), bank: 0 }), true), gear: gearOf(10, 0) },
  { name: 'nothing, bank open', stats: { attack: 1 }, owned: (s) => ownedFor(s, () => ({ carried: 0, bank: 0 }), true), gear: gearOf(0, 0) },
  { name: 'bank not opened', stats: { attack: 1 }, owned: (s) => ownedFor(s, (n) => ({ carried: Math.floor(n / 2) }), false), gear: gearOf(5, null) },
  { name: 'no connection', stats: null, owned: () => null, gear: null },
];

describe('readiness and the unified requirements give one answer', () => {
  it('levels and items of all steps: the same states in seven scenarios', () => {
    let compared = 0;
    for (const sc of scenarios) {
      for (const step of allSteps) {
        const owned = sc.owned(step);
        const input = { step, steps: allSteps, progress: emptyProgress(), qp: 0, mode: 'members' as const, stats: sc.stats, owned, gear: sc.gear };
        const r = stepReadiness(input);
        const ps = buildPlayerState({ mode: 'members', stats: sc.stats, progress: emptyProgress(), owned, gear: sc.gear, questsDone: null });
        for (const row of r.requirements.filter((x) => x.kind === 'skill')) {
          const [skill, min] = row.label.toLowerCase().split(' ');
          const req = (step.requirements ?? []).find((q) => q.type === 'skill' && q.skill === skill && q.min === Number(min));
          expect(req, `${step.id} ${row.label}`).toBeDefined();
          const got = evaluate({ type: 'skill', skill, min: Number(min) }, ps).state;
          expect(got, `${sc.name} · ${step.id} · ${row.label}`).toBe(row.state);
          compared++;
        }
        for (const it of preflightItems(step)) {
          if (it.id === COINS || nameKey(it.nameEn) === 'coins') continue;
          const row = r.requirements.find((x) => x.kind === 'item' && x.label.startsWith(it.nameEn));
          if (!row) continue;
          const req: Requirement = { type: 'item', name: it.nameEn, count: it.count };
          const got = evaluate(req, ps).state;
          // "Not the whole item in the bag, the rest unknown" is read the same way: the unknown is not "no".
          expect(got, `${sc.name} · ${step.id} · ${it.nameEn}`).toBe(row.state);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
  });
});

describe('one navigation target', () => {
  const step = allSteps.find((s) => toInGameTarget(s)?.worldPoint)!;

  it('the step target — the same tile that goes to the game', () => {
    const t = navigationTarget(step, {});
    const wp = toInGameTarget(step)!.worldPoint!;
    expect(t).toMatchObject({ x: wp.x, y: wp.y, plane: wp.plane, source: 'step' });
  });

  it('a temporary target wins and is named by its reason: shop, NPC, preparation detour', () => {
    const base = { label: 'Point', x: 3200, y: 3200, plane: 0, stepId: step.id };
    expect(navigationTarget(step, { navTarget: { ...base, itemName: 'Rope' } })?.source).toBe('shop');
    expect(navigationTarget(step, { navTarget: { ...base, npcNames: ['Bob'] } })?.source).toBe('npc');
    expect(navigationTarget(step, { navTarget: base })?.source).toBe('wiki');
    // A preparation detour wins over the other reasons, and the map, the HUD and the game see one target.
    expect(navigationTarget(step, { navTarget: { ...base, itemName: 'Rope' }, detourActive: true })?.source).toBe('detour');
    expect(navigationTarget(step, { navTarget: { ...base, itemName: 'Rope' }, detourActive: true })).toMatchObject({ x: 3200, y: 3200 });
    // A target set for another step does not belong to this one.
    expect(navigationTarget(step, { navTarget: { ...base, stepId: 'none' } })?.source).toBe('step');
  });

  it('items of the nearest steps go to the game as watchItems — to know in advance what is already there', () => {
    const p = toInGameTarget(step, undefined, ['Rope', 'Hammer', 'Rope']);
    expect(p?.watchItems).toEqual(expect.arrayContaining(['Rope', 'Hammer']));
    expect(new Set(p?.watchItems).size).toBe(p?.watchItems?.length);
    expect((toInGameTarget(step, undefined, Array.from({ length: 100 }, (_, i) => `Item ${i}`))?.watchItems ?? []).length).toBeLessThanOrEqual(40);
  });
});
