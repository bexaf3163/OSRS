import { describe, expect, it } from 'vitest';
import { known } from '../../data';
import { emptyProgress, normalizeProgress, withSellRestrictions } from '../persistence/progress';
import {
  isRestrictedItem, LIFT, RESTRICTED_ITEMS, restrictionSummary, totalLevelOf, tradeRestriction, ALL_SKILLS,
} from './tradeRestriction';
import { checkStatus, type BridgeTransport } from '../../services/runeliteBridge';

// A new free-to-play account cannot sell some items on the Grand Exchange until 20 h of play, 10 quest points and total level 100.

describe('the restriction state', () => {
  it('a readable unmet condition is RESTRICTED; the hours are never readable, so a met one is UNKNOWN, not LIFTED', () => {
    const low = tradeRestriction({ questPoints: 4, totalLevel: 62 });
    expect(low.state).toBe('RESTRICTED');
    expect(low.unmet).toEqual([{ what: 'quest points', have: 4, need: LIFT.questPoints }, { what: 'total level', have: 62, need: LIFT.totalLevel }]);
    expect(tradeRestriction({ questPoints: 12, totalLevel: 40 }).unmet).toEqual([{ what: 'total level', have: 40, need: 100 }]);
    const met = tradeRestriction({ questPoints: 10, totalLevel: 100 });
    expect(met.state).toBe('UNKNOWN');
    expect(met.unread).toEqual(['hours']);
  });

  it('nothing read is UNKNOWN, never RESTRICTED or LIFTED: unavailable is not zero', () => {
    const r = tradeRestriction({ questPoints: null, totalLevel: null });
    expect(r.state).toBe('UNKNOWN');
    expect(r.unread).toEqual(['hours', 'quest points', 'total level']);
    expect(r.unmet).toEqual([]);
    // One unmet reading is enough for RESTRICTED even when the other cannot be read.
    expect(tradeRestriction({ questPoints: 3, totalLevel: null }).state).toBe('RESTRICTED');
    expect(tradeRestriction({ questPoints: null, totalLevel: 99 }).state).toBe('RESTRICTED');
  });

  it('the route count is not an input: only the game proves a restriction', () => {
    expect(tradeRestriction({ questPoints: 30, totalLevel: 150 })).toMatchObject({ state: 'UNKNOWN', by: 'game' });
    expect(tradeRestriction({ questPoints: null, totalLevel: 150 }).state).toBe('UNKNOWN');
    expect(tradeRestriction({ questPoints: null, totalLevel: null }).state).toBe('UNKNOWN');
  });

  it("the player's word wins both ways", () => {
    expect(tradeRestriction({ questPoints: 1, totalLevel: 30, override: 'lifted' })).toMatchObject({ state: 'LIFTED', by: 'player' });
    expect(tradeRestriction({ questPoints: 50, totalLevel: 900, override: 'active' }).state).toBe('RESTRICTED');
  });

  it('the summary says what is unmet and never claims the hours are known', () => {
    expect(restrictionSummary(tradeRestriction({ questPoints: 4, totalLevel: 62 }))).toMatch(/quest points 4 of 10, total level 62 of 100/);
    expect(restrictionSummary(tradeRestriction({ questPoints: 12, totalLevel: 130 }))).toMatch(/20 hours of play cannot be read/);
  });

  it('total level is a sum only when every skill is known', () => {
    const all = Object.fromEntries(ALL_SKILLS.map((s) => [s, 1]));
    expect(totalLevelOf(all)).toBe(23);
    const { mining: _m, ...partial } = all;
    expect(totalLevelOf(partial)).toBeNull();
    expect(totalLevelOf(null)).toBeNull();
  });
});

describe('the restricted items', () => {
  it("are the wiki's list of 40, plural and singular match, and a processed item does not", () => {
    expect(RESTRICTED_ITEMS).toHaveLength(40);
    for (const n of ['Cowhide', 'Cowhides', 'Iron ore', 'Leather', 'Feathers', 'Oak log', "Red spiders' eggs", 'Steel bars', 'Coal']) expect(isRestrictedItem(n), n).toBe(true);
    for (const n of ['Big bones', 'Bones', 'Iron bar', 'Cooked meat', 'Uncut sapphire', 'Leather boots', 'Redberry pie', 'Nature rune', 'Coins']) expect(isRestrictedItem(n), n).toBe(false);
  });

});


describe('the answer is saved with the profile and nothing else changes', () => {
  it('round-trips, drops garbage, and an older save without it loads as absent', () => {
    const p = withSellRestrictions(emptyProgress(), 'lifted');
    expect(p.sellRestrictions).toBe('lifted');
    expect(normalizeProgress(JSON.parse(JSON.stringify(p)), known)!.progress.sellRestrictions).toBe('lifted');
    expect(normalizeProgress({ ...JSON.parse(JSON.stringify(p)), sellRestrictions: 'maybe' }, known)!.progress.sellRestrictions).toBeUndefined();
    expect(normalizeProgress({ version: 3, steps: { 'S1-01': 'done' }, levels: {}, notes: {}, updatedAt: new Date().toISOString() }, known)!.progress.sellRestrictions).toBeUndefined();
    expect(withSellRestrictions(p, null).sellRestrictions).toBeUndefined();
  });

  it('keeps the completed steps, levels and notes', () => {
    const base = { ...emptyProgress(), steps: { 'S1-03': 'done' as const }, levels: { mining: 12 }, notes: { 'S1-03': 'x' } };
    const p = withSellRestrictions(base, 'active');
    expect(p.steps).toEqual(base.steps);
    expect(p.levels).toEqual(base.levels);
    expect(p.notes).toEqual(base.notes);
  });
});

describe('the plugin status carries the totals', () => {
  const status = async (extra: Record<string, unknown>) => {
    const t: BridgeTransport = { request: async () => ({ ok: true, status: 200, data: { status: 'ok', inGame: true, ...extra } }), openEvents: () => () => {} } as unknown as BridgeTransport;
    return checkStatus(t);
  };

  it('quest points and total level: whole numbers in range, otherwise unknown (a zero is a real zero)', async () => {
    const ok = await status({ questPoints: 7, totalLevel: 63 });
    expect([ok.questPoints, ok.totalLevel]).toEqual([7, 63]);
    expect((await status({ questPoints: 0 })).questPoints).toBe(0);
    const none = await status({});
    expect([none.questPoints, none.totalLevel]).toEqual([null, null]);
    for (const bad of [-1, 501, 2.5, '7']) expect((await status({ questPoints: bad })).questPoints).toBeNull();
    for (const bad of [-1, 2278, 99.9, '63']) expect((await status({ totalLevel: bad })).totalLevel).toBeNull();
  });
});
