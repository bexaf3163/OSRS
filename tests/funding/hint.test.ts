import { describe, expect, it } from 'vitest';
import { buildEnvelope, EMPTY_PARTS, envelopeKey } from '../../src/lib/prepEnvelope';
import { briefOf, fundingHintPayload, MAX_FUNDING_BRIEF, MAX_FUNDING_TEXT } from '../../src/lib/fundingHint';
import { pause, startPlan, viewOf, type FundingPlanState } from '../../src/lib/funding/plan';
import { methodById } from '../../src/lib/funding/methods';
import { market } from './market';
import { scenario } from './scenario';
import { fakeSnap } from './helpers';

const T0 = 1_792_000_000_000;

function running(): { plan: FundingPlanState; snap: ReturnType<typeof fakeSnap> } {
  const s = scenario(market(), { bagCoins: 400, bankCoins: 0 });
  const plan = startPlan(s.assessment, s.assessment.recommendation!, s.snap, methodById('cows-cowhide'), T0)!;
  return { plan, snap: fakeSnap({ character: 'Tester', position: { x: 3253, y: 3278, plane: 0 }, bag: [{ name: 'Cowhide', count: 12 }], bagCoins: 400, bankCoins: 0 }) };
}

describe('the funding line for the game says what the app says', () => {
  it('is the app\'s own view, field for field', () => {
    const { plan, snap } = running();
    const view = viewOf(plan, snap);
    const p = fundingHintPayload(plan, view, 'Tester')!;
    expect(p).toMatchObject({ player: 'Tester', planId: plan.id, version: view.version, status: 'ACTIVE', action: view.action, stepIndex: view.stepIndex, stepCount: view.stepCount });
    expect(p.progress).toBe(view.progress ?? undefined);
    expect(p.title).toBe(view.title);
  });

  it('gives the narrow HUD plate a few words: the activity while working, the first sentence otherwise', () => {
    expect(briefOf({ kind: 'perform', title: 'Kill cows for cowhide', action: 'Kill cows and pick up the hides until the bag is full.' })).toBe('Kill cows for cowhide');
    expect(briefOf({ kind: 'travel', title: 'Kill cows for cowhide', action: 'Go to the cow field north of Lumbridge. Take the gate.' })).toBe('Go to the cow field north of Lumbridge.');
    expect(briefOf({ kind: 'sell', title: 'x', action: 'Sell everything you collected at the Grand Exchange, all of it, in one go, please.' }).length).toBeLessThanOrEqual(MAX_FUNDING_BRIEF);
  });

  it('says the figure is an estimate only when there is a figure to estimate', () => {
    const { plan } = running();
    const sellView = { ...viewOf(plan, fakeSnap({ character: 'Tester' })), kind: 'sell' as const, estimated: true, progress: '425 gp to go' };
    expect(fundingHintPayload(plan, sellView, 'Tester')!.estimated).toBe(true);
    expect(fundingHintPayload(plan, { ...sellView, progress: null }, 'Tester')!.estimated).toBeUndefined();
  });

  it('is nothing for no plan, a paused plan, another character, or an unknown one', () => {
    const { plan, snap } = running();
    const view = viewOf(plan, snap);
    expect(fundingHintPayload(null, null, 'Tester')).toBeNull();
    expect(fundingHintPayload(plan, null, 'Tester')).toBeNull();
    const paused = pause(plan, T0 + 1000);
    expect(fundingHintPayload(paused, viewOf(paused, snap), 'Tester')).toBeNull();
    expect(fundingHintPayload(plan, view, 'Someone Else')).toBeNull();
    expect(fundingHintPayload(plan, view, null)).toBeNull();
  });

  it('keeps every text within the plugin\'s limit', () => {
    const { plan, snap } = running();
    const view = { ...viewOf(plan, snap), action: 'Go '.repeat(200), title: 'T'.repeat(300), progress: 'p'.repeat(300) };
    const p = fundingHintPayload(plan, view, 'Tester')!;
    expect(p.action.length).toBeLessThanOrEqual(MAX_FUNDING_TEXT);
    expect(p.title.length).toBeLessThanOrEqual(60);
    expect(p.progress!.length).toBeLessThanOrEqual(60);
  });
});

describe('the snapshot part', () => {
  it('is absent when there is no plan, so an app with nothing to say sends the snapshot an older plugin knows, byte for byte', () => {
    const base = envelopeKey(EMPTY_PARTS);
    expect(envelopeKey({ ...EMPTY_PARTS, funding: null })).toBe(base);
    expect('funding' in buildEnvelope({ ...EMPTY_PARTS, funding: null }, 1)).toBe(false);
  });

  it('is sent as it is when a plan runs, and a change of progress is a new snapshot', () => {
    const { plan, snap } = running();
    const p = fundingHintPayload(plan, viewOf(plan, snap), 'Tester')!;
    const e = buildEnvelope({ ...EMPTY_PARTS, funding: p }, 7);
    expect(e.funding).toEqual(p);
    expect(e.v).toBe(6);
    expect(envelopeKey({ ...EMPTY_PARTS, funding: p })).not.toBe(envelopeKey({ ...EMPTY_PARTS, funding: { ...p, progress: '13 / 27 Cowhide' } }));
    expect(envelopeKey({ ...EMPTY_PARTS, funding: p })).toBe(envelopeKey({ ...EMPTY_PARTS, funding: { ...p } }));
  });
});
