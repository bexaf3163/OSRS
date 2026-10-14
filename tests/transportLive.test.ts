import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { allSteps } from '../src/data';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { decideTransport, transportReport, transportSources, transportTarget, type TransportInput } from '../src/lib/liveTransport';
import { planPayload } from '../src/lib/prepEnvelope';
import { transportKey, transportWatch, travelInputOf } from '../src/lib/travelInput';
import { travelOptions } from '../src/lib/travel';
import { recommendedTransport } from '../src/lib/transport';
import { toInGameTarget, WATCH_MAX, type GearState, type QuestInstruction } from '../src/services/runeliteBridge';

// The live transport decision for the step shown in the game (the audit of 2026-10-14): what the card says, what it prepares, and what it never claims.
// The positions and bank contents are fixtures; the planner, the item data and the source router are the real ones.

const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
const DRAYNOR = at(3093, 3248);
const PALACE = at(3211, 3490);
const owned = (rows: Record<string, number>, bankSeen = true): OwnedState => {
  const items = new Map<string, OwnedItem>();
  for (const [name, bank] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, bank });
  return { bankSeen, items };
};
const gear = (rows: [string, number][], coins = 0, bankCoins: number | null = 0): GearState =>
  ({ equipment: [], inventory: rows.map(([name, count], i) => ({ id: i + 1, name, count })), coins, bankCoins } as unknown as GearState);

function decide(o: { pos: { x: number; y: number; plane: number } | null; step: string; bag: [string, number][]; bank: Record<string, number> | null; magic?: number; instruction?: QuestInstruction | null; extra?: Partial<TransportInput> }) {
  const g = gear(o.bag, 0, o.bank ? 0 : null);
  const ow = o.bank ? owned(o.bank) : owned({}, false);
  const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: ow, gear: g, questsDone: null, connected: true });
  return decideTransport({
    step: stepById.get(o.step)!, pos: o.pos, instruction: o.instruction ?? null, nextStep: null,
    levels: { magic: o.magic ?? 25, woodcutting: 15 }, stats: null, gear: g, owned: ow, mode: 'f2p', homeCooldownSec: 900, homeCooldownKnown: true, spellbook: 0,
    sourceOf: transportSources(state), ...o.extra,
  });
}

describe('the transport line of the game card', () => {
  it('scenario 1: a way clearly shorter than walking is recommended, worded for the card, with the check it needs', () => {
    // Live on 2026-10-14: Varrock Palace, step S5-01, the Chronicle in the bag.
    const d = decide({ pos: PALACE, step: 'S5-01', bag: [['Chronicle', 1]], bank: {} });
    expect(d.recommended).toMatchObject({ type: 'item_teleport', item: 'Chronicle', state: 'check', check: 'check charges' });
    expect(d.recommended!.summary).toMatch(/^Use Chronicle → Champions' Guild · saves ~\d+ s · check charges$/);
    expect(d.verdicts.find((v) => v.outcome === 'chosen')?.title).toBe('Chronicle');
  });

  it('scenario 2 and 4: a spell that lacks runes the bank holds is offered as "withdraw at the nearest bank first", with the stop counted', () => {
    const d = decide({ pos: DRAYNOR, step: 'S3-05', bag: [], bank: { 'Law rune': 1, 'Air rune': 3, 'Fire rune': 1 } });
    const r = d.recommended!;
    expect(r.state).toBe('prepare');
    expect(r.summary).toMatch(/^Varrock Teleport saves ~\d+ s: withdraw Law rune, Air rune ×3, Fire rune at Draynor Bank$/);
    expect(r.prepare!.withdraw).toEqual([{ name: 'Law rune', quantity: 1 }, { name: 'Air rune', quantity: 3 }, { name: 'Fire rune', quantity: 1 }]);
    expect(r.prepare!.text).toContain('Missing: Law rune, Air rune ×3, Fire rune.');
    expect(r.tile, 'the arrow leads to the bank first, not to the objective').toMatchObject({ x: 3093, y: 3243 });
    // The stop costs time: the journey is longer than the spell alone, and the saving is the journey's.
    const chosen = d.verdicts.find((v) => v.outcome === 'chosen')!;
    expect(chosen.journeyTiles).toBeGreaterThan(chosen.walkTiles);
    expect(r.savedTiles).toBe(d.walkTiles! - chosen.journeyTiles);
  });

  it('scenario 3: what is already in the bag is not asked for again: only the remaining quantity', () => {
    const d = decide({ pos: DRAYNOR, step: 'S3-05', bag: [['Air rune', 1]], bank: { 'Law rune': 5, 'Air rune': 10, 'Fire rune': 5 } });
    expect(d.recommended!.prepare!.withdraw).toEqual([{ name: 'Law rune', quantity: 1 }, { name: 'Air rune', quantity: 2 }, { name: 'Fire rune', quantity: 1 }]);
    expect(d.recommended!.summary).toContain('Air rune ×2');
  });

  it('scenario 5: once the runes are in the bag the spell is simply ready, and the key that triggers a new judgement changed', () => {
    const before = gear([]);
    const after = gear([['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]]);
    const bank = owned({ 'Law rune': 1, 'Air rune': 3, 'Fire rune': 1 });
    expect(transportKey(after, bank)).not.toBe(transportKey(before, bank));
    // Something the ways do not use changes nothing.
    expect(transportKey(gear([['Salmon', 4]]), bank)).toBe(transportKey(before, bank));
    const d = decide({ pos: DRAYNOR, step: 'S3-05', bag: [['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]], bank: { 'Law rune': 0, 'Air rune': 0, 'Fire rune': 0 } });
    expect(d.recommended).toMatchObject({ type: 'spell_teleport', state: 'ready' });
    expect(d.recommended!.summary).toMatch(/^Cast Varrock Teleport → Varrock Square · saves ~\d+ s$/);
    expect(d.recommended!.prepare).toBeUndefined();
  });

  it('scenario 8: a way blocked by a level is never presented as usable, whatever the bag holds', () => {
    const d = decide({ pos: DRAYNOR, step: 'S3-05', bag: [['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]], bank: {}, magic: 20 });
    expect(d.recommended?.type).not.toBe('spell_teleport');
    const spell = d.verdicts.find((v) => v.id === 'varrock-teleport')!;
    expect(spell).toMatchObject({ outcome: 'rejected', reason: 'locked' });
    expect(spell.needs.join(' ')).toContain('Magic 25 (you have 20)');
  });

  it('scenario 9: an objective a few tiles away gets no transport at all', () => {
    const d = decide({ pos: PALACE, step: 'S3-05', bag: [['Chronicle', 1]], bank: {} });
    expect(d.walkTiles).toBeLessThan(10);
    expect(d.recommended).toBeNull();
  });

  it('scenario 11: an unread bank is unknown, never empty: no withdrawal is invented and the diagnostics say so', () => {
    const d = decide({ pos: DRAYNOR, step: 'S3-05', bag: [], bank: null });
    expect(d.recommended?.prepare?.withdraw ?? []).toEqual([]);
    const spell = d.verdicts.find((v) => v.id === 'varrock-teleport')!;
    expect(spell.availability).toBe('maybe');
    expect(spell.reason).toBe('short_on_hand');
    expect(spell.needs.join('; ')).toContain('Law rune ×1 (in the bag: 0) [bank: unknown] (?)');
    // No position from the game: nothing is judged.
    expect(decide({ pos: null, step: 'S3-05', bag: [], bank: null })).toMatchObject({ skipped: 'no_position', recommended: null });
  });

  it('a point off the world map (a dungeon) is not routed over', () => {
    const d = decide({ pos: at(3060, 9776), step: 'S5-01', bag: [['Chronicle', 1]], bank: {} });
    expect(d).toMatchObject({ skipped: 'off_map', recommended: null });
  });

  it('the developer report lists every candidate with its verdict and is not the player text', () => {
    const report = transportReport(decide({ pos: DRAYNOR, step: 'S3-05', bag: [], bank: { 'Law rune': 1, 'Air rune': 3, 'Fire rune': 1 } }));
    const rows = report.candidates as string[];
    expect(rows[0]).toMatch(/^✗ On foot \[walk\] walk \d+, journey \d+, saves 0 — better_way$/);
    expect(rows.some((r) => r.startsWith('✓ Varrock Teleport: get what it needs first [prepare]'))).toBe(true);
    expect(rows.some((r) => /^✗ Varrock Teleport \[locked\] .* \[bank: 1\]/.test(r))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/Bexqq|password|token/i);
  });
});

describe('the objective of the transport', () => {
  it('scenario 10: the confirmed quest line is the objective; a line the player only peeks at, or a temporary arrow, is not', () => {
    const step = stepById.get('S5-01')!;
    const confirmed = transportTarget(step, { stepId: 'S5-01', stageAt: 0, lineIndex: 0, peeking: false } as QuestInstruction)!;
    expect(confirmed.source).toBe('instruction');
    expect(confirmed.point).toMatchObject({ x: 3190, y: 3360 });
    expect(transportTarget(step, { stepId: 'S5-01', stageAt: 0, lineIndex: 0, peeking: true } as QuestInstruction)!.source).toBe('step');
    expect(transportTarget(step, null)!.source).toBe('step');
  });

  it('scenario 10: a new objective is judged on its own: the old recommendation does not survive the change', () => {
    expect(decide({ pos: PALACE, step: 'S5-01', bag: [['Chronicle', 1]], bank: {} }).recommended).not.toBeNull();
    expect(decide({ pos: PALACE, step: 'S3-05', bag: [['Chronicle', 1]], bank: {} }).recommended).toBeNull();
  });
});

describe('what the game is asked to count, and what goes to the plugin', () => {
  it('the runes, the Chronicle and the canoe axes are counted in the bank; tablets only for a members account', () => {
    const f2p = transportWatch('f2p');
    expect(f2p).toEqual(expect.arrayContaining(['Law rune', 'Air rune', 'Fire rune', 'Earth rune', 'Water rune', 'Chronicle', 'Bronze axe']));
    expect(f2p.some((n) => / teleport$/.test(n))).toBe(false);
    expect(transportWatch('members').some((n) => / teleport$/.test(n))).toBe(true);
    // The watch list the plugin gets never exceeds what it accepts, with the step's own items first.
    const target = toInGameTarget(stepById.get('S5-01')!, undefined, [], transportWatch('members'))!;
    expect(target.watchItems!.length).toBeLessThanOrEqual(WATCH_MAX);
    expect(target.watchItems).toEqual(expect.arrayContaining(['Law rune', 'Chronicle']));
  });

  it('a prepared way goes to the plugin with its state, summary and preparation, and its withdrawals join the bank list', () => {
    const d = decide({ pos: DRAYNOR, step: 'S3-05', bag: [], bank: { 'Law rune': 1, 'Air rune': 3, 'Fire rune': 1 } });
    const state = buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned({}), gear: gear([]), questsDone: null, connected: true });
    const plan = createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state }).plan(stepById.get('S3-05')!);
    const payload = planPayload(plan, { transport: d.recommended });
    expect(payload.recommendedTransport).toMatchObject({ state: 'prepare', summary: d.recommended!.summary, tile: { x: 3093, y: 3243, plane: 0 } });
    expect(payload.recommendedTransport!.prepare).toContain('Withdraw Law rune, Air rune ×3, Fire rune at Draynor Bank');
    expect(payload.bankWithdrawals).toEqual(expect.arrayContaining([expect.objectContaining({ itemName: 'Law rune', quantity: 1 }), expect.objectContaining({ itemName: 'Air rune', quantity: 3 })]));
  });
});

describe('the Home Teleport and the spellbook', () => {
  const lumbridgeFrom = (over: Parameters<typeof travelInputOf>[0] extends infer T ? Partial<T> : never) => travelOptions(travelInputOf({
    from: PALACE, to: at(3222, 3218), levels: {}, stats: null, gear: gear([]), owned: owned({}), mode: 'f2p', ...over,
  }));

  it('the cast time counts in the trip, and an unread cooldown is a thing to check, not "ready"', () => {
    const known = lumbridgeFrom({ homeCooldownSec: 0, homeCooldownKnown: true }).find((o) => o.id === 'lumbridge-home')!;
    expect(known.availability).toBe('ready');
    expect(known.overheadTiles).toBe(50);
    const unknown = lumbridgeFrom({ homeCooldownSec: null, homeCooldownKnown: false }).find((o) => o.id === 'lumbridge-home')!;
    expect(unknown.availability).toBe('maybe');
    expect(recommendedTransport(lumbridgeFrom({ homeCooldownSec: null, homeCooldownKnown: false }))?.check).toBe('check the cooldown');
    // On a cooldown the spell is not offered as ready.
    expect(lumbridgeFrom({ homeCooldownSec: 600, homeCooldownKnown: true }).find((o) => o.id === 'lumbridge-home')?.availability).not.toBe('ready');
  });

  it('a spellbook other than the standard one locks the standard teleports', () => {
    const opts = travelOptions(travelInputOf({
      from: DRAYNOR, to: at(3210, 3494), levels: { magic: 25 }, stats: null, gear: gear([['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]]), owned: owned({}), mode: 'f2p', spellbook: 1,
    }));
    expect(opts.find((o) => o.id === 'varrock-teleport')?.availability).toBe('locked');
  });
});
