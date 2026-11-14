import { describe, expect, it } from 'vitest';
import { itemById } from '../../data';
import { buildPlayerState } from '../player/playerState';
import { planSources } from './sourceRouter';
import { matchStrict } from '../travel/locations';

const player = () => buildPlayerState({ mode: 'f2p', connected: true, progress: { levels: {} }, questsDone: [],
  stats: { mining: 1, crafting: 1 }, position: { x: 3222, y: 3218, plane: 0 },
  owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 1000, bankCoins: 0 } });

describe('usable acquisition sources before unlocated references', () => {
  // The hammer left this case in 2026-11: the wiki added a located free spawn in Lumbridge.
  it('offers a located shop for the real pickaxe instead of stalling on an unlocated free spawn', () => {
    for (const id of [1265]) {
      const detail = itemById.get(id)!;
      const plan = planSources({ name: detail.nameEn, need: 1, shortage: true, detail, gePrice: 20 }, player());
      expect(plan.primary).toMatchObject({ kind: 'shop', access: 'open', price: 1, point: { plane: 0 } });
      expect(plan.total).toBeGreaterThan(1);
      expect(plan.satisfied).toBe(false); // A source recommendation never proves acquisition.
    }
  });

  it('retains unlocated free sources when they are the only allowed strategy, without making up a tile', () => {
    const detail = itemById.get(1265)!;
    const result = planSources({ name: detail.nameEn, need: 1, shortage: true, detail, kinds: ['free'] }, player());
    expect(result.primary).toMatchObject({ kind: 'free', price: 0 });
    expect(result.primary?.point).toBeUndefined();
    expect(result.total).toBeGreaterThan(0);
  });

  it('keeps a located nearby free pickup ahead of buying and leaves observed ownership untouched', () => {
    const state = player();
    const point = matchStrict('Draynor Manor')!;
    state.position = { known: true, value: point, source: 'game' };
    const detail = { ...itemById.get(1925)!, freeSpawns: ['Draynor Manor'] };
    const result = planSources({ name: 'Bucket', need: 1, shortage: true, detail, gePrice: 20 }, state);
    expect(result.primary).toMatchObject({ kind: 'free', point: { x: point.x, y: point.y, plane: point.plane } });
    expect(state.owned?.items.size).toBe(0);
  });

  it('buys several pieces rather than wait on one spawn: its respawn time is not measured, a purchase\'s is', () => {
    const state = player();
    const point = matchStrict('Draynor Manor')!;
    state.position = { known: true, value: point, source: 'game' };
    const detail = { ...itemById.get(1925)!, freeSpawns: ['Draynor Manor'] };
    expect(planSources({ name: 'Bucket', need: 3, shortage: true, detail, gePrice: 20 }, state).primary?.kind).not.toBe('free');
    // With no other source the spawn is still offered.
    expect(planSources({ name: 'Bucket', need: 3, shortage: true, detail, kinds: ['free'] }, state).primary?.kind).toBe('free');
  });

  it('makes an item nothing sells, from its recipe: 5 Ecto-tokens a worship', () => {
    const detail = [...itemById.values()].find((i) => i.nameEn === 'Ecto-token')!;
    const plan = planSources({ name: 'Ecto-token', need: 20, shortage: true, detail }, player());
    expect(plan.primary).toMatchObject({ kind: 'make', price: 0, make: { seconds: 60, yield: 5 } });
  });
});
