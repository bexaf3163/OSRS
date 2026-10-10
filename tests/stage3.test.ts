import { describe, expect, it } from 'vitest';
import { allSteps, itemById, known, stepsFor } from '../src/data';
import type { Step } from '../src/types';
import { emptyProgress, normalizeProgress, withUpgradeDismissed } from '../src/lib/progress';
import { stageBankItemIds, stepBankItemIds, uniqueIds } from '../src/lib/bankTags';
import { DEFAULT_FEATURES, parseFeatures } from '../src/lib/features';
import {
  checkStatus, clearNavTarget, parseGear, parsePacing, setGearHint, setNavTarget, syncBankTags, toInGameTarget, type BridgeTransport, type GearState,
} from '../src/services/runeliteBridge';
import {
  recommendFor, recommendUpgrade, showsPrompt, stepUpgradeCategories, toolProgression, upgradeNav, type RouterInput, type ToolProgression,
} from '../src/services/gearUpgradeRouter';
import { matchStrict } from '../src/services/locationResolver';
import { actionForm, etaText, pacingNext, pacingText } from '../src/lib/pacing';
import { foeData } from '../src/services/gearAdvisor';
import { mapTarget, navPayload, pageFromUrl, sourceBadge } from '../src/lib/places';

import dangerZones from '../src/data/dangerZones.json';

const step = (id: string) => allSteps.find((s) => s.id === id)!;

/** A transport stub with a configurable answer. */
function transport(reply: { ok: boolean; status: number; data?: unknown }) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const t: BridgeTransport = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      return reply;
    },
    openEvents: () => () => {},
  };
  return { t, calls };
}

describe('Stage items for the bank highlight', () => {
  it('repeats and garbage are removed, the order is kept', () => {
    expect(uniqueIds([1351, 590, 1351, 0, -4, 2.5, 590, 995])).toEqual([1351, 590, 995]);
  });

  it('stage 1 in F2P: items from the bank, without those handed out during the step', () => {
    const ids = stageBankItemIds(1, 'f2p');
    expect(ids).toContain(1351); // Bronze axe
    expect(ids).toContain(1265); // Bronze pickaxe
    expect(new Set(ids).size).toBe(ids.length);
    const inStep = stepsFor('f2p').filter((s) => s.stage === 1)
      .flatMap((s) => (s.itemsRequired ?? []).filter((i) => i.inStep && i.wikiItemId).map((i) => i.wikiItemId!));
    const alsoFromBank = new Set(stepsFor('f2p').filter((s) => s.stage === 1).flatMap(stepBankItemIds));
    for (const id of inStep) if (!alsoFromBank.has(id)) expect(ids).not.toContain(id);
  });

  it('F2P without Members items, Members — with all of them', () => {
    for (const stage of [1, 2, 3, 4, 5, 6]) {
      for (const id of stageBankItemIds(stage, 'f2p')) expect(itemById.get(id)?.members).not.toBe(true);
    }
    // Members stages in F2P are empty: their steps do not exist in F2P mode.
    expect(stageBankItemIds(8, 'f2p')).toEqual([]);
    expect(stageBankItemIds(1, 'members').length).toBeGreaterThanOrEqual(stageBankItemIds(1, 'f2p').length);
  });
});

// ---------- The upgrade router ----------

const bronzeAxe = { id: 1351, name: 'Bronze axe' };
const gear = (over: Partial<GearState> = {}): GearState => ({ equipment: [bronzeAxe], inventory: [], coins: 1000, bankCoins: null, ...over });
const wc = step('S1-08');
const input = (over: Partial<RouterInput> = {}): RouterInput => ({ step: wc, mode: 'f2p', levels: { woodcutting: 6 }, gear: gear(), ...over });

describe('Smart Tool & Gear Upgrade Router', () => {
  it('step categories: woodcutting and mining; quest and combat — without this hint', () => {
    expect(stepUpgradeCategories(step('S1-08'))).toEqual(['woodcutting']);
    expect(stepUpgradeCategories(step('S1-12'))).toEqual(['mining']);
    // The weapon on combat steps is compared by the gear advisor (tests/gear.test.ts), not by the tool tiers.
    expect(stepUpgradeCategories(step('S3-08'))).toEqual([]);
    expect(stepUpgradeCategories(step('S1-03'))).toEqual([]);
  });

  it('1. Bronze axe and Woodcutting 6 → Steel axe from Bob in Lumbridge', () => {
    const r = recommendUpgrade(input())!;
    expect(r.status).toBe('UPGRADE_AVAILABLE');
    expect(r).toMatchObject({ currentItem: 'Bronze axe', recommendedItem: 'Steel axe', recommendedItemId: 1353, npc: 'Bob', shopPrice: 200, approxCost: 200 });
    // The shop point is from the place dictionary, not a separate one.
    expect(r.coords).toEqual({ x: matchStrict("Bob's Brilliant Axes")!.x, y: matchStrict("Bob's Brilliant Axes")!.y, plane: 0 });
    expect(showsPrompt(r)).toBe(true);
  });

  it('2. Woodcutting 5 → a Steel axe is not offered', () => {
    const r = recommendUpgrade(input({ levels: { woodcutting: 5 } }))!;
    expect(r.recommendedItem).not.toBe('Steel axe');
    expect(showsPrompt(r)).toBe(false);
  });

  it('3. A Steel axe is already in the hand or the bag — no hint', () => {
    expect(recommendUpgrade(input({ gear: gear({ equipment: [{ id: 1353, name: 'Steel axe' }] }) }))!.status).toBe('NO_UPGRADE');
    const inBag = recommendUpgrade(input({ gear: gear({ equipment: [], inventory: [{ id: 1353, name: 'Steel axe' }] }) }))!;
    expect(inBag.status).toBe('NO_UPGRADE');
    expect(showsPrompt(inBag)).toBe(false);
  });

  it('an axe in the bag counts: it chops from there too', () => {
    const r = recommendFor('woodcutting', input({ levels: { woodcutting: 21 }, gear: gear({ equipment: [], inventory: [{ id: 1355, name: 'Mithril axe' }] }) }));
    expect(r).toMatchObject({ status: 'NO_UPGRADE', currentItem: 'Mithril axe' });
  });

  it('4. Few coins → UPGRADE_NOT_AFFORDABLE, the bank counts', () => {
    const poor = recommendUpgrade(input({ gear: gear({ coins: 50 }) }))!;
    expect(poor.status).toBe('UPGRADE_NOT_AFFORDABLE');
    expect(poor.coins).toBe(50);
    expect(recommendUpgrade(input({ gear: gear({ coins: 50, bankCoins: 500 }) }))!.status).toBe('UPGRADE_AVAILABLE');
  });

  it('the exchange is cheaper than the shop — the exchange price', () => {
    const r = recommendUpgrade(input({ gePrices: new Map([[1353, 150]]), gear: gear({ coins: 160 }) }))!;
    expect(r).toMatchObject({ status: 'UPGRADE_AVAILABLE', approxCost: 150, shopPrice: 200, gePrice: 150 });
  });

  const withMembers: ToolProgression = {
    ...toolProgression,
    woodcutting: [...toolProgression.woodcutting, { tier: 'Dragon axe', levelReq: 61, membersOnly: true, geOnly: true }],
  };

  it('5. F2P does not get a Members upgrade', () => {
    const r = recommendFor('woodcutting', input({ levels: { woodcutting: 70 }, data: withMembers, gear: gear({ equipment: [{ id: 1359, name: 'Rune axe' }] }) }));
    expect(r.status).toBe('NO_UPGRADE');
  });

  it('6. Members gets both F2P and Members upgrades', () => {
    const f2pTier = recommendFor('woodcutting', input({ mode: 'members', levels: { woodcutting: 6 }, data: withMembers }));
    expect(f2pTier.recommendedItem).toBe('Steel axe');
    const dragon = recommendFor('woodcutting', input({ mode: 'members', levels: { woodcutting: 70 }, data: withMembers, gear: gear({ equipment: [{ id: 1359, name: 'Rune axe' }] }) }));
    expect(dragon).toMatchObject({ status: 'UPGRADE_AVAILABLE', recommendedItem: 'Dragon axe', geOnly: true });
  });

  it('7–8. "Skip" hides the hint only on this step', () => {
    expect(recommendUpgrade(input({ dismissed: ['S1-08'] }))!.status).toBe('SKIPPED');
    const mining = recommendUpgrade({ step: step('S1-12'), mode: 'f2p', levels: { mining: 6 }, gear: gear({ equipment: [{ id: 1265, name: 'Bronze pickaxe' }], coins: 10000 }), dismissed: ['S1-08'] })!;
    expect(mining).toMatchObject({ status: 'UPGRADE_AVAILABLE', recommendedItem: 'Steel pickaxe', npc: 'Nurmof' });
  });

  it('comparison by tiers, not by words in the name', () => {
    // "Bronze" in a foreign item does not make it an axe.
    const r = recommendUpgrade(input({ gear: gear({ equipment: [{ id: 1117, name: 'Bronze chainbody' }] }) }))!;
    expect(r.currentItem).toBeUndefined();
    expect(r.recommendedItem).toBe('Steel axe');
  });

  it('without RuneLite — UNKNOWN and no hint', () => {
    const r = recommendUpgrade(input({ gear: null }))!;
    expect(r.status).toBe('UNKNOWN');
    expect(showsPrompt(r)).toBe(false);
  });

  it('weak tiers (Iron axe) are no reason to go to the shop', () => {
    expect(showsPrompt(recommendUpgrade(input({ levels: { woodcutting: 3 } })))).toBe(false);
  });

  it('exchange only → the arrow to the Grand Exchange, with an item for the auto-removal', () => {
    const r = recommendUpgrade(input({ levels: { woodcutting: 45 }, gear: gear({ coins: 100000 }) }))!;
    expect(r).toMatchObject({ recommendedItem: 'Rune axe', geOnly: true });
    expect(r.shop).toBeUndefined();
    const nav = upgradeNav(r, 'S1-08')!;
    expect(nav).toMatchObject({ label: 'Grand Exchange', itemName: 'Rune axe', itemId: 1359, stepId: 'S1-08' });
  });

  it('9. the shop target is cleared by the item: it has an ID and a name', () => {
    const nav = upgradeNav(recommendUpgrade(input())!, 'S1-08')!;
    expect(nav).toMatchObject({ label: "Bob's Brilliant Axes", npcNames: ['Bob'], itemName: 'Steel axe', itemId: 1353, stepId: 'S1-08' });
  });

  it('tier data: IDs from the item database, shops — in its seller list and in the place dictionary', () => {
    for (const [cat, tiers] of Object.entries(toolProgression).filter(([k]) => k !== 'source') as [string, ToolProgression['woodcutting']][]) {
      let prevLevel = 0;
      for (const t of tiers) {
        expect(t.levelReq, `${cat} ${t.tier}`).toBeGreaterThanOrEqual(prevLevel);
        prevLevel = t.levelReq;
        const item = itemById.get(t.itemId!);
        expect(item?.nameEn, `${t.tier}: ID ${t.itemId}`).toBe(t.tier);
        if (t.shop && !t.geOnly) {
          const shops = (item!.buyLocations ?? []).map((b) => b.shopName.replace(/\.$/, ''));
          expect(shops, `${t.tier} is sold at ${t.shop.store}`).toContain(t.shop.store);
          expect(matchStrict(t.shop.store), `${t.shop.store} in the place dictionary`).not.toBeNull();
        }
      }
    }
  });
});

// ---------- Compatibility ----------

describe('Save compatibility', () => {
  it('10. old progress without the new fields loads as before', () => {
    const old = { version: 3, steps: { 'S1-01': 'done' }, levels: { woodcutting: 10 }, notes: {}, updatedAt: '2026-01-01T00:00:00.000Z' };
    const n = normalizeProgress(old, known)!;
    expect(n.dropped).toBe(0);
    expect(n.progress.steps['S1-01']).toBe('done');
    expect(n.progress.upgradeDismissedForSteps).toBeUndefined();
  });

  it('"Skip" is saved, unknown steps are dropped', () => {
    const n = normalizeProgress({ ...emptyProgress(), upgradeDismissedForSteps: ['S1-08', 'S9-99', 5] }, known)!;
    expect(n.progress.upgradeDismissedForSteps).toEqual(['S1-08']);
    let p = withUpgradeDismissed(emptyProgress(), 'S1-08');
    expect(p.upgradeDismissedForSteps).toEqual(['S1-08']);
    p = withUpgradeDismissed(p, 'S1-08', false);
    expect(p.upgradeDismissedForSteps).toBeUndefined();
  });

  it('feature settings: broken and unfamiliar — the defaults', () => {
    expect(parseFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures('garbage')).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures('{"pacing":false,"x":1,"bankTags":"no"}')).toEqual({ ...DEFAULT_FEATURES, pacing: false });
  });
});

// ---------- The bridge: a temporary target, the bank, gear, pace ----------

describe('The bridge: new requests and events', () => {
  it('/status says which step is now in the plugin: after a RuneLite restart — none', async () => {
    const live = await checkStatus(transport({ ok: true, status: 200, data: { status: 'ok', inGame: true, activeStepId: 'S1-13' } }).t);
    expect(live.activeStepId).toBe('S1-13');
    // The plugin Gson does not write empty fields: no step — no field.
    expect((await checkStatus(transport({ ok: true, status: 200, data: { status: 'ok', inGame: false } }).t)).activeStepId).toBeNull();
    expect((await checkStatus(transport({ ok: true, status: 200, data: { status: 'ok', activeStepId: 42 } }).t)).activeStepId).toBeNull();
    expect((await checkStatus(transport({ ok: false, status: 0 }).t)).activeStepId).toBeNull();
  });

  it('a step with a pace goes to the game together with the pace', () => {
    const p = toInGameTarget(step('S1-12'))!;
    expect(p.pacing).toMatchObject({ skill: 'mining', targetLevel: 15, targetExp: 2411, expPerAction: 17.5 });
  });

  it('a temporary target: ok, offline and a refusal of a turned-off feature', async () => {
    const target = { label: 'Port Sarim', x: 3029, y: 3221, plane: 0 };
    const ok = transport({ ok: true, status: 200, data: { status: 'ok' } });
    expect(await setNavTarget(target, ok.t)).toEqual({ ok: true });
    expect(ok.calls[0]).toEqual({ method: 'POST', path: '/nav-target', body: target });
    expect(await setNavTarget(target, transport({ ok: false, status: 0 }).t)).toEqual({ ok: false, reason: 'offline' });
    expect(await setNavTarget(target, transport({ ok: false, status: 409, data: { status: 'error', error: 'navigation is turned off' } }).t))
      .toEqual({ ok: false, reason: 'refused', message: 'navigation is turned off' });
    const old = await setNavTarget(target, transport({ ok: false, status: 404, data: { status: 'error', error: 'not found' } }).t);
    expect(old.ok).toBe(false);
    const clr = transport({ ok: true, status: 200 });
    await clearNavTarget(clr.t);
    expect(clr.calls[0].body).toEqual({ clear: true });
  });

  it('the step items — to /bank-tags', async () => {
    const b = transport({ ok: true, status: 200 });
    expect(await syncBankTags('stage-1', [995, 1351], b.t)).toBe(true);
    expect(b.calls[0]).toEqual({ method: 'POST', path: '/bank-tags', body: { stageId: 'stage-1', itemIds: [995, 1351] } });
  });

  it('a gear hint — to /gear-hint; removing — clear; an old plugin and a turned-off feature — not an error', async () => {
    const hint = { text: '⚡ Stronger: Steel scimitar from Zeke (Al Kharid), 400 gp', watchItems: ['Steel scimitar'], highlightItems: [] };
    const ok = transport({ ok: true, status: 200 });
    expect(await setGearHint(hint, ok.t)).toBe('ok');
    expect(ok.calls[0]).toEqual({ method: 'POST', path: '/gear-hint', body: hint });
    const clr = transport({ ok: true, status: 200 });
    await setGearHint(null, clr.t);
    expect(clr.calls[0].body).toEqual({ clear: true });
    expect(await setGearHint(hint, transport({ ok: false, status: 0 }).t)).toBe('offline');
    expect(await setGearHint(hint, transport({ ok: false, status: 404 }).t)).toBe('old');
    expect(await setGearHint(hint, transport({ ok: false, status: 409, data: { status: 'error', error: 'turned off' } }).t)).toBe('off');
  });

  it('gear: the slot of what is worn from the game, an unknown slot — without it', () => {
    expect(parseGear({ equipment: [{ id: 1291, name: 'Bronze sword', slot: 'weapon' }, { id: 1540, name: 'Anti-dragon shield', slot: 'Shield!' }] })!.equipment)
      .toEqual([{ id: 1291, name: 'Bronze sword', slot: 'weapon' }, { id: 1540, name: 'Anti-dragon shield' }]);
  });

  it('gear: missing fields — unknown, garbage is dropped', () => {
    expect(parseGear(undefined)).toBeNull();
    expect(parseGear({})).toBeNull();
    expect(parseGear({ equipment: [{ id: 1351, name: 'Bronze axe' }, { id: 'x' }], coins: 250 }))
      .toEqual({ equipment: [{ id: 1351, name: 'Bronze axe' }], inventory: null, coins: 250, bankCoins: null });
  });

  it('pace: from the event, without an invented time', () => {
    const e = { type: 'PACING', stepId: 'S1-11', pacing: { skill: 'fishing', targetLevel: 20, xp: 4130, remainingXp: 340, actionsLeft: 34, estimated: false, almost: false, done: false } };
    const p = parsePacing(e)!;
    expect(p).toMatchObject({ actionsLeft: 34, actionsPerMinute: null, etaSeconds: null });
    expect(etaText(p)).toBe('calculating the time...');
    expect(pacingText(p, 'shrimp|shrimps')).toBe('34 shrimps to 20 Fishing');
    expect(parsePacing({ type: 'PACING', stepId: 'S1-11', pacing: null })).toBeNull();
    expect(parsePacing({ type: 'PACING', stepId: 'S1-11', pacing: { skill: 'magic' } })).toBeNull();
    const fast = parsePacing({ ...e, pacing: { ...e.pacing, actionsPerMinute: 10, etaSeconds: 204 } })!;
    expect(etaText(fast)).toBe('≈ 3 min');
    expect(pacingText({ ...p, almost: true, actionsLeft: 3 }, 'shrimp|shrimps')).toBe('✓ Almost done: 3 shrimps to 20 Fishing');
    expect(pacingText({ ...p, done: true }, 'shrimp')).toBe('✓ Target level reached: 20 Fishing');
    expect(actionForm('log|logs', 1)).toBe('log');
    expect(actionForm('log|logs', 11)).toBe('logs');
  });

  it('combat pace: the growing skill is shown, the others — "then", a finished skill suggests changing the style', () => {
    const e = { type: 'PACING', stepId: 'S3-08', pacing: {
      skill: 'strength', targetLevel: 30, xp: 5000, remainingXp: 8363, actionsLeft: 111, estimated: true, almost: false, done: false,
      actionsPerMinute: 3.2, etaSeconds: 2081, left: ['defence', 'magic', 'attack'],
    } };
    const p = parsePacing(e)!;
    // Unknown skills in left are dropped.
    expect(p.left).toEqual(['defence', 'attack']);
    const all = ['attack', 'strength', 'defence'] as const;
    expect(pacingText(p, 'warrior|warriors', all)).toBe('111 warriors to 30 Strength');
    expect(etaText(p)).toBe('approx. 35 min');
    expect(pacingNext(p)).toBe('then Defence and Attack');
    expect(pacingNext({ ...p, left: ['defence'] })).toBe('then Defence');
    const doneOne = { ...p, done: true, actionsLeft: 0, left: ['defence' as const] };
    expect(pacingText(doneOne, 'warrior|warriors', all)).toBe('✓ 30 Strength - next Defence: change attack style');
    expect(pacingNext(doneOne)).toBe('');
    expect(pacingText({ ...doneOne, left: [] }, 'warrior|warriors', all)).toBe('✓ Target level reached: 30 Attack, Strength, Defence');
    // An old plugin does not send left — that is just an empty list.
    expect(parsePacing({ ...e, pacing: { ...e.pacing, left: undefined } })!.left).toEqual([]);
  });
});

// ---------- The dossier → the map → the game ----------

describe('Places from the dossier to the map and the game', () => {
  const shears = { nameEn: 'Shears', wikiUrl: 'https://oldschool.runescape.wiki/w/Shears' };

  it('the item page from a wiki link', () => {
    expect(pageFromUrl('https://oldschool.runescape.wiki/w/Raw_shrimps')).toBe('Raw shrimps');
    expect(pageFromUrl('https://oldschool.runescape.wiki/w/Cook%27s_Assistant')).toBe("Cook's Assistant");
    expect(pageFromUrl('https://example.com/')).toBeUndefined();
  });

  it('the source caption: an item, a shop, a town', () => {
    const p = { x: 3189, y: 3273, plane: 0, label: 'Fred the Farmer', source: 'dictionary' as const, match: 'substring' as const, page: 'Fred the Farmer' };
    const spawn = mapTarget({ kind: 'spawn', location: "Lumbridge - outside Fred the Farmer's house", item: shears }, p);
    expect(sourceBadge(spawn)).toBe("Item source: Shears • Lumbridge - outside Fred the Farmer's house");
    expect(spawn.origin).toMatch(/approximate/);
    const shop = mapTarget({ kind: 'shop', location: 'Port Sarim', shop: "Gerrant's Fishy Business.", npc: 'Gerrant' }, { ...p, match: 'exact' });
    expect(sourceBadge(shop)).toBe("Source: Gerrant's Fishy Business. • Gerrant • Port Sarim");
  });

  it('only the found point goes to the game; the seller — for the highlight', () => {
    const p = { x: 3015, y: 3225, plane: 0, label: "Gerrant's Fishy Business", source: 'dictionary' as const, match: 'exact' as const, page: 'x' };
    expect(navPayload({ kind: 'shop', location: 'Port Sarim', shop: "Gerrant's Fishy Business.", npc: 'Gerrant' }, p))
      .toEqual({ label: "Gerrant's Fishy Business", x: 3015, y: 3225, plane: 0, npcNames: ['Gerrant'] });
    expect(navPayload({ kind: 'city', location: 'Port Sarim', npc: 'Gerrant' }, p).npcNames).toBeUndefined();
  });
});

describe('Danger radar: data', () => {
  const zones = (dangerZones as { zones: { id: string; center: { x: number; y: number; plane: number }; radius: number; warningRadius?: number; severity: string; message: string; npcNames?: string[] }[] }).zones;

  it('verified zones with sensible radii and a message', () => {
    expect(zones.map((z) => z.id)).toEqual(expect.arrayContaining(['dark-wizards-varrock', 'draynor-manor-trees', 'draynor-jail-guards']));
    for (const z of zones) {
      expect(z.radius).toBeGreaterThan(0);
      expect(z.radius).toBeLessThanOrEqual(20);
      expect(z.warningRadius ?? z.radius).toBeGreaterThanOrEqual(z.radius);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(z.severity);
      expect(z.message.length).toBeGreaterThan(10);
      expect([0, 1, 2, 3]).toContain(z.center.plane);
    }
  });

  it('the Port Sarim jail is not dangerous (the guards are not aggressive) — no zone', () => {
    expect(zones.some((z) => z.id === 'port-sarim-jail')).toBe(false);
  });
});

describe('Steps with a pace', () => {
  it('pace only on training steps', () => {
    const paced: Step[] = allSteps.filter((s) => s.pacing);
    expect(paced.map((s) => s.id)).toEqual(['S1-08', 'S1-11', 'S1-12', 'S3-08', 'S4-03']);
    for (const s of paced) expect(s.type).toBe('skill');
  });

  it('combat pace: three skills to one goal, experience per opponent — 4 × its health', () => {
    const hp = new Map(foeData.foes.map((f) => [f.name, f.hitpoints]));
    for (const id of ['S3-08', 'S4-03']) {
      const s = allSteps.find((x) => x.id === id)!;
      expect(s.pacing!.skill).toBe('attack');
      // The pace follows Attack alone: Strength has its own, lower goal in the title and the trigger, and Defence is not trained.
      expect(s.pacing!.also).toBeUndefined();
      expect(s.pacing!.expPerAction).toBe(4 * hp.get(s.foes![0])!);
      expect(s.pacing!.secondsPerAction).toBeUndefined();
    }
  });
});
