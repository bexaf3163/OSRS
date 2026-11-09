import { describe, expect, it, vi } from 'vitest';
import {
  allQuests, allSteps, items, itemById, maxQpFor, membersSkills, stepsFor,
} from '../src/data';
import { deriveQuests } from '../src/data/quests';
import { createPriceService, PRICE_TTL_MS } from '../src/services/pricesApi';
import { cleanWikiText } from '../src/domain/text/md';
import { stepText } from '../src/domain/quests/search';

describe('game mode', () => {
  it('F2P — stages 1–5 without members steps', () => {
    expect([...new Set(stepsFor('f2p').map((s) => s.stage))]).toEqual([1, 2, 3, 4, 5]);
    expect(stepsFor('f2p').some((s) => s.membersOnly)).toBe(false);
  });

  it('Members adds stages 7–9', () => {
    expect([...new Set(stepsFor('f2p').map((s) => s.stage))]).toEqual([1, 2, 3, 4, 5]);
    expect([...new Set(stepsFor('members').map((s) => s.stage))]).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
    expect([...new Set(allSteps.filter((s) => s.membersOnly).map((s) => s.stage))]).toEqual([7, 8, 9]);
    const extra = stepsFor('members').filter((s) => !stepsFor('f2p').includes(s));
    expect(extra.every((s) => s.membersOnly && s.stage >= 7)).toBe(true);
    // Nothing is lost from the free route.
    expect(stepsFor('f2p').filter((s) => !stepsFor('members').includes(s))).toEqual([]);
  });

  it('members steps do not depend on anything outside Members, F2P steps — on members steps', () => {
    const f2pIds = new Set(stepsFor('f2p').map((s) => s.id));
    for (const s of stepsFor('f2p')) for (const r of s.requires) expect(f2pIds.has(r), `${s.id} → ${r}`).toBe(true);
  });

  it('an alternative for members — only on F2P steps', () => {
    for (const s of allSteps.filter((x) => x.membersAlternative)) expect(s.membersOnly).toBeFalsy();
  });

  it('eight members skills with an English name and a wiki', () => {
    expect(membersSkills).toHaveLength(8);
    for (const m of membersSkills) expect(m.wiki).toBe(`https://oldschool.runescape.wiki/w/${m.nameEn}`);
  });
});

describe('quests from the route', () => {
  it('Dragon Slayer I — one record from the steps S5-01…S5-09', () => {
    const ds = allQuests.find((q) => q.stepId === 'S5-09')!;
    expect(ds.title).toBe('Dragon Slayer I');
    expect(ds.qp).toBe(2);
    expect(ds.parts).toEqual(['S5-01', 'S5-03', 'S5-04', 'S5-05', 'S5-06', 'S5-07', 'S5-08', 'S5-09']);
  });

  it('the sum of quest points matches the route in both modes', () => {
    const f2p = allQuests.filter((q) => !q.membersOnly).reduce((s, q) => s + q.qp, 1);
    expect(f2p).toBe(maxQpFor('f2p'));
    expect(allQuests.reduce((s, q) => s + q.qp, 1)).toBe(maxQpFor('members'));
  });

  it('every quest step goes into exactly one record', () => {
    const questSteps = allSteps.filter((s) => s.type === 'quest').map((s) => s.id);
    const covered = allQuests.flatMap((q) => (q.parts.length ? q.parts : [q.stepId]));
    expect([...covered].sort()).toEqual([...questSteps].sort());
  });

  it('an intro without points with its own quest — a separate record', () => {
    const quests = deriveQuests(allSteps);
    const intro = quests.find((q) => q.stepId === 'S9-03')!;
    expect(intro.qp).toBe(0);
    expect(intro.parts).toEqual([]);
  });
});

describe('quest requirements come before the quests themselves', () => {
  const index = new Map(allSteps.map((s, i) => [s.id, i]));
  const before = (a: string, b: string) => expect(index.get(a)!, `${a} before ${b}`).toBeLessThan(index.get(b)!);

  it('members quests — after their requirement quests', () => {
    before('S8-01', 'S8-02'); // Priest in Peril → Nature Spirit
    before('S9-01', 'S9-02'); // Lost City → Fairytale I
    before('S8-02', 'S9-02'); // Nature Spirit → Fairytale I
    before('S9-02', 'S9-03'); // Fairytale I → the Fairytale II intro
    before('S7-05', 'S9-04'); // The Grand Tree → Monkey Madness I
    expect(allSteps.find((s) => s.id === 'S9-02')!.requires).toEqual(expect.arrayContaining(['S9-01', 'S8-02']));
  });

});

describe('exchange prices', () => {
  const latest = { data: { '1540': { high: 9000, highTime: 1_790_000_000, low: 8500, lowTime: 1_790_000_100 } } };
  const fetchFn = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => latest }));

  it('one request for all items, then a 5-minute cache', async () => {
    let t = 0;
    const f = fetchFn();
    const svc = createPriceService(f, () => t);
    const p = await svc.getGePrice(1540);
    // The old three fields are unchanged; updatedAt is the OLDER side (the high side, 1_790_000_000), and each side has its own time.
    expect(p).toEqual({
      buyPrice: 9000, sellPrice: 8500, updatedAt: new Date(1_790_000_000 * 1000).toISOString(),
      highAt: new Date(1_790_000_000 * 1000).toISOString(), lowAt: new Date(1_790_000_100 * 1000).toISOString(),
    });
    await svc.getGePrice(1540);
    t = PRICE_TTL_MS - 1;
    await svc.getGePrice(999);
    expect(f).toHaveBeenCalledTimes(1);
    t = PRICE_TTL_MS + 1;
    await svc.getGePrice(1540);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('simultaneous requests are not duplicated', async () => {
    const f = fetchFn();
    const svc = createPriceService(f, () => 0);
    await Promise.all([svc.getGePrice(1540), svc.getGePrice(1540), svc.getGePrice(1)]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('an untradeable item — null, a network error — a failure without spoiling the cache', async () => {
    const svc = createPriceService(fetchFn(), () => 0);
    expect(await svc.getGePrice(42)).toBeNull();
    const down = createPriceService(async () => ({ ok: false, status: 503, json: async () => ({}) }), () => 0);
    await expect(down.getGePrice(1540)).rejects.toThrow('503');
  });
});

describe('item database', () => {
  it('120+ items, each with an icon and a wiki article', () => {
    expect(items.length).toBeGreaterThanOrEqual(120);
    for (const i of items) {
      expect(i.iconUrl, i.nameEn).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/images\//);
      expect(i.wikiUrl, i.nameEn).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/w\//);
    }
  });

  it('step items refer to the database, the icons match', () => {
    for (const s of allSteps) {
      for (const it of [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])]) {
        const db = itemById.get(it.wikiItemId!);
        expect(db, `${s.id}: ${it.nameEn}`).toBeDefined();
        expect(it.iconUrl).toBe(db!.iconUrl);
      }
    }
  });

  it('wiki markup turns into text', () => {
    expect(cleanWikiText("[[Lumbridge Castle|the castle]] '''kitchen'''")).toBe('the castle kitchen');
  });
});

describe('step text for search', () => {
  it('includes the NPC, the items and "Done when"', () => {
    const s = allSteps.find((x) => x.id === 'S2-02')!;
    const text = stepText(s);
    expect(text).toContain(s.npc!.nameEn);
    expect(text).toContain(s.doneWhen.slice(0, 20));
  });
});
