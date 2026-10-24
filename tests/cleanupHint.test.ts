import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { cleanupAdvice, emptyCleanupPrefs, type CleanupInput } from '../src/lib/cleanup';
import { cleanupHintPayload, MAX_CLEANUP_LINES } from '../src/lib/cleanupHint';
import { buildEnvelope, EMPTY_PARTS, envelopeKey } from '../src/lib/prepEnvelope';
import type { Step } from '../src/types';

const open = (...ids: string[]): Step[] => ids.map((id) => allSteps.find((s) => s.id === id)!);
const PRICES: Record<string, number> = { 'Ball of wool': 60, 'Oak logs': 90 };
const input = (over: Partial<CleanupInput>): CleanupInput => ({
  bag: [], openSteps: [], bankSeen: true, account: 'normal', restriction: 'LIFTED',
  price: (n) => PRICES[n] ?? null, tradeable: () => true, prefs: emptyCleanupPrefs(), ...over,
});

describe('inventory cleanup for the game', () => {
  it('keeps cached sale certainty in the existing bounded HUD reason', () => {
    const result = cleanupAdvice(input({ bag: [{ id: 1522, name: 'Oak logs', count: 40, noted: true }], priceLabel: () => 'Cached GE sell estimate' }));
    const line = cleanupHintPayload(result, 'Bexqq')!.lines[0];
    expect(result.recs[0].priceLabel).toBe('Cached GE sell estimate');
    expect(line.why).toContain('Cached GE sell estimate');
    expect(line.why.length).toBeLessThanOrEqual(60);
    expect(line.proceeds).toBe(3600);
  });
  it('a surplus sale goes with its id, count, short reason and estimate; what is kept never goes', () => {
    const r = cleanupAdvice(input({ openSteps: open('S2-10'), bag: [{ id: 1759, name: 'Ball of wool', count: 23 }, { id: 590, name: 'Tinderbox', count: 1 }] }));
    const p = cleanupHintPayload(r, 'Bexqq')!;
    expect(p.player).toBe('Bexqq');
    expect(p.lines).toEqual([{ name: 'Ball of wool', id: 1759, qty: 20, action: 'sell', why: 'keep 3, the rest has no use ahead', proceeds: 1200 }]);
  });

  it('banknotes are their own stack with their own id', () => {
    const r = cleanupAdvice(input({ bag: [{ id: 1522, name: 'Oak logs', count: 40, noted: true }] }));
    const [l] = cleanupHintPayload(r, 'Bexqq')!.lines;
    expect(l).toMatchObject({ id: 1522, qty: 40, noted: true, action: 'sell', why: 'no use ahead', proceeds: 3600 });
  });

  it('a finished quest item says Destroy or Drop as the wiki does', () => {
    const bag = [{ id: 290, name: 'Research package', count: 1 }, { id: 553, name: "Ghost's skull", count: 1 }];
    const r = cleanupAdvice(input({ bag, tradeable: () => false, closedSteps: new Set(['S2-06', 'S1-06']) }));
    const lines = cleanupHintPayload(r, 'Bexqq')!.lines;
    expect(lines.find((l) => l.id === 290)).toMatchObject({ action: 'destroy', why: 'its quest is done, no other use' });
    expect(lines.find((l) => l.id === 553)).toMatchObject({ action: 'drop' });
    expect(lines.every((l) => l.proceeds === undefined)).toBe(true);
  });

  it('a review line keeps its reason short and carries no price', () => {
    const r = cleanupAdvice(input({ account: 'ironman', bag: [{ id: 1522, name: 'Oak logs', count: 5 }] }));
    const [l] = cleanupHintPayload(r, 'Bexqq')!.lines;
    expect(l).toMatchObject({ action: 'review', why: 'no use ahead (Ironman)' });
    expect(l.proceeds).toBeUndefined();
  });

  it('nothing goes without a character, without an id or with nothing to do', () => {
    const r = cleanupAdvice(input({ bag: [{ id: 1522, name: 'Oak logs', count: 5 }] }));
    expect(cleanupHintPayload(r, null)).toBeNull();
    expect(cleanupHintPayload(r, '  ')).toBeNull();
    expect(cleanupHintPayload(cleanupAdvice(input({ bag: [{ name: 'Oak logs', count: 5 }] })), 'Bexqq')).toBeNull();
    expect(cleanupHintPayload(cleanupAdvice(input({ bag: [{ id: 590, name: 'Tinderbox', count: 1 }] })), 'Bexqq')).toBeNull();
  });

  it('a dismissed suggestion does not reach the game either', () => {
    const r = cleanupAdvice(input({ bag: [{ id: 1522, name: 'Oak logs', count: 5 }], prefs: { keep: [], dismissed: ['oak logs|sell'] } }));
    expect(cleanupHintPayload(r, 'Bexqq')).toBeNull();
  });

  it('the list is capped at the plugin limit', () => {
    const bag = Array.from({ length: 28 }, (_, i) => ({ id: 5000 + i, name: `Thing ${i}`, count: 1 }));
    const p = cleanupHintPayload(cleanupAdvice(input({ bag })), 'Bexqq')!;
    expect(p.lines.length).toBe(MAX_CLEANUP_LINES);
  });

  it('the snapshot carries it only when there is something: without it the snapshot is the one an older plugin knows', () => {
    const none = buildEnvelope({ ...EMPTY_PARTS, cleanup: null }, 1);
    expect('cleanup' in none).toBe(false);
    expect(envelopeKey({ ...EMPTY_PARTS, cleanup: { player: 'Bexqq', lines: [] } })).toBe(envelopeKey(EMPTY_PARTS));
    const hint = { player: 'Bexqq', lines: [{ name: 'Oak logs', id: 1522, qty: 5, action: 'sell' as const, why: 'no use ahead' }] };
    expect(buildEnvelope({ ...EMPTY_PARTS, cleanup: hint }, 2).cleanup).toEqual(hint);
    expect(envelopeKey({ ...EMPTY_PARTS, cleanup: hint })).not.toBe(envelopeKey(EMPTY_PARTS));
  });
});
