import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import { foodPicks, withFoodPlan } from '../src/domain/combat/foodPlan';
import { gearById } from '../src/domain/combat/gearAdvisor';
import { toInGameTarget } from '../src/domain/guide/inGameTarget';
import { emptyProgress } from '../src/domain/persistence/progress';
import { buildPlayerState } from '../src/domain/player/playerState';
import { aggregateShopping } from '../src/domain/prep/shopping';
import { createReadinessEngine } from '../src/domain/readiness/readinessEngine';
import type { Progress } from '../src/types';

// Owner report 2026-11-08: "the app tells the player to buy food when food is not needed". Each case runs the app's own
// chain (store.tsx order): personal food pick -> step food plan -> readiness and preparation -> Shopping -> game payload.
const id = (name: string) => [...gearById.values()].find((p) => p.name === name)!.id;
function before(stepId: string): Progress {
  const p = emptyProgress();
  for (const s of allSteps) { if (s.id === stepId) break; p.steps[s.id] = 'done'; }
  return p;
}
function world(stepId: string, stats: Record<string, number> | null, worn: string[], carried: Record<string, number> = {}) {
  const progress = before(stepId);
  const owned = { bankSeen: true, items: new Map(Object.entries(carried).map(([name, n]) => [name.toLowerCase(), { name, carried: n, bank: 0, noted: 0 }])) };
  const gear = { equipment: worn.map((name) => ({ id: id(name), name })), inventory: [], coins: 0, bankCoins: 0 };
  const state = buildPlayerState({ mode: 'f2p', connected: true, progress, stats, owned, gear, questsDone: null } as never);
  const pick = foodPicks(allSteps, progress, { stats, xp: null, gear: stats ? gear : null, owned, combatLog: null } as never)[stepId];
  const step = withFoodPlan(stepById.get(stepId)!, pick);
  const engine = createReadinessEngine({ steps: [step], state, mode: 'f2p', qp: 40, progress });
  const food = (name: string) => ({
    required: step.itemsRequired?.find((i) => i.nameEn === name),
    recommended: step.itemsRecommended?.find((i) => i.nameEn === name),
    readiness: engine.readiness(step).requirements.find((r) => r.item === name),
    now: engine.plan(step, { ahead: 0 }).now.find((l) => l.name === name),
    buy: aggregateShopping([step], { wholeGoal: true }).required.find((l) => l.nameEn === name)?.count ?? 0,
    suggest: aggregateShopping([step], { wholeGoal: true }).recommended.find((l) => l.nameEn === name)?.count ?? 0,
    checklist: (toInGameTarget(step)?.checklist ?? []).some((c) => c.name === name),
  });
  return { pick, step, food };
}

const WEAK = { attack: 10, strength: 10, defence: 1, hitpoints: 14, magic: 1 };
const STRONG = { attack: 60, strength: 60, defence: 60, hitpoints: 60, magic: 40 };
const RUNE = ['Rune scimitar', 'Rune full helm', 'Rune platebody', 'Rune platelegs', 'Rune kiteshield'];

describe('food follows the player, not the guide (full chain, owner report 2026-11-08)', () => {
  it('dangerous quest fight: the estimated food is required, prepared, bought and checked in the game', () => {
    const { pick, food } = world('S4-01', WEAK, ['Mithril scimitar']);
    expect(pick).toMatchObject({ essential: true });
    expect(pick.trip).toBeGreaterThan(0);
    const salmon = food('Salmon');
    expect(salmon.required?.amount).toBe(pick.trip);
    expect(salmon.readiness?.state).not.toBe('OK');
    expect(salmon.now?.priority).toBe('CRITICAL');
    expect(salmon.buy).toBe(pick.trip);
    expect(salmon.checklist).toBe(true);
  });

  it('food already in the bag: the same fight is ready and nothing is bought on top', () => {
    const need = world('S4-01', WEAK, ['Mithril scimitar']).pick.trip;
    const { food } = world('S4-01', WEAK, ['Mithril scimitar'], { Salmon: need });
    const salmon = food('Salmon');
    expect(salmon.readiness?.state).toBe('OK');
    expect(salmon.now?.action).toBeUndefined();
  });

  it('safe fight: a kit that takes no damage worth healing needs no food, whatever the guide wrote', () => {
    const { pick, step, food } = world('S4-02', STRONG, RUNE);
    expect(pick).toMatchObject({ essential: true, trip: 0 });
    expect(stepById.get('S4-02')!.itemsRequired!.some((i) => i.nameEn === 'Trout')).toBe(true);
    const trout = food('Trout');
    expect([trout.required, trout.readiness, trout.now]).toEqual([undefined, undefined, undefined]);
    expect([trout.buy, trout.checklist]).toEqual([0, false]);
    // Brutus's estimate leaves mechanics out, so the guide's surplus may stay as a labelled margin, never a requirement.
    expect(step.itemsRecommended?.find((i) => i.nameEn === 'Trout')?.howToGet ?? 'none').toMatch(/^(none|Optional: a margin, because the estimate leaves out)/);
  });

  it('unknown risk (no levels from the game): the guide amount is only a labelled suggestion', () => {
    const { pick, food } = world('S4-01', null, []);
    expect(pick).toBeUndefined();
    const salmon = food('Salmon');
    expect([salmon.required, salmon.readiness, salmon.now]).toEqual([undefined, undefined, undefined]);
    expect(salmon.recommended?.howToGet).toMatch(/^Optional: the risk of this fight is not estimated/);
    expect([salmon.buy, salmon.checklist]).toEqual([0, false]);
    expect(salmon.suggest).toBeGreaterThan(0);
  });

  it('a fight with no estimate at all (no foe data) never requires the guide food either', () => {
    const { pick, food } = world('S2-07', WEAK, ['Mithril scimitar']);
    expect(pick).toBeUndefined();
    expect(food('Trout').required).toBeUndefined();
    expect(food('Trout').buy).toBe(0);
  });

  it('the weaker the character, the more food the same fight needs (different states, different answers)', () => {
    const weak = world('S4-01', WEAK, ['Mithril scimitar']).pick.trip;
    const mid = world('S4-01', { attack: 40, strength: 40, defence: 30, hitpoints: 35, magic: 20 }, ['Mithril scimitar', 'Iron platebody']).pick.trip;
    const strong = world('S4-01', STRONG, RUNE).pick.trip;
    expect(weak).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThanOrEqual(strong);
  });
});
