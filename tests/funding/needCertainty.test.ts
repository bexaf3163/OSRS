import { describe, expect, it } from 'vitest';
import { assess } from '../../src/lib/funding/assess';
import { buildNeed } from '../../src/lib/funding/need';
import { market } from './market';
import { scenario } from './scenario';

describe('funding scope certainty', () => {
  it('retains unknown whole-goal ownership without pricing a fictitious shortage', () => {
    const prices = market();
    const s = scenario(prices, { bagCoins: 5000 });
    s.state.owned!.items.delete('salmon');
    const need = buildNeed({ step: s.step, prep: s.prep, prices, owned: s.state.owned, manual: {} });
    expect(need.objective.unknown).toBeGreaterThan(0);
    expect(need.objective.lines.some(l => l.name === 'Salmon')).toBe(false);
    expect(need.objective.cost).toBe(0);
  });
  it('cannot say the trip is funded when other required ownership is still unknown', () => {
    const prices = market();
    const s = scenario(prices, { bagCoins: 5000 });
    const need = { ...s.need, minimum: { ...s.need.minimum, unknown: 1 } };
    const result = assess({ step: s.step, need, snap: s.snap, prices, recs: [], bankValue: null, base: s.base });
    expect(result.gap).toBe(0);
    expect(result.required).toBeGreaterThan(0);
    expect(result.state).toBe('UNKNOWN');
    expect(result.headline).toContain('Known purchases are covered');
    expect(result.recommendation).toBeNull();
  });
  it('future unchecked supplies do not turn a verified free next trip into an unknown one', () => {
    const prices = market();
    const s = scenario(prices, { bagCoins: 5000, items: { Salmon: [25, 0] } });
    const need = { ...s.need, unknown: 1, minimum: { ...s.need.minimum, unknown: 0 } };
    const result = assess({ step: s.step, need, snap: s.snap, prices, recs: [], bankValue: null, base: s.base });
    expect(result.state).toBe('COVERED');
    expect(result.headline).toBe('Nothing to pay for.');
  });
});
