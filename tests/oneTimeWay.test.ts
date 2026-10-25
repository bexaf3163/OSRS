import { describe, expect, it } from 'vitest';
import { TRANSPORT, travelOptions, type TravelInput } from '../src/lib/travel';
import { fairyRingsUnlocked, networkUnlocked, oneTimeUsedOf, travelInputOf } from '../src/lib/travelInput';
import { stepById } from '../src/data';
import { judgeTransport, recommendedTransport } from '../src/lib/transport';

// Count Check: one free teleport from the Lumbridge graveyard to the Stronghold of Security entrance, once, only if it was never entered.

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const lumbridge = at(3222, 3218);
const entrance = at(3081, 3420);
const base = (over: Partial<TravelInput> = {}): TravelInput => ({ from: lumbridge, to: entrance, levels: {}, carried: null, bankSeen: false, ...over });

describe('Count Check as a way to the Stronghold', () => {
  it('is in the data with the wiki’s two places: the NPC south of the Lumbridge church and the Stronghold entrance', () => {
    const w = TRANSPORT.oneTime!.find((x) => x.id === 'count-check')!;
    expect(w.at).toMatchObject({ x: 3240, y: 3199, plane: 0 });
    expect(w.dest).toMatchObject({ x: 3081, y: 3420, plane: 0 });
    expect(w.usedAfter).toBe('S1-09');
  });

  it('is offered from Lumbridge to the entrance as a possible way, never as ready (the game does not tell whether it was used)', () => {
    const o = travelOptions(base()).find((x) => x.id === 'count-check')!;
    expect(o).toBeDefined();
    expect(o.availability).toBe('maybe');
    expect(o.needs).toEqual([{ text: 'you never entered the Stronghold', ok: null }]);
    expect(o.go).toMatchObject({ x: 3240, y: 3199, label: 'Count Check' });
    const walk = travelOptions(base()).find((x) => x.id === 'walk')!;
    expect(o.walkTiles).toBeLessThan(walk.walkTiles);
  });

  it('is the recommendation from Lumbridge: talk to the NPC, state "check", the NPC highlighted by name', () => {
    const rec = recommendedTransport(travelOptions(base()))!;
    expect(rec.type).toBe('npc_teleport');
    expect(rec.interactionName).toBe('Count Check');
    expect(rec.state).toBe('check');
    expect(rec.tile).toMatchObject({ x: 3240, y: 3199 });
    expect(rec.chip.length).toBeLessThanOrEqual(60);
    expect(rec.summary).toMatch(/Talk to Count Check/);
  });

  it('is not offered once the route step that uses it is closed: done or knowingly skipped', () => {
    const opts = travelOptions(base({ oneTimeUsed: ['count-check'] }));
    expect(opts.find((x) => x.id === 'count-check')).toBeUndefined();
    expect(oneTimeUsedOf({ steps: { 'S1-09': 'done' } })).toEqual(['count-check']);
    expect(oneTimeUsedOf({ steps: { 'S1-09': 'skipped' } })).toEqual(['count-check']);
    expect(oneTimeUsedOf({ steps: {} })).toEqual([]);
    // The input builder carries it through to the planner.
    const input = travelInputOf({ from: lumbridge, to: entrance, levels: {}, stats: null, gear: null, owned: undefined, mode: 'f2p', oneTimeUsed: ['count-check'] });
    expect(input.oneTimeUsed).toEqual(['count-check']);
    expect(travelOptions(input).find((x) => x.id === 'count-check')).toBeUndefined();
  });

  it('is not offered when it saves too little: from the entrance itself, or to a place it does not shorten', () => {
    expect(travelOptions(base({ from: at(3085, 3415) })).find((x) => x.id === 'count-check')).toBeUndefined();
    // Falador to Barbarian Village: the NPC is far behind.
    expect(travelOptions(base({ from: at(2965, 3380), to: at(3104, 3425) })).find((x) => x.id === 'count-check')).toBeUndefined();
    // A target in the south of Lumbridge, next to the NPC: nothing to save either.
    expect(travelOptions(base({ to: at(3240, 3205) })).find((x) => x.id === 'count-check')).toBeUndefined();
  });

  it('does not displace a ready way: a Varrock Teleport with runes in the bag stays ahead for a Varrock target', () => {
    const carried = [{ id: 1, name: 'Law rune', count: 1 }, { id: 2, name: 'Air rune', count: 3 }, { id: 3, name: 'Fire rune', count: 1 }];
    const opts = travelOptions(base({ to: at(3213, 3424), levels: { magic: 25 }, carried, bankSeen: true }));
    const { best } = judgeTransport(opts);
    expect(best?.id).not.toBe('count-check');
  });
});

describe('route steps named by the transport data', () => {
  it('every one-time way and every network unlock points at a real route step: a renumbered or retired step fails here, not in the game', () => {
    const named = [...(TRANSPORT.oneTime ?? []).map((w) => [w.id, w.usedAfter]), ...Object.entries(TRANSPORT.unlocks ?? {}).map(([k, u]) => [k, u.afterStep])];
    expect(named.length).toBeGreaterThan(1);
    for (const [what, step] of named) expect(stepById.has(step), `${what}: ${step}`).toBe(true);
  });

  it('the fairy rings open only when their step is done', () => {
    const at = TRANSPORT.unlocks!.fairyRings.afterStep;
    expect(fairyRingsUnlocked({ steps: { [at]: 'done' } })).toBe(true);
    expect(fairyRingsUnlocked({ steps: { [at]: 'skipped' } })).toBe(false);
    expect(networkUnlocked('no-such-network', { steps: { [at]: 'done' } })).toBe(false);
  });
});
