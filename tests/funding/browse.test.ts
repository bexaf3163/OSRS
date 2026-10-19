// The Money section's list (2.71): every method of the catalogue judged by the coin card's evaluator and ranked by its rule, with one honest badge per
// method, a search, filters and a sort. The scenarios use the real catalogue, the recorded market and the production snapshot (scenario.ts).

import { describe, expect, it } from 'vitest';
import { badgeOf, browse, BROWSE_TARGET, capitalText, DEFAULT_FILTERS, moneyList, netText, type BrowseFilters } from '../../src/lib/funding/browse';
import { evaluate, type MethodEvaluation } from '../../src/lib/funding/evaluate';
import { methodById, METHODS } from '../../src/lib/funding/methods';
import { goalBlocker } from '../../src/lib/funding/plan';
import { market } from './market';
import { HISTORICAL, scenario } from './scenario';
import { fakePrices } from './helpers';

const byId = (evals: readonly MethodEvaluation[], id: string) => evals.find((e) => e.method.id === id)!;
const only = (f: Partial<BrowseFilters>): BrowseFilters => ({ ...DEFAULT_FILTERS, ...f });
const SKILLED = { ...HISTORICAL.stats, mining: 31, woodcutting: 32, fishing: 24, smithing: 20 };

describe('the Money list is the coin card\'s judgement, not a second one', () => {
  it('a low-level player short of coins: ranked for the shortfall, and the recommendation is the coin card\'s earning method', () => {
    const s = scenario(market(), { bagCoins: 400, bankCoins: 0 });
    expect(s.assessment.state).toBe('SHORT');
    const list = moneyList(s.base, s.assessment);
    expect(list.rankedFor.stepId).toBe('S4-03');
    expect(list.shortfall).toEqual({ stepId: 'S4-03', coins: s.assessment.gap });
    expect(s.assessment.recommendation?.kind).toBe('EARN');
    expect(list.ranking.best?.method.id).toBe(s.assessment.recommendation?.evaluation?.method.id);
    expect(list.evals).toHaveLength(METHODS.length);
  });

  it('nothing short: ranked for 10,000 more coins out of the coins in hand, no shortfall offered', () => {
    const s = scenario(market(), { bagCoins: 5000, bankCoins: 20000 });
    expect(s.assessment.state).toBe('COVERED');
    const list = moneyList(s.base, s.assessment);
    expect(list.rankedFor).toEqual({ coins: BROWSE_TARGET, stepId: null });
    expect(list.shortfall).toBeNull();
    expect(list.ranking.best).not.toBeNull();
  });

  it('no coins at all: methods with a cost to start are locked with what they cost; the free ones stay in the list', () => {
    const s = scenario(market(), { bagCoins: 0, bankCoins: 0, stats: SKILLED });
    const list = moneyList(s.base, s.assessment);
    // Collecting iron in Al Kharid pays the toll gate: 20 gp before the first ore.
    const collect = byId(list.evals, 'collect-iron-al-kharid');
    expect(collect.eligible).toBe(false);
    expect(collect.blockers.map((b) => b.kind)).toEqual(['capital']);
    const shown = browse(list.evals, list.ranking, DEFAULT_FILTERS, 'recommended');
    expect(shown.rows.every((r) => r.badge.tone !== 'locked')).toBe(true);
    expect(shown.rows.some((r) => r.evaluation.method.id === 'cows-cowhide')).toBe(true);
    expect(shown.rows.some((r) => r.evaluation.method.id === 'collect-iron-al-kharid')).toBe(false);
    const all = browse(list.evals, list.ranking, only({ availableOnly: false }), 'recommended');
    const row = all.rows.find((r) => r.evaluation.method.id === 'collect-iron-al-kharid')!;
    expect(row.badge).toEqual({ text: 'A first batch costs about 20 gp', tone: 'locked' });
    expect(collect.checks).toContainEqual({ text: 'A first batch costs about 20 gp (you have 0 gp)', status: 'missing' });
  });
});

describe('unknown is never available', () => {
  it('an unread bank: the tool is "not confirmed", and "more coins" cannot start while an open session can', () => {
    const s = scenario(market(), { bagCoins: 400, bankCoins: null, bankSeen: false, stats: SKILLED });
    const list = moneyList(s.base, s.assessment);
    expect(badgeOf(byId(list.evals, 'mine-iron-dwarven'))).toEqual({ text: 'Not confirmed: tool unknown, open the bank', tone: 'unknown' });
    expect(byId(list.evals, 'mine-iron-dwarven').checks).toContainEqual({ text: 'A suitable tool: not known, open the bank', status: 'unknown' });
    expect(s.snap.liquid.complete).toBe(false);
    expect(goalBlocker({ kind: 'amount', coins: 5000 }, s.snap)).toMatch(/Open your bank/);
    expect(goalBlocker({ kind: 'open' }, s.snap)).toBeNull();
  });

  it('a level the game has not sent: "not confirmed" with the skill, and its check says so', () => {
    const s = scenario(market(), { bagCoins: 5000, bankCoins: 0 });
    const coal = byId(moneyList(s.base, s.assessment).evals, 'mine-coal-dwarven');
    expect(badgeOf(coal)).toEqual({ text: 'Not confirmed: mining level unknown', tone: 'unknown' });
    expect(coal.checks).toContainEqual({ text: 'mining 30: your level is not known', status: 'unknown' });
  });

  it('where the player stands is not a requirement: an eligible method with only that unknown can be done now', () => {
    const s = scenario(market(), { bagCoins: 5000, bankCoins: 0 });
    const cows = byId(moneyList(s.base, s.assessment).evals, 'cows-cowhide');
    expect(badgeOf({ ...cows, cautions: ['Where you are is not known, so the walk is not counted'] })).toEqual({ text: 'Can do now', tone: 'ok' });
    expect(badgeOf({ ...cows, cautions: ['Your coins are not known'] }).tone).toBe('unknown');
    expect(badgeOf({ ...cows, eligible: false, blockers: [{ kind: 'level', text: 'Needs mining 15 (you have 10)', fixable: true }] }))
      .toEqual({ text: 'Needs mining 15 (you have 10)', tone: 'locked' });
  });

  it('restricted trading: what a new account cannot sell is locked and says why', () => {
    const s = scenario(market(), { bagCoins: 400, bankCoins: 0, sellOverride: 'active' });
    const cows = byId(moneyList(s.base, s.assessment).evals, 'cows-cowhide');
    expect(cows.eligible).toBe(false);
    expect(badgeOf(cows)).toEqual({ text: 'What it makes cannot be sold yet (new-account limits)', tone: 'locked' });
  });

  it('members-only: locked for a free account, out of the default list, open to a members account', () => {
    const s = scenario(market(), { bagCoins: 5000, bankCoins: 0 });
    const members = { ...methodById('cows-cowhide')!, id: 'members-test', title: 'Members test', access: 'members' as const };
    const list = moneyList(s.base, s.assessment, { methods: [...METHODS, members] });
    const e = byId(list.evals, 'members-test');
    expect(badgeOf(e)).toEqual({ text: 'Needs membership', tone: 'locked' });
    expect(browse(list.evals, list.ranking, DEFAULT_FILTERS, 'recommended').rows.some((r) => r.evaluation.method.id === 'members-test')).toBe(false);
    expect(browse(list.evals, list.ranking, only({ availableOnly: false }), 'recommended').rows.some((r) => r.evaluation.method.id === 'members-test')).toBe(true);
    const asMember = evaluate(members, { ...s.base, snap: { ...s.snap, members: true }, cash: 5000, mode: 'earn', target: BROWSE_TARGET });
    expect(asMember.blockers.some((b) => b.kind === 'membership')).toBe(false);
    expect(asMember.checks[0]).toEqual({ text: 'Membership', status: 'ok' });
  });
});

describe('prices: a missing estimate is never a zero, earlier prices are still estimates', () => {
  it('no prices at all: "Estimate unavailable" and locked on the missing price', () => {
    const s = scenario(market(), { bagCoins: 5000, bankCoins: 0 });
    const none = fakePrices({}, 'offline');
    const list = moneyList({ ...s.base, prices: none }, null);
    const cows = byId(list.evals, 'cows-cowhide');
    expect(netText(cows)).toBe('Estimate unavailable');
    expect(badgeOf(cows)).toEqual({ text: 'No price for Cowhide', tone: 'locked' });
    expect(list.ranking.best).toBeNull();
  });

  it('earlier (stale) prices still give ranges, not "unavailable"', () => {
    const s = scenario(market({}, 'stale'), { bagCoins: 5000, bankCoins: 0 });
    const cows = byId(moneyList(s.base, s.assessment).evals, 'cows-cowhide');
    expect(netText(cows)).toMatch(/^\d[\d.]*k?–\d[\d.]*k? gp\/h net$|^\d[\d.]*k? gp\/h net$/);
  });

  it('the coins to start are rounded up, and nothing to pay says so', () => {
    expect(capitalText({ upfront: { setup: 0, minimum: 0, firstTrip: 239.001, owned: [] } })).toBe('240 gp to start');
    expect(capitalText({ upfront: { setup: 0, minimum: 0, firstTrip: 0, owned: [] } })).toBe('No coins needed');
  });
});

describe('search, filters and sort', () => {
  const s = scenario(market(), { bagCoins: 5000, bankCoins: 20000, stats: SKILLED, items: { 'Bronze pickaxe': [1, 0], 'Bronze axe': [1, 0] } });
  const list = moneyList(s.base, s.assessment);
  const all = only({ availableOnly: false });

  it('search finds by name, place and summary', () => {
    const coal = browse(list.evals, list.ranking, { ...all, query: 'coal' }, 'recommended').rows.map((r) => r.evaluation.method);
    expect(coal.map((m) => m.id)).toContain('mine-coal-dwarven');
    expect(coal.every((m) => /coal/i.test(`${m.title} ${m.summary} ${m.spot.label}`))).toBe(true);
    expect(browse(list.evals, list.ranking, { ...all, query: 'falador' }, 'recommended').rows.length).toBeGreaterThan(0);
    expect(browse(list.evals, list.ranking, { ...all, query: 'nothing like this' }, 'recommended').rows).toEqual([]);
  });

  it('each filter keeps only what it says, and the hidden count is the rest', () => {
    const total = list.evals.length;
    for (const [f, ok] of [
      [{ category: 'gathering' }, (r: ReturnType<typeof browse>['rows'][number]) => r.category === 'gathering'],
      [{ noCapital: true }, (r: ReturnType<typeof browse>['rows'][number]) => r.capital === 'No coins needed'],
      [{ relaxedOnly: true }, (r: ReturnType<typeof browse>['rows'][number]) => r.evaluation.method.intensity === 'low'],
    ] as const) {
      const out = browse(list.evals, list.ranking, { ...all, ...f }, 'recommended');
      expect(out.rows.length).toBeGreaterThan(0);
      expect(out.rows.every(ok)).toBe(true);
      expect(out.hidden).toBe(total - out.rows.length);
    }
  });

  it('sorts by profit, by coins to start and by effort; the default order is the ranking', () => {
    const profit = browse(list.evals, list.ranking, all, 'profit').rows.map((r) => r.evaluation.netPerHour.slow);
    expect([...profit].sort((a, b) => b - a)).toEqual(profit);
    const capital = browse(list.evals, list.ranking, all, 'capital').rows.map((r) => r.evaluation.upfront.setup + r.evaluation.upfront.firstTrip);
    expect([...capital].sort((a, b) => a - b)).toEqual(capital);
    const rank = { low: 0, moderate: 1, high: 2 };
    const effort = browse(list.evals, list.ranking, all, 'intensity').rows.map((r) => rank[r.evaluation.method.intensity]);
    expect([...effort].sort((a, b) => a - b)).toEqual(effort);
    const def = browse(list.evals, list.ranking, all, 'recommended').rows.map((r) => r.evaluation.method.id);
    expect(def.slice(0, list.ranking.list.length)).toEqual(list.ranking.list.map((e) => e.method.id));
    expect(browse(list.evals, list.ranking, all, 'recommended').recommended).toBe(list.ranking.best);
  });
});

describe('the details: every requirement and how the player meets it', () => {
  it('levels, a tool held, a fare, a quest and the coins to start, in the catalogue\'s words', () => {
    const s = scenario(market(), { bagCoins: 5000, bankCoins: 0, stats: SKILLED, items: { 'Bronze pickaxe': [1, 0] } });
    const evals = moneyList(s.base, s.assessment).evals;
    const iron = byId(evals, 'mine-iron-dwarven');
    expect(iron.checks).toContainEqual({ text: 'mining 15 (you have 31)', status: 'ok' });
    expect(iron.checks.some((c) => c.status === 'ok' && /pickaxe \(you have one\)/.test(c.text))).toBe(true);
    const collect = byId(evals, 'collect-iron-al-kharid');
    expect(collect.checks).toContainEqual({ text: 'The Al Kharid toll gate, both ways: 20 gp a trip', status: 'info' });
    const shields = byId(evals, 'oziach-shields');
    expect(shields.checks.some((c) => /Dragon Slayer I/.test(c.text) && c.status !== 'ok')).toBe(true);
    for (const e of evals) expect(e.checks.some((c) => /coins needed to start|Coins to start|costs|first batch/.test(c.text)), e.method.id).toBe(true);
  });
});
