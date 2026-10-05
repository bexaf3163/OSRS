import { describe, expect, it } from 'vitest';
import {
  createWikiLocator, isPoint, matchLoose, matchStrict, normalizeName, pruneStore, resolveLocationCoordinates, type WikiLocator,
} from '../src/services/locationResolver';
import { articleMapPoint, cleanWikiText, locLinePoint, mapTemplatePoints, spawnPoint } from '../src/services/wikiApi';
import majorLocations from '../src/data/majorLocations.json';

/** A wiki stub: answers with the markup of the articles from the table, counts the requests. */
function fakeWiki(pages: Record<string, string>, fail = false) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    const page = new URL(url).searchParams.get('page') ?? '';
    calls.push(page);
    if (fail) throw new Error('offline');
    const text = pages[page];
    return {
      ok: true,
      status: 200,
      json: async () => (text === undefined
        ? { error: { code: 'missingtitle' } }
        : { parse: { title: page, wikitext: text } }),
    };
  };
  return { fetchFn, calls };
}

const noWiki: WikiLocator = {
  article: async () => { throw new Error('must not call the wiki'); },
  spawn: async () => { throw new Error('must not call the wiki'); },
  clear() {},
};

describe('the place dictionary', () => {
  it('is collected from the wiki and has no invented points', () => {
    const { locations, source } = majorLocations as { source: string; locations: Record<string, { x: number; y: number; plane: number; page: string }> };
    expect(source).toMatch(/OSRS Wiki/);
    const entries = Object.values(locations);
    expect(entries.length).toBeGreaterThanOrEqual(60);
    for (const e of entries) {
      expect(e.x).toBeGreaterThan(1000);
      expect(e.y).toBeGreaterThan(2000);
      expect([0, 1, 2, 3]).toContain(e.plane);
      expect(e.page).toBeTruthy();
    }
  });

  it('the name is reduced to a common form', () => {
    expect(normalizeName("Fred the Farmer's house")).toBe('fred farmer house');
    expect(normalizeName('Lumbridge Castle 2nd floor')).toBe('lumbridge castle');
    expect(normalizeName('Port Sarim (Members only)')).toBe('port sarim');
  });

  it('an exact name, a synonym and case-insensitive', () => {
    expect(matchStrict('Port Sarim')).toMatchObject({ x: 3029, y: 3221, match: 'exact', source: 'dictionary' });
    expect(matchStrict('GE')).toMatchObject({ label: 'Grand Exchange', match: 'alias' });
    expect(matchStrict('port sarim')).toMatchObject({ label: 'Port Sarim' });
    expect(matchStrict("Gerrant's Fishy Business.")).toMatchObject({ label: "Gerrant's Fishy Business" });
    expect(matchStrict('Varrock - east of the Grand Exchange')).toBeNull();
  });

  it('a mention in a line and a typo', () => {
    expect(matchLoose('Varrock - east of the Grand Exchange')).toMatchObject({ label: 'Grand Exchange', match: 'substring' });
    expect(matchLoose("Lumbridge - outside Fred the Farmer's house")).toMatchObject({ label: 'Fred the Farmer' });
    expect(matchLoose('Draynor Vilage')).toMatchObject({ label: 'Draynor Village', match: 'substring' });
    expect(matchLoose('Port Sarm')).toMatchObject({ label: 'Port Sarim', match: 'fuzzy' });
    expect(matchLoose('Xyzzy plugh')).toBeNull();
  });
});

describe('resolveLocationCoordinates', () => {
  it('A: "Lumbridge Swamp by Fishing tutor" — from the dictionary, without the wiki', async () => {
    const r = await resolveLocationCoordinates('Lumbridge Swamp by Fishing tutor', undefined, {}, noWiki);
    // The middle of the five "Lumbridge Swamp" fishing spots from the Fishing spot page (small net, bait): 3243,3150.
    // In the task example it is 3241,3152, within two tiles; the Fishing tutor himself stands at 3244,3157.
    expect(r).toMatchObject({ x: 3243, y: 3150, plane: 0, source: 'dictionary', label: 'Lumbridge Swamp fishing spots' });
  });

  it('B: Port Sarim', async () => {
    expect(await resolveLocationCoordinates('Port Sarim', undefined, {}, noWiki)).toMatchObject({ x: 3029, y: 3221, source: 'dictionary' });
  });

  it('C: a shop is more precise than a town', async () => {
    const r = await resolveLocationCoordinates('Port Sarim', 'Gerrant', { shopName: "Gerrant's Fishy Business." }, noWiki);
    expect(r).toMatchObject({ x: 3015, y: 3225, label: "Gerrant's Fishy Business" });
  });

  it('D: an unknown place — a wiki search, without an exception', async () => {
    const { fetchFn } = fakeWiki({});
    const r = await resolveLocationCoordinates('Xyzzy plugh', undefined, {}, createWikiLocator(fetchFn, Date.now, false));
    expect(r.source).toBe('search-fallback');
    expect(isPoint(r)).toBe(false);
    if (!isPoint(r)) expect(r.searchUrl).toBe('https://oldschool.runescape.wiki/w/Special:Search?search=Xyzzy%20plugh');
  });

  it('the wiki does not answer — the dictionary "approximately", then a search', async () => {
    const { fetchFn } = fakeWiki({}, true);
    const wiki = createWikiLocator(fetchFn, Date.now, false);
    expect(await resolveLocationCoordinates('Varrock - east of the Grand Exchange', undefined, {}, wiki))
      .toMatchObject({ label: 'Grand Exchange', match: 'substring' });
    expect((await resolveLocationCoordinates('Nowhere at all', undefined, {}, wiki)).source).toBe('search-fallback');
  });

  it('the spawn is taken from the item page and is more precise than the town', async () => {
    const { fetchFn } = fakeWiki({
      'Bucket': "{{ItemSpawnLine|name=Bucket|location=[[Lumbridge Castle]] kitchen|members=No|x:3208,y:3214|x:3210,y:3214}}",
    });
    const r = await resolveLocationCoordinates('Lumbridge Castle kitchen', undefined, { itemPage: 'Bucket', itemName: 'Bucket' },
      createWikiLocator(fetchFn, Date.now, false));
    expect(r).toMatchObject({ x: 3209, y: 3214, plane: 0, source: 'wiki', match: 'spawn' });
  });

  it('a spawn in a town from the dictionary — the spawn tile, without a network — the town centre', async () => {
    const pages = { Egg: '{{ItemSpawnLine|name=Egg|location=[[Port Sarim]]|x:3017,y:3205}}' };
    const online = fakeWiki(pages);
    expect(await resolveLocationCoordinates('Port Sarim', undefined, { itemPage: 'Egg', itemName: 'Egg' }, createWikiLocator(online.fetchFn, Date.now, false)))
      .toMatchObject({ x: 3017, y: 3205, match: 'spawn' });
    const offline = fakeWiki(pages, true);
    expect(await resolveLocationCoordinates('Port Sarim (Members only)', undefined, { itemPage: 'Egg', itemName: 'Egg' }, createWikiLocator(offline.fetchFn, Date.now, false)))
      .toMatchObject({ x: 3029, y: 3221, source: 'dictionary' });
  });

  it('the NPC article on the wiki, when it is not in the dictionary', async () => {
    const { fetchFn } = fakeWiki({ 'Some trader': '{{Infobox NPC|name=Some trader}}\n{{Map|x=3100|y=3500|plane=1|mapID=0}}' });
    const r = await resolveLocationCoordinates('Somewhere odd', 'Some trader', {}, createWikiLocator(fetchFn, Date.now, false));
    expect(r).toMatchObject({ x: 3100, y: 3500, plane: 1, source: 'wiki', match: 'article', label: 'Some trader' });
  });
});

describe('the wiki cache', () => {
  it('one article — one request, including simultaneous clicks', async () => {
    const { fetchFn, calls } = fakeWiki({ Place: '{{Map|3200,3200}}' });
    const wiki = createWikiLocator(fetchFn, Date.now, false);
    const [a, b] = await Promise.all([wiki.article('Place'), wiki.article('Place')]);
    await wiki.article('Place');
    expect(a).toEqual({ x: 3200, y: 3200, plane: 0 });
    expect(b).toEqual(a);
    expect(calls).toEqual(['Place']);
  });

  it('expires after a week, an error — after a minute', async () => {
    let t = 0;
    const ok = fakeWiki({ Place: '{{Map|3200,3200}}' });
    const wiki = createWikiLocator(ok.fetchFn, () => t, false);
    await wiki.article('Place');
    t += 6 * 24 * 3600_000;
    await wiki.article('Place');
    expect(ok.calls).toHaveLength(1);
    t += 2 * 24 * 3600_000;
    await wiki.article('Place');
    expect(ok.calls).toHaveLength(2);

    const bad = fakeWiki({}, true);
    const w2 = createWikiLocator(bad.fetchFn, () => t, false);
    await expect(w2.article('X')).rejects.toThrow();
    await expect(w2.article('X')).rejects.toThrow();
    expect(bad.calls).toHaveLength(1);
    t += 61_000;
    await expect(w2.article('X')).rejects.toThrow();
    expect(bad.calls).toHaveLength(2);
  });
});

describe('parsing wiki maps', () => {
  it('three {{Map}} records', () => {
    expect(mapTemplatePoints('x=3222|y=3218|plane=0|mapID=0')).toEqual([{ x: 3222, y: 3218, plane: 0 }]);
    expect(mapTemplatePoints('3144,3178|3150,3180|mtype=polygon')).toHaveLength(2);
    expect(mapTemplatePoints('x:3190,y:3273,plane:1')).toEqual([{ x: 3190, y: 3273, plane: 1 }]);
  });

  it('scattered NPC points — the first, not the middle of the world', () => {
    expect(articleMapPoint('{{Map|3000,3000|3400,3400}}')).toEqual({ x: 3000, y: 3000, plane: 0 });
    expect(articleMapPoint('{{Map|3000,3000|3010,3010}}')).toEqual({ x: 3005, y: 3005, plane: 0 });
    expect(articleMapPoint('no map')).toBeNull();
  });

  it('fishing and ore places — from the ObjectLocLine rows', () => {
    const text = '{{ObjectLocLine|name=Fishing spot|location=[[Draynor Village]]|plane=0|x:3086,y:3227|x:3085,y:3230}}'
      + '{{ObjectLocLine|name=Fishing spot|location=[[Lumbridge Swamp]]|x:3246,y:3155|x:3240,y:3147}}';
    expect(locLinePoint(text, 'Lumbridge Swamp')).toEqual({ x: 3243, y: 3151, plane: 0 });
    expect(locLinePoint(text, 'Draynor Village')).toEqual({ x: 3086, y: 3229, plane: 0 });
    expect(locLinePoint(text, 'Catherby')).toBeNull();
  });

  it('a spawn with points without "x:" — as with the Small fishing net on the wiki', () => {
    const text = '{{ItemSpawnLine|name=Small fishing net|location=[[Lumbridge Swamp]] - by the [[Fishing tutor]]|members=No|3244,3159|3245,3156|leagueRegion = Misthalin}}';
    expect(spawnPoint(text, 'Small fishing net', 'Lumbridge Swamp - by the Fishing tutor')).toEqual({ x: 3245, y: 3158, plane: 0 });
  });

  it('the dossier row "Lumbridge Swamp - by the Fishing tutor" without a network — from the dictionary', async () => {
    const r = await resolveLocationCoordinates('Lumbridge Swamp - by the Fishing tutor', undefined, {}, noWiki);
    expect(r).toMatchObject({ label: 'Lumbridge Swamp fishing spots', match: 'normalized' });
  });

  it('a foreign item\'s spawn does not fit', () => {
    const text = '{{ItemSpawnLine|name=Egg|location=Farm|x:3000,y:3000}}';
    expect(spawnPoint(text, 'Bucket', 'Farm')).toBeNull();
    expect(spawnPoint(text, 'Egg', 'Farm')).toEqual({ x: 3000, y: 3000, plane: 0 });
  });

  it('HTML entities and floors from Bucket', () => {
    expect(cleanWikiText('Wizards&#39; Tower 1st&nbsp;floor&#91;UK&#93;2nd&nbsp;floor&#91;US&#93;')).toBe("Wizards' Tower 1st floor");
  });
});

describe('the place cache in localStorage', () => {
  it('errors are not saved, and old places are displaced by fresh ones', () => {
    const data = {
      a: { at: 1, value: { x: 3000, y: 3000, plane: 0 } },
      b: { at: 3, value: null },
      c: { at: 2, value: null, failed: true },
      d: { at: 4, value: { x: 3100, y: 3100, plane: 0 } },
    };
    expect(Object.keys(pruneStore(data))).toEqual(['a', 'b', 'd']);
    expect(Object.keys(pruneStore(data, 2)).sort()).toEqual(['b', 'd']);
  });
});

describe('cleanWikiText: the wiki non-breaking space', () => {
  it('"1st floor[UK]2nd floor[US]" with U+00A0 is reduced to "1st floor"', () => {
    expect(cleanWikiText('1st floor[UK]2nd floor[US] of Champions\' Guild')).toBe("1st floor of Champions' Guild");
    expect(cleanWikiText('Grand Tree, 2nd&#160;floor&#91;UK&#93;3rd&#160;floor&#91;US&#93;')).toBe('Grand Tree, 2nd floor');
  });
});
