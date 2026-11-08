import { describe, expect, it } from 'vitest';
import type { Step } from '../../types';
import { buildPlayerState } from '../player/playerState';
import { nameKey } from '../items/itemKey';
import { fakePrices } from '../../../tests/funding/helpers';
import type { PlanningSnapshot } from './contracts';
import { observedProjection, projectSuccess } from './decision';
import { forecastProcurement } from './procurement';

const item = (nameEn: string, amount = 1, anyOf?: string[]) => ({ nameEn, amount, anyOf, howToGet: '' });
const step = (itemsRequired: Step['itemsRequired']): Step => ({ id: 'S0-01', title: 'Synthetic stage', stage: 0, type: 'skill', requires: [], doneWhen: 'Observed', itemsRequired });
function fixture(stock: Record<string, number> = {}, savedAt?: number, coins = 100) {
  const snapshot: PlanningSnapshot = { scope: { characterId: 'fixture', mode: 'f2p', gameSessionId: 'login', snapshotRevision: 1 }, xp: {}, quests: {}, manual: {},
    questPoints: { known: true, value: 0, source: 'game' },
    player: buildPlayerState({ mode: 'f2p', connected: true, player: 'Fixture', progress: { levels: {} }, stats: {}, questsDone: [],
      owned: { bankSeen: true, ...(savedAt !== undefined ? { bankSavedAt: savedAt } : {}),
        items: new Map([...new Set(['Hammer', 'Bucket', 'Pot', ...Object.keys(stock)])].map(name => [nameKey(name), { name, carried: 0, noted: 0, bank: stock[name] ?? 0 }])) },
      gear: { equipment: [], inventory: [], coins, bankCoins: 0 } }) };
  return { snapshot, projection: observedProjection(snapshot), detail: () => undefined, ironman: false as boolean | null,
    prices: fakePrices({ Hammer: { buy: 100 }, Bucket: { buy: 50 }, Pot: { buy: 40 } }), steps: [] as Step[] };
}

describe('joint procurement through the existing Shopping engine', () => {
  it('projects exactly the joint physical purchase, reuses the acquired tool, and leaves observed money and stock untouched', () => {
    const input = fixture({}, undefined, 500);
    input.steps = [step([item('Hammer'), item('Bucket')]), step([item('Hammer'), item('Bucket')])];
    const result = forecastProcurement(input)!;
    expect(result.purchase).toMatchObject({ gp: -200, items: [{ name: 'Hammer', delta: 1 }, { name: 'Bucket', delta: 2 }] });
    const projection = projectSuccess(input.projection, [{ kind: 'resources', afterSuccessOnly: true, change: result.purchase! }]);
    expect(projection.resources?.gp.floor).toBe(300);
    expect(forecastProcurement({ ...input, projection })).toMatchObject({ requiredGp: 0, acquisition: [], purchase: { gp: 0, items: [] } });
    expect(input.snapshot.player.coins.bag).toMatchObject({ value: 500 });
    expect(input.snapshot.player.owned?.items.get('hammer')?.bank).toBe(0);
  });
  it('retains actual potion sizes and package spare doses rather than inventing generic potion units', () => {
    const input = fixture(Object.fromEntries([1, 2, 3, 4].map(size => [`Strength potion(${size})`, size === 1 ? 1 : 0])));
    input.steps = [step([item('Strength potion(4)')])];
    input.prices = fakePrices({ 'Strength potion(4)': { buy: 40 } });
    const result = forecastProcurement(input)!;
    expect(result.acquisition[0]?.package).toMatchObject({ doses: 4, spare: 1 });
    expect(result.purchase).toMatchObject({ gp: -40, items: [{ name: 'Strength potion(4)', delta: 1 }] });
  });
  it('does not manufacture purchases from a shortage, unpriced/unknown quantities or unverified trading access', () => {
    const input = fixture();
    input.steps = [step([item('Hammer'), item('Bucket')])];
    expect(forecastProcurement(input)?.purchase).toBeNull(); // Only100gp observed, joint cost150.
    input.steps = [step([item('Bucket')])];
    for (const ironman of [true, null]) expect(forecastProcurement({ ...input, ironman })?.purchase).toBeNull();
    input.steps = [step([{ ...item('Bucket'), amount: 'as many as you have' }])];
    expect(forecastProcurement(input)).toMatchObject({ requiredGp: null, purchase: null, unknownQuantities: 1 });
  });
  it('charges a shared shop fare once and keeps quest payments reserved rather than spending them in the purchase', () => {
    const input = fixture({ 'Synthetic A': 0, 'Synthetic B': 0 });
    input.steps = [step([{ ...item('Synthetic A', 2), wikiItemId: 90001 }, { ...item('Synthetic B', 3), wikiItemId: 90002 }, item('Coins', 20)])];
    const result = forecastProcurement({ ...input, ironman: true, onGe: () => false, detail: id => ({ id, nameEn: id === 90001 ? 'Synthetic A' : 'Synthetic B',
      examine: '', members: false, iconUrl: '', value: 1, wikiUrl: 'https://example.test/synthetic',
      buyLocations: [{ shopName: 'Al Kharid General Store', location: 'Al Kharid', owner: 'Shopkeeper', price: id === 90001 ? 5 : 7, stock: 10 }] }) })!;
    expect(result.requiredGp).toBe(61); //31items +10shared fare +20quest payment.
    expect(result.purchase).toMatchObject({ gp: -41, items: [{ name: 'Synthetic A', delta: 2 }, { name: 'Synthetic B', delta: 3 }] });
    expect(projectSuccess(input.projection, [{ kind: 'resources', afterSuccessOnly: true, change: result.purchase! }]).resources?.gp.floor).toBe(59);
  });
  it('reuses a tool across distinct stages retaining the same virtual ID and sums their separate consumables once', () => {
    const input = fixture();
    input.steps = [step([item('Hammer'), item('Bucket')]), step([item('Hammer'), item('Bucket')])];
    const result = forecastProcurement(input)!;
    expect(result).toMatchObject({ conditional: true, requiredGp: 200, confirmedGp: 200, shortfall: 100 });
    expect(result.acquisition.find(row => row.name === 'Hammer')?.qty).toBe(1);
    expect(result.acquisition.find(row => row.name === 'Bucket')?.qty).toBe(2);
  });
  it('uses conditional purchases and consumption without spending observed cash or allocating the same stock twice', () => {
    const input = fixture({ Bucket: 2 });
    input.steps = [step([item('Bucket', 2)])];
    expect(forecastProcurement(input)?.requiredGp).toBe(0);
    const consumed = projectSuccess(input.projection, [{ kind: 'resources', afterSuccessOnly: true,
      change: { items: [{ name: 'Bucket', delta: -2 }], gp: 0, source: 'Synthetic completed activity' } }]);
    expect(forecastProcurement({ ...input, projection: consumed })?.requiredGp).toBe(100);
    const bought = projectSuccess(consumed, [{ kind: 'resources', afterSuccessOnly: true,
      change: { items: [{ name: 'Bucket', delta: 2 }], gp: -100, source: 'Synthetic costed acquisition' } }]);
    expect(forecastProcurement({ ...input, projection: bought })?.requiredGp).toBe(0);
    expect(input.snapshot.player.owned?.items.get('bucket')?.bank).toBe(2);
    expect(input.snapshot.player.coins.bag).toMatchObject({ value: 100 });
  });
  it('shares declared alternative stock with named primary demands through the existing allocator', () => {
    const input = fixture({ Pot: 2 });
    input.steps = [step([item('Bucket', 2, ['Pot']), item('Pot')])];
    const result = forecastProcurement(input)!;
    expect(result.requiredGp).toBe(50); // One pot reserved for its own demand; the other covers only one bucket equivalent.
    expect(result.acquisition).toHaveLength(1);
    expect(result.acquisition[0]).toMatchObject({ name: 'Bucket', qty: 1 });
  });
  it('keeps unread bank rows and absent prices out of a complete cash forecast', () => {
    const remembered = fixture({ Bucket: 2 }, 1000);
    remembered.steps = [step([item('Bucket')])];
    expect(forecastProcurement(remembered)).toMatchObject({ requiredGp: null, shortfall: null, unknownOwnership: 1 });
    const unpriced = fixture();
    unpriced.steps = [step([item('Hammer'), item('Bucket')])];
    unpriced.prices = fakePrices({ Bucket: { buy: 50 } });
    expect(forecastProcurement(unpriced)).toMatchObject({ requiredGp: null, shortfall: null, confirmedGp: 50, unknownPrices: 1 });
  });
  it('refuses another profile, mode, login or revision and never exposes hypothetical stock as live ownership', () => {
    const input = fixture();
    for (const scope of [{ ...input.snapshot.scope, characterId: 'another' }, { ...input.snapshot.scope, snapshotRevision: 2 },
      { ...input.snapshot.scope, mode: 'members' as const }, { ...input.snapshot.scope, gameSessionId: 'other' }]) {
      expect(forecastProcurement({ ...input, projection: { ...input.projection, scope } })).toBeNull();
    }
    expect(forecastProcurement({ ...input, projection: { ...input.projection, scope: undefined } })).toBeNull();
  });
});
