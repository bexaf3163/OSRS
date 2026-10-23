import type { WikiItemDetail } from '../../src/types';
import { describe, expect, it } from 'vitest';
import { netSale } from '../../src/lib/funding/ge';
import { market } from './market';
import { scenario } from './scenario';

// The reported character at S4-03 (Attack 30 to 40 and bank 50 Big bones): Attack 30, Strength 21, Defence 1, 24 hitpoints, an Adamant scimitar and iron
// armour, with the exchange as it was on 2026-10-18. The step wants 25 Salmon (33 gp each = 825 gp).

describe('Hill Giants with the reported character and little money', () => {
  it('400 coins is 425 short: a feasible plan is found, and it is not Hill Giants', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0 });
    expect(a.state).toBe('SHORT');
    expect(a.need.minimum.lines.map((l) => [l.name, l.qty, l.unit])).toContainEqual(['Salmon', 25, 33]);
    expect(a.required).toBe(825);
    expect(a.gap).toBe(425);
    const r = a.recommendation!;
    expect(r.kind).toBe('EARN');
    expect(r.evaluation!.eligible).toBe(true);
    expect(r.minutes).not.toBeNull();
    // The giants cannot pay for their own food while the 50 required bones are being collected.
    expect(r.id).not.toBe('earn:hill-giants');
    expect(a.notOffered.find((n) => n.method === 'Kill Hill Giants')?.why).toMatch(/runs out/);
  });

  it('owned Salmon reduce the shortfall: 15 in the bag leave 10 to buy, which 400 coins cover', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, items: { Salmon: [15, 0] } });
    expect(a.need.minimum.lines.find((l) => l.name === 'Salmon')).toMatchObject({ qty: 10, cost: 330 });
    expect(a.required).toBe(330);
    expect(a.state).toBe('COVERED');
    expect(a.recommendation).toBeNull();
  });

  it('Salmon in the bank count as owned once the bank is known', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 0, bankCoins: 0, items: { Salmon: [0, 25] } });
    expect(a.need.minimum.lines.find((l) => l.name === 'Salmon')).toBeUndefined();
    expect(a.state).toBe('COVERED');
  });

  it('an unread bank is not an empty bank: nothing is called missing, the state asks for the bank', () => {
    const { assessment: a, prep } = scenario(market(), { bagCoins: 400, bankCoins: null, bankSeen: false });
    expect(prep.lines.some((l) => l.where === 'UNKNOWN')).toBe(true);
    expect(a.need.minimum.lines).toEqual([]);
    expect(a.state).toBe('UNKNOWN');
    expect(a.headline).toBe('Open your bank to check your supplies.');
    expect(a.recommendation).toBeNull();
  });

  it('enough coins: no advice at all', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 5000, bankCoins: 0 });
    expect(a.state).toBe('COVERED');
    expect(a.recommendation).toBeNull();
    expect(a.alternatives).toEqual([]);
  });

  it('coins in the bag alone do not settle a shortfall when the bank is unread: the answer is unknown, not "short"', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: null, bankSeen: true });
    expect(a.state).toBe('UNKNOWN');
    expect(a.gap).toBeNull();
    expect(a.headline).toMatch(/bank/);
    // ...but a bag that already pays for everything settles it.
    expect(scenario(market(), { bagCoins: 900, bankCoins: null }).assessment.state).toBe('COVERED');
  });

  it('an unaffordable first batch is named, whatever the hourly profit', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0 });
    expect(a.notOffered.find((n) => n.method === 'Smelt steel bars')?.why).toMatch(/first batch costs about 1,077/);
    expect(a.recommendation!.id).not.toBe('earn:smelt-steel-bars');
  });

  it('with no coins at all the recommendation is something that can really be started', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 0, bankCoins: 0 });
    const e = a.recommendation!.evaluation!;
    expect(e.upfront.minimum).toBe(0);
    expect(e.blockers).toEqual([]);
    expect(e.method.inputs).toEqual([]);
  });
});

describe('what may be sold, and what is protected', () => {
  const cowhides = (qty: number) => [{ name: 'Cowhide', qty, noted: false, action: 'sell' as const, proceeds: qty * 116 }];

  it('spare items that cover the shortage are the recommendation, valued after the exchange tax', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, recs: cowhides(40), items: { Cowhide: [40, 0] }, sellOverride: 'lifted' });
    expect(a.budget.surplus.net).toBe(netSale(116, 40, 'Cowhide'));
    expect(a.recommendation).toMatchObject({ kind: 'SELL_SURPLUS' });
    expect(a.recommendation!.closes).toBe(425);
  });

  it('a restricted account cannot count on restricted items: they are left out with the reason', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, recs: cowhides(40), items: { Cowhide: [40, 0] }, questPoints: 3, totalLevel: 80 });
    expect(a.budget.surplus.lines).toEqual([]);
    expect(a.budget.surplus.excluded[0]).toMatchObject({ name: 'Cowhide' });
    expect(a.budget.surplus.excluded[0].why).toMatch(/cannot be sold yet/);
    expect(a.recommendation?.kind).not.toBe('SELL_SURPLUS');
  });

  it('an unknown restriction lets the sale be offered but marks it unconfirmed', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, recs: cowhides(40), items: { Cowhide: [40, 0] } });
    expect(a.budget.surplus.lines[0].status).toBe('unconfirmed');
    expect(a.recommendation!.confidence).toBe('MEDIUM');
  });

  it('the 50 required Big bones and the weapon are never offered for sale', () => {
    const recs = [
      { name: 'Big bones', qty: 60, noted: false, action: 'sell' as const, proceeds: 60 * 325 },
      { name: 'Adamant scimitar', qty: 1, noted: false, action: 'sell' as const, proceeds: 1500 },
    ];
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, recs, items: { 'Big bones': [60, 0], 'Adamant scimitar': [1, 0] }, sellOverride: 'lifted' });
    const bones = a.budget.surplus.lines.find((l) => l.name === 'Big bones');
    // 60 held, 50 protected by S4-03: only 10 are spare.
    expect(bones?.qty).toBe(10);
    expect(bones?.net).toBe(netSale(325, 10, 'Big bones'));
    expect(a.budget.surplus.lines.some((l) => l.name === 'Adamant scimitar')).toBe(false);
    expect(a.budget.surplus.excluded).toContainEqual({ name: 'Adamant scimitar', why: 'Kept for your route' });
  });
});

describe('a cheaper valid supply comes before any earning', () => {
  it('Tuna for the same health costs less than Salmon at these prices and fits the bag', () => {
    // Salmon at 60 makes 25 cost 1,500 against 1,400 coins. 225 health in Tuna (heals 10) is 23 pieces at 43 = 989.
    const { assessment: a } = scenario(market({ Salmon: { high: 60, avgHigh: 60 } }), { bagCoins: 1400, bankCoins: 0 });
    expect(a.gap).toBe(100);
    expect(a.recommendation).toMatchObject({ kind: 'CHEAPER_SUPPLY', id: 'cheaper:Tuna' });
    expect(a.recommendation!.detail).toMatch(/23 Tuna give the same health for 989 gp instead of 1,500/);
    expect(a.recommendation!.closes).toBe(100);
  });

  it('a substitute that does not fit the bag is not offered (33 Trout for 225 health would need 33 slots)', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0 });
    expect(a.alternatives.concat(a.recommendation ? [a.recommendation] : []).some((o) => o.kind === 'CHEAPER_SUPPLY')).toBe(false);
  });
});

describe('prices that are old, thin or missing', () => {
  it('a stale sell side for the main product lowers the recommendation to LOW confidence', () => {
    const { assessment: a } = scenario(market({ Cowhide: { lowAgeMin: 600, highAgeMin: 600 } }), { bagCoins: 400, bankCoins: 0 });
    const cows = [a.recommendation, ...a.alternatives].find((o) => o?.id === 'earn:cows-cowhide');
    if (cows) expect(cows.confidence).toBe('LOW');
    else expect(a.recommendation!.id).not.toBe('earn:cows-cowhide');
  });

  it('a product with almost no trades cannot be the confident top recommendation', () => {
    const { assessment: a } = scenario(market({ Cowhide: { highVolume: 3, lowVolume: 2 } }), { bagCoins: 400, bankCoins: 0 });
    const top = a.recommendation!;
    if (top.id === 'earn:cows-cowhide') expect(top.confidence).toBe('LOW');
    else expect(a.notOffered.length + a.alternatives.length).toBeGreaterThan(0);
  });

  it('an offline market without a supplied fallback leaves the required cost unknown', () => {
    const { assessment: a } = scenario(market({}, 'offline'), { bagCoins: 400, bankCoins: 0 });
    expect(a.need.priceStatus).toBe('offline');
    expect(a.need.minimum.unpriced).toBeGreaterThan(0);
    expect(a.state).toBe('UNKNOWN');
    expect(a.recommendation).toBeNull();
  });

  it('an old price still prices the shortage, marked LOW, when the exchange stops answering', () => {
    const { assessment: a } = scenario(market({}, 'stale'), { bagCoins: 400, bankCoins: 0 });
    expect(a.state).toBe('SHORT');
    expect(a.need.minimum.lines.find((l) => l.name === 'Salmon')?.confidence).toBe('LOW');
  });
});

describe('what the preparation plan calls a drop is still bought with coins', () => {
  // The item database has no exchange price for Salmon, only a drop table: the plan's cheapest source is a monster. A player short of food buys it.
  const dropOnly = (id: number) => (id === 329 ? ({ id, nameEn: 'Salmon', dropSources: [{ monster: 'Ogress Shaman', combatLevel: 82, rate: 'very low' }] } as unknown as WikiItemDetail) : undefined);

  it('food whose only listed source is a drop is a purchase in the shortage', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, detail: dropOnly });
    expect(a.state).toBe('SHORT');
    expect(a.need.minimum.lines.map((l) => l.name)).toContain('Salmon');
  });

  it('an unpriced shortage is unknown, never "nothing to pay for"', () => {
    // No exchange price and no planning price for the item: the total is a lower bound, and a covered answer cannot be given on it.
    const { assessment: a } = scenario(market({}, 'offline'), { bagCoins: 400, bankCoins: 0, detail: dropOnly });
    const priced = a.need.minimum.lines.filter((l) => l.cost !== null).length;
    if (a.need.minimum.unpriced > 0 && a.gap === 0) expect(a.state).toBe('UNKNOWN');
    expect(a.headline).not.toBe('Nothing to pay for.');
    expect(priced + a.need.minimum.unpriced).toBe(a.need.minimum.lines.length);
  });
});

describe('steady and deterministic', () => {
  it('the same inputs give the same answer', () => {
    const a = scenario(market(), { bagCoins: 400, bankCoins: 0 }).assessment;
    const b = scenario(market(), { bagCoins: 400, bankCoins: 0 }).assessment;
    expect(JSON.stringify(b.recommendation?.id)).toBe(JSON.stringify(a.recommendation?.id));
    expect(b.alternatives.map((o) => o.id)).toEqual(a.alternatives.map((o) => o.id));
    expect(b.gap).toBe(a.gap);
  });

  it('a small price move does not change the running plan', () => {
    const first = scenario(market(), { bagCoins: 400, bankCoins: 0 }).assessment;
    const id = first.recommendation!.id;
    // The plan is running; prices move by about 2% either way. It stays.
    const up = scenario(market({ Cowhide: { high: 118, low: 114, avgHigh: 118, avgLow: 114 } }), { bagCoins: 400, bankCoins: 0, activeId: id });
    const down = scenario(market({ Cowhide: { high: 113, low: 110, avgHigh: 113, avgLow: 110 } }), { bagCoins: 400, bankCoins: 0, activeId: id });
    expect(up.assessment.recommendation!.id).toBe(id);
    expect(down.assessment.recommendation!.id).toBe(id);
  });

  it('a running plan that has become unsuitable is dropped', () => {
    // The method is the active one but the player no longer has the level for it (Mining 10): it is not eligible, so the best eligible one wins.
    const s = scenario(market(), { bagCoins: 400, bankCoins: 0, activeId: 'earn:mine-iron-dwarven', stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24, mining: 10 } });
    expect(s.assessment.recommendation!.id).not.toBe('earn:mine-iron-dwarven');
  });

  it('methods that need full attention are held back unless asked for', () => {
    const base = scenario(market(), { bagCoins: 5000 - 4200, bankCoins: 0 }).assessment;
    expect([base.recommendation, ...base.alternatives].every((o) => o?.evaluation?.method.intensity !== 'high')).toBe(true);
  });
});

describe('ironman and members', () => {
  it('an ironman account is never sent to the exchange', () => {
    const { assessment: a } = scenario(market(), { bagCoins: 400, bankCoins: 0, ironman: true });
    expect(a.recommendation?.kind === 'EARN').toBe(false);
    expect(a.notOffered.some((n) => /ironman/i.test(n.why))).toBe(true);
  });
});
