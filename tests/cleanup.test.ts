import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';
import { cleanupAdvice, emptyCleanupPrefs, OBSOLETE, recLabel, type CleanupInput, type CleanupPrefs } from '../src/lib/cleanup';
import type { Step } from '../src/types';

const open = (...ids: string[]): Step[] => ids.map((id) => allSteps.find((s) => s.id === id)!);
const PRICES: Record<string, number> = { 'Ball of wool': 60, 'Oak logs': 90, 'Bronze bar': 30, 'Cowhide': 150, 'Yew logs': 300 };
const input = (over: Partial<CleanupInput>): CleanupInput => ({
  bag: [], openSteps: [], bankSeen: true, account: 'normal', restriction: 'LIFTED',
  price: (n) => PRICES[n] ?? null, tradeable: () => true, prefs: emptyCleanupPrefs(), ...over,
});
const by = (r: ReturnType<typeof cleanupAdvice>, name: string) => [...r.recs, ...r.keeps].filter((x) => x.name === name);

describe('inventory cleanup', () => {
  it('without the bag from the game there is no advice', () => {
    const r = cleanupAdvice(input({ bag: null }));
    expect(r.recs).toEqual([]);
    expect(r.keeps).toEqual([]);
  });

  it('a quest item a later quest still needs is kept, and only the surplus is sold', () => {
    const r = cleanupAdvice(input({ openSteps: open('S2-10'), bag: [{ name: 'Ball of wool', count: 23 }] }));
    const [rec] = by(r, 'Ball of wool');
    expect(rec.action).toBe('sell');
    expect(rec.qty).toBe(20);
    expect(rec.keepQty).toBe(3);
    expect(rec.reason).toMatch(/Keep 3 for Prince Ali Rescue/);
    expect(rec.reason).toMatch(/sell the remaining 20/);
    expect(rec.proceeds).toBe(1200);
  });

  it('every open step counts, not only the next: the need is summed over the route', () => {
    const r = cleanupAdvice(input({ openSteps: open('S2-10', 'S9-04'), bag: [{ name: 'Ball of wool', count: 23 }] }));
    const [rec] = by(r, 'Ball of wool');
    expect(rec.keepQty).toBe(4);
    expect(rec.qty).toBe(19);
    expect(rec.reason).toMatch(/Prince Ali Rescue/);
  });

  it('exactly what is needed is kept: not a word of surplus', () => {
    const r = cleanupAdvice(input({ openSteps: open('S2-10'), bag: [{ name: 'Ball of wool', count: 3 }] }));
    expect(r.recs).toEqual([]);
    expect(by(r, 'Ball of wool')[0].action).toBe('keep');
  });

  it('a partly done quest is an open step: its remaining needs count in full', () => {
    // The step is open (not closed) however far the quest went in the game.
    const r = cleanupAdvice(input({ openSteps: open('S1-04'), bag: [{ name: 'Ball of wool', count: 23 }] }));
    expect(by(r, 'Ball of wool')[0].action).toBe('keep');
  });

  it('with the quest done and nothing else asking, the item is sold with the honest wording', () => {
    const r = cleanupAdvice(input({ openSteps: [], bag: [{ name: 'Ball of wool', count: 5 }] }));
    const [rec] = by(r, 'Ball of wool');
    expect(rec.action).toBe('sell');
    expect(rec.reason).toMatch(/No future use identified in the selected route/);
    expect(rec.reason).not.toMatch(/safe/i);
  });

  it('a completed quest\'s item with another use is kept', () => {
    const r = cleanupAdvice(input({ openSteps: [], bag: [{ name: 'Dramen staff', count: 1 }, { name: 'Ghostspeak amulet', count: 1 }] }));
    expect(by(r, 'Dramen staff')[0].action).toBe('keep');
    expect(by(r, 'Dramen staff')[0].reason).toMatch(/fairy rings/);
    expect(by(r, 'Ghostspeak amulet')[0].action).toBe('keep');
  });

  it('money, food, runes, tools and jewellery are never advised away', () => {
    const bag = ['Coins', 'Lobster', 'Air rune', 'Hammer', 'Amulet of glory', 'Tinderbox', 'Varrock teleport'].map((name) => ({ name, count: 5 }));
    const r = cleanupAdvice(input({ bag }));
    expect(r.recs).toEqual([]);
    expect(r.keeps.length).toBe(bag.length);
  });

  it('a charged or transformed item is never sold by a rule, and is never mistaken for the plain item', () => {
    const r = cleanupAdvice(input({ openSteps: [], bag: [{ name: 'Games necklace(5)', count: 1 }, { name: 'Ring of dueling(8)', count: 1 }, { name: 'Amulet of glory (uncharged)', count: 1 }, { name: 'Bracelet (charged)', count: 1 }] }));
    expect(r.recs.filter((x) => x.action === 'sell')).toEqual([]);
    // jewellery is kept outright; the odd variants go to review
    expect(by(r, 'Bracelet (charged)')[0].action).toBe('keep');
  });

  it('a charged variant of a thing the route needs does not satisfy the need for the plain thing', () => {
    // 'Ball of wool (charged)' is not 'Ball of wool': the plain one is still short, the odd one is for the player to look at.
    const r = cleanupAdvice(input({ openSteps: open('S2-10'), bag: [{ name: 'Ball of wool (empty)', count: 3 }] }));
    const [rec] = by(r, 'Ball of wool (empty)');
    expect(rec.action).toBe('review');
    expect(rec.reason).toMatch(/Charged or transformed/);
  });

  it('noted and plain stacks together cover the need; the surplus is sold from the banknotes first', () => {
    const r = cleanupAdvice(input({
      openSteps: open('S2-10'),
      bag: [{ id: 1759, name: 'Ball of wool', count: 3 }, { id: 1760, name: 'Ball of wool', count: 10, noted: true }],
    }));
    const sells = r.recs.filter((x) => x.action === 'sell');
    expect(sells).toHaveLength(1);
    expect(sells[0].noted).toBe(true);
    expect(sells[0].qty).toBe(10);
    expect(recLabel(sells[0])).toBe('Ball of wool ×10 (noted)');
    expect(r.keeps.some((k) => !k.noted && k.action === 'keep')).toBe(true);
  });

  it('a restricted account does not get "sell" for the items the restriction stops, but may for the others', () => {
    const bag = [{ name: 'Oak logs', count: 50 }, { name: 'Ball of wool', count: 10 }];
    const r = cleanupAdvice(input({ bag, restriction: 'RESTRICTED' }));
    expect(by(r, 'Oak logs')[0].action).toBe('review');
    expect(by(r, 'Oak logs')[0].reason).toMatch(/restrictions still stop/);
    expect(by(r, 'Ball of wool')[0].action).toBe('sell');
    expect(cleanupAdvice(input({ bag, restriction: 'LIFTED' })).recs.every((x) => x.action === 'sell')).toBe(true);
    expect(by(cleanupAdvice(input({ bag, restriction: 'UNKNOWN' })), 'Oak logs')[0].reason).toMatch(/not known whether/);
  });

  it('an Ironman, or an unknown account type, never gets a sale', () => {
    const bag = [{ name: 'Ball of wool', count: 10 }];
    const iron = cleanupAdvice(input({ bag, account: 'ironman' }));
    expect(iron.recs[0].action).toBe('review');
    expect(iron.recs[0].reason).toMatch(/Ironman/);
    const unk = cleanupAdvice(input({ bag, account: null }));
    expect(unk.recs[0].action).toBe('review');
    expect(unk.recs[0].proceeds).toBeNull();
  });

  it('an untradeable item is never offered for sale, and an item list that has not loaded does not allow it', () => {
    const bag = [{ name: 'Strange relic', count: 1 }];
    const no = cleanupAdvice(input({ bag, tradeable: () => false }));
    expect(no.recs[0].action).toBe('review');
    expect(no.recs[0].reason).toMatch(/cannot be sold/);
    const loading = cleanupAdvice(input({ bag, tradeable: () => null }));
    expect(loading.recs[0].action).toBe('review');
  });

  it('gear is looked at by the player, not sold by a rule', () => {
    const r = cleanupAdvice(input({ bag: [{ name: 'Iron scimitar', count: 1 }] }));
    expect(r.recs[0].action).toBe('review');
    expect(r.recs[0].reason).toMatch(/backup/);
  });

  it('a missing price still lists the sale, with no proceeds and a word about it', () => {
    const r = cleanupAdvice(input({ bag: [{ name: 'Mystery item', count: 2 }] }));
    expect(r.recs[0].action).toBe('sell');
    expect(r.recs[0].proceeds).toBeNull();
    expect(r.recs[0].reason).toMatch(/No exchange price/);
  });

  it('a stale or unseen bank is stated; the bag alone is judged', () => {
    const r = cleanupAdvice(input({ bankSeen: false, bag: [{ name: 'Ball of wool', count: 5 }] }));
    expect(r.notes.join(' ')).toMatch(/bank has not been opened/);
  });

  it('"Always keep" wins over a sale, per item', () => {
    const prefs: CleanupPrefs = { keep: ['ball of wool'], dismissed: [] };
    const r = cleanupAdvice(input({ bag: [{ name: 'Ball of wool', count: 5 }, { name: 'Cowhide', count: 5 }], prefs }));
    expect(by(r, 'Ball of wool')[0].action).toBe('keep');
    expect(by(r, 'Ball of wool')[0].reason).toMatch(/Always keep/);
    expect(by(r, 'Cowhide')[0].action).toBe('sell');
  });

  it('a dismissed suggestion is hidden, but a different suggestion for the same item shows again', () => {
    const bag = [{ name: 'Ball of wool', count: 5 }];
    const prefs: CleanupPrefs = { keep: [], dismissed: ['ball of wool|sell'] };
    const hidden = cleanupAdvice(input({ bag, prefs }));
    expect(hidden.recs).toEqual([]);
    expect(hidden.notes.join(' ')).toMatch(/1 dismissed suggestion is hidden/);
    const other = cleanupAdvice(input({ bag, prefs, account: 'ironman' }));
    expect(other.recs[0].action).toBe('review');
  });

  it('a different character has its own preferences: the same bag gives different advice', () => {
    const bag = [{ name: 'Ball of wool', count: 5 }];
    const a = cleanupAdvice(input({ bag, prefs: { keep: ['ball of wool'], dismissed: [] } }));
    const b = cleanupAdvice(input({ bag, prefs: emptyCleanupPrefs() }));
    expect(a.recs).toEqual([]);
    expect(b.recs[0].action).toBe('sell');
  });

  it('cleanup advice never changes the route: the input steps are not touched', () => {
    const steps = open('S2-10', 'S9-04');
    const before = JSON.stringify(steps);
    cleanupAdvice(input({ openSteps: steps, bag: [{ name: 'Ball of wool', count: 23 }] }));
    expect(JSON.stringify(steps)).toBe(before);
  });

  it('every line names the item, the quantity and a reason', () => {
    const r = cleanupAdvice(input({
      openSteps: open('S2-10'),
      bag: [{ name: 'Ball of wool', count: 23 }, { name: 'Cowhide', count: 12 }, { name: 'Iron scimitar', count: 1 }],
    }));
    for (const rec of [...r.recs, ...r.keeps]) {
      expect(rec.name).toBeTruthy();
      expect(rec.qty).toBeGreaterThan(0);
      expect(rec.reason.length).toBeGreaterThan(5);
    }
  });

  it('only checked items are ever advised to drop; the table is a verified subset', () => {
    for (const [k, v] of Object.entries(OBSOLETE)) {
      expect(k).toBe(k.toLowerCase());
      expect(v.after.length).toBeGreaterThan(0);
      expect(v.source).toMatch(/Wiki/);
      expect(v.why.length).toBeGreaterThan(10);
      expect(v.recovery.length).toBeGreaterThan(3);
    }
    const r = cleanupAdvice(input({ bag: [{ name: 'Some quest leftover', count: 1 }], tradeable: () => false }));
    expect(r.recs.every((x) => x.action !== 'drop')).toBe(true);
  });
});

describe('cleanup data from the plugin', () => {
  it('banknotes are told apart from the item; a plugin that does not send the flag means "the item itself"', async () => {
    const { parseGear } = await import('../src/services/runeliteBridge');
    const g = parseGear({ inventory: [{ id: 1759, name: 'Ball of wool', count: 3 }, { id: 1760, name: 'Ball of wool', count: 10, noted: true }, { id: 1, name: 'Odd', count: 1, noted: 'yes' }], equipment: [] });
    expect(g!.inventory![0].noted).toBeUndefined();
    expect(g!.inventory![1].noted).toBe(true);
    expect(g!.inventory![2].noted).toBeUndefined();
  });
});

describe('cleanup preferences storage', () => {
  it('are kept per profile and per character, and unreadable data means none', async () => {
    const m = await import('../src/lib/cleanupPrefs');
    expect(m.cleanupKey('main', 'Bexqq')).not.toBe(m.cleanupKey('main', 'Other'));
    expect(m.cleanupKey('main', 'Bexqq')).not.toBe(m.cleanupKey('alt', 'Bexqq'));
    expect(m.cleanupKey('main', ' bexqq ')).toBe(m.cleanupKey('main', 'Bexqq'));
    expect(m.parseCleanupPrefs('{broken')).toEqual({ keep: [], dismissed: [] });
    expect(m.parseCleanupPrefs('{"keep":[1,"a"],"dismissed":"x","account":"hardcore"}')).toEqual({ keep: ['a'], dismissed: [] });
    const p = m.withAccount(m.withDismissed(m.withKeep(emptyCleanupPrefs(), 'ball of wool', true), 'cowhide', 'sell', true), 'ironman');
    expect(m.parseCleanupPrefs(JSON.stringify(p))).toEqual({ keep: ['ball of wool'], dismissed: ['cowhide|sell'], account: 'ironman' });
    expect(m.withKeep(p, 'ball of wool', false).keep).toEqual([]);
    expect(m.withAccount(p, null).account).toBeUndefined();
  });
});

describe('cleanup wording across stacks', () => {
  it('plain and noted stacks of one item: the route keeps the plain ones, the surplus is said once without repeating the keep', () => {
    const r = cleanupAdvice(input({
      openSteps: open('S2-10'), tradeable: () => null,
      bag: [{ id: 1759, name: 'Ball of wool', count: 23 }, { id: 1760, name: 'Ball of wool', count: 7, noted: true }],
    }));
    const reviews = r.recs.filter((x) => x.action === 'review');
    expect(reviews.map((x) => `${x.qty}${x.noted ? 'n' : ''}`).sort()).toEqual(['20', '7n']);
    expect(reviews.filter((x) => /Keep 3 for Prince Ali Rescue/.test(x.reason))).toHaveLength(1);
    expect(r.keeps.find((k) => k.name === 'Ball of wool' && !k.noted)?.qty).toBe(3);
  });
});

describe('verified drop table', () => {
  const bag = [{ name: 'Research package', count: 1 }, { name: "Ghost's skull", count: 1 }];
  it('advises Drop/Destroy only once the quest of the item is closed, with how to get it back', () => {
    const done = cleanupAdvice(input({ bag, tradeable: () => false, closedSteps: new Set(['S2-06', 'S1-06']) }));
    const pkg = done.recs.find((r) => r.name === 'Research package')!;
    expect(pkg.action).toBe('drop');
    expect(pkg.reason).toMatch(/Destroy/);
    expect(pkg.recovery).toMatch(/Sedridor/);
    expect(done.recs.find((r) => r.name === "Ghost's skull")!.action).toBe('drop');
  });
  it('before the quest is closed it is only a review, never a drop', () => {
    const r = cleanupAdvice(input({ bag, tradeable: () => false, closedSteps: new Set(['S2-06']) }));
    expect(r.recs.find((x) => x.name === 'Research package')!.action).toBe('drop');
    expect(r.recs.find((x) => x.name === "Ghost's skull")!.action).toBe('review');
    expect(cleanupAdvice(input({ bag, tradeable: () => false })).recs.every((x) => x.action === 'review')).toBe(true);
  });
  it('an open step that still needs the item keeps it, even with the quest closed', () => {
    const r = cleanupAdvice(input({ bag, tradeable: () => false, closedSteps: new Set(['S2-06']), openSteps: [{ ...open('S2-10')[0], itemsRequired: [{ nameEn: 'Research package', amount: 1, howToGet: 'x', inStep: false }] } as Step] }));
    expect(r.keeps.some((k) => k.name === 'Research package')).toBe(true);
  });
});
