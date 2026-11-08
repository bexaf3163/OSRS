// Combat routes and kits: scenarios of the browser suite (npm run test:ui -- --only combat).
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { progressBefore, open, settle, expect, noOverflow, reveal, waitFor, text } from '../harness.ts';

async function combatRouteScenarios(browser: Browser) {
  console.log('combat route');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 5000, bankCoins: 0 };
  const all = JSON.parse(readFileSync(new URL('../../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; anyOf?: string[] }[] }[];
  const from = all.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])))];
  const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, bank: 0 }));
  const COWS = 'The cow field east of Lumbridge';
  for (const width of [1440]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S4-03' },
      status: {
        protocol: 6, inGame: true, player: 'Combat Test', activeStepId: 'S4-03', questPoints: 30, totalLevel: 150,
        stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 }, pos: { x: 3093, y: 3495, plane: 0 }, ...gear,
      },
      events: [
        { type: 'OWNED', bankSeen: true, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
        { type: 'STATS', stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 } }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
      ],
      market: true,
    }, '#/step/S4-03');
    await settle(page);
    const posts = async () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
    const lastStep = async () => {
      const snaps = (await posts()).filter((p) => p.path === '/prep-plan');
      return snaps.length ? snaps[snaps.length - 1].body.step : undefined;
    };
    const savedPlans = async () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:combat-plans')).map(([, v]) => JSON.parse(v)));
    const verdict = await page.locator('.step-status .status-text').first().innerText().catch(() => '');
    if (/Not everything is checked/.test(verdict)) expect(await page.locator('.step-status .ready-ring').count() === 0, `combat route (${width} px): no percentage beside "Not everything is checked"`);
    // 2.69: nothing to press. The recommended plan is in effect, named in one line with one short reason.
    expect(!/Another way|Use this plan/.test(await page.locator('body').innerText()), `combat route (${width} px): no manual optimization switch`);
    const step = await lastStep();
    expect(step?.stepId === 'S4-03' && step.pacing?.targetExp > 0, `combat route (${width} px): the recommended training reaches the bridge`);
    expect(!step?.completionTrigger?.items?.length && step?.completionTrigger?.levels?.[0]?.level === 40, `combat route (${width} px): Attack 40 alone, no forced bone quota`);
    expect(!/Collect 50 Big bones/.test(await page.locator('body').innerText()), `combat route (${width} px): removed collection cannot return`);
    const saved = await savedPlans();
    expect(saved.length <= 1 && (!saved.length || saved[0]['S4-03']?.by === 'auto'), `combat route (${width} px): the guide chooses automatically`);
    const done = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!done || !done.steps || done.steps['S4-03'] === undefined, `combat route (${width} px): the route step is still open`);
    if (process.env.UI_SHOTS) await page.locator('.status-combat-route').screenshot({ path: `${process.env.UI_SHOTS}/combat-route-line-${width}.png` }).catch(() => {});
    // "Why this plan?": the comparison, folded, and any plan can be chosen from it.
    await reveal(page, '.combat-route');
    const fold = page.locator('.combat-route details');
    expect(await fold.count() === 1 && !(await fold.evaluate((d) => (d as HTMLDetailsElement).open)), `combat route (${width} px): the comparison is folded under "Why this plan?"`);
    // 2.75: the status line always says where and why ("go here, because"), the route's own plan too, whenever other plans were compared.
    expect(await page.locator('.status-combat-route:visible').count() > 0, `combat route (${width} px): the status line names the plan and why`);
    // The status line's link opens the comparison itself, not only the view it is in (2.72). The view opened above is closed first, as a player would.
    await page.keyboard.press('Escape');
    await settle(page);
    await page.locator('.status-combat-route:visible').getByRole('button', { name: 'Why this plan?' }).first().click();
    await settle(page);
    expect(await fold.evaluate((d) => (d as HTMLDetailsElement).open), `combat route (${width} px): the status line's "Why this plan?" opens the comparison itself`);
    // A few rows, not a table of everything: the plan in use, the best, the route's own and the next best; the rest is one line.
    const rows = await page.locator('.combat-plan-row').count();
    const all = await text(page, '.combat-route');
    expect(rows >= 3 && rows <= 4 && await page.locator('.combat-plan-row', { hasText: '(the route)' }).count() === 1 && !/Defence 10 first/.test(all),
      `combat route (${width} px): three or four rows with the route's own; the common Defence 10 preparation is not a plan of its own (${rows})`);
    expect(!/Big bones bank quantity is not checked/.test(all), `combat route (${width} px): an unreported item quantity is disclosed even when the bank was opened`);
    const verdictText = await text(page, '.combat-verdict');
    expect(/Not priced/.test(all) && verdictText.trim().length > 0, `combat route (${width} px): unchecked armour stays unpriced and the recommendation still explains its tradeoff`);
    expect(/Also compared: .*(Cows|Monks|Barbarians)/.test(all), `combat route (${width} px): it says what else was compared`);
    expect(await page.locator('.combat-plan-row.is-now .cpr-figs').count() === 1, `combat route (${width} px): the plan in use has its time, food and coins`);
    const netFigures = await page.locator('.combat-plan-row .cpr-figs > span:last-child').allTextContents();
    expect(netFigures.length === rows && netFigures.every(t => /gp net$|^Not priced$/.test(t.trim())), `combat route (${width} px): every comparison shows net proceeds or an unknown cost, never gross loot`);
    if (process.env.UI_SHOTS) await page.locator('.combat-route').screenshot({ path: `${process.env.UI_SHOTS}/combat-route-open-${width}.png` }).catch(() => {});
    // A trainer choice cannot bypass common preparation: Defence 10 still comes before the armour and Attack phase.
    const other = page.locator('.combat-plan-row:not(.is-now)', { has: page.getByRole('button', { name: 'Use' }) }).first();
    const otherName = await other.locator('.cpr-name').innerText();
    await other.getByRole('button', { name: 'Use' }).click();
    await settle(page);
    const back = await lastStep();
    expect(back?.npcNames?.[0] === 'Cow' && back?.pacing?.skill === 'defence' && back?.pacing?.targetLevel === 10 && back?.worldPoint?.plane === 0,
      `combat route (${width} px): another plan keeps the Defence 10 preparation on surface cows first (${otherName})`);
    const mine = await text(page, '.status-combat-route');
    expect(/Your plan: /.test(mine), `combat route (${width} px): the player's choice is named as theirs`);
    expect((await savedPlans())[0]['S4-03']?.by === 'player', `combat route (${width} px): the player's choice is saved as theirs`);
    // Any plan from the list, and a Defence plan says what the route gives later.
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
    const d20 = page.locator('.combat-plan-row', { hasText: 'Defence 20 first' });
    if (await d20.count()) {
      await d20.getByRole('button', { name: 'Use' }).click();
      await settle(page);
      if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
      // Its note is shown once it is the plan in use: what the route gives later.
      expect(/S5-09 .Triumph at Oziach. gives 18,650 Defence XP/.test(await page.locator('.combat-plan-row.is-now').innerText()), `combat route (${width} px): a Defence plan names the Defence the route gives later`);
      const dstep = await lastStep();
      expect(dstep?.worldPoint?.label === COWS && dstep.pacing?.skill === 'defence', `combat route (${width} px): a plan picked from the list leads the game (Defence on the cows)`);
    } else expect(/Defence 20 first/.test(await text(page, '.combat-route')), `combat route (${width} px): Defence 20 first is compared`);
    // Back to the recommendation.
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await page.locator('.combat-route details > summary').click();
    await page.getByRole('button', { name: 'Follow the recommendation' }).click();
    await settle(page);
    const again = await lastStep();
    expect(!again?.completionTrigger?.items?.length && (await savedPlans())[0]?.['S4-03']?.by !== 'player', `combat route (${width} px): "Follow the recommendation" hands the plan back to the guide`);
    await page.evaluate(items => {
      const emit = (window as unknown as { __emit: (e: unknown) => void }).__emit;
      emit({ type: 'XP', xp: { attack: 20363, strength: 2000, defence: 0, hitpoints: 3500 } });
      emit({ type: 'OWNED', bankSeen: true, items: [...items.filter(i => i.name !== 'Big bones'), { name: 'Big bones', carried: 0, noted: 0, bank: 50 }] });
    }, owned);
    await settle(page);
    const trained = await lastStep();
    expect(trained?.pacing?.targetExp > 0 && !trained?.completionTrigger?.items?.length, `combat route (${width} px): observed banked bones move to remaining XP without recollecting them`);
    expect(await noOverflow(page), `combat route (${width} px): no horizontal scroll`);
    expect(errors.length === 0, `combat route (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// An XP-only step must also adopt the better trainer without a manual mode switch.
async function retainedCombatFoodScenario(browser: Browser) {
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 5000, bankCoins: 0 };
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  const xp = { attack: 13363, strength: 5018, defence: 0, hitpoints: 7842 };
  const items = ['Salmon', 'Trout', 'Tuna', 'Lobster', 'Swordfish', 'Big bones'].map(name => ({ name, carried: 0, noted: 0, bank: 0 }));
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S4-03', 'osrs-put:features': JSON.stringify({ keepDefenceOne: true }) },
      status: { protocol: 6, inGame: true, activeStepId: 'S4-03', ...gear, stats, xp },
      events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S4-03');
    await settle(page);
    await reveal(page, '.combat-plan');
    const body = await page.locator('.combat-plan').allInnerTexts();
    expect(body.some(t => t.includes('whole goal')), `retained combat (${width}): food remains budgeted for fifty kills after Attack 40`);
    const snapshot = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { step?: { completionTrigger?: { levels?: { skill: string; level: number }[]; items?: { count: number }[] } }; plan?: { lines: { name: string; need: number }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body;
    });
    // Training food is planned and shown, but only as a suggestion: a trip can always end to heal (owner report 2026-11-08).
    expect(!snapshot?.plan?.lines.some(l => l.name === 'Salmon'), `retained combat (${width}): the game receives no required training-food line`);
    expect(snapshot?.step?.completionTrigger?.levels?.[0]?.level === 40 && !snapshot.step.completionTrigger.items?.length, `retained combat (${width}): completion stays Attack 40 and fifty bones`);
    await page.evaluate(nextItems => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: nextItems }), items.filter(i => i.name !== 'Lobster').map(i => i.name === 'Salmon' ? { ...i, bank: 13 } : i));
    await settle(page);
    const partialFood = await page.locator('.combat-plan').innerText();
    expect(partialFood.includes('Confirmed food: 13 Salmon') && partialFood.includes('check the remaining quantities') && !partialFood.includes('buy about'), `retained combat (${width}): incomplete food counts show confirmed stock without an invented purchase or bag location`);
    if (process.env.UI_SHOTS) await page.locator('.combat-plan').screenshot({ path: `${process.env.UI_SHOTS}/food-unknown-${width}.png` });
    await page.evaluate(nextItems => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: nextItems }), items.map(i => i.name === 'Big bones' ? { ...i, bank: 30 } : i));
    await settle(page);
    expect((await page.locator('.combat-plan').allInnerTexts()).some(t => t.includes('whole goal') && !t.includes('20 kills')), `retained combat (${width}): the live stock update reduces collection to twenty kills`);
    expect(await noOverflow(page) && !errors.length, `retained combat (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function xpOnlyCombatScenario(browser: Browser) {
  const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
  const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
  const gear = { equipment: [
    { id: 1329, name: 'Mithril scimitar', slot: 'weapon' }, { id: 1153, name: 'Iron full helm', slot: 'head' },
    { id: 1115, name: 'Iron platebody', slot: 'body' }, { id: 1081, name: 'Iron plateskirt', slot: 'legs' }, { id: 1191, name: 'Iron kiteshield', slot: 'shield' },
  ], inventory: [], coins: 3500, bankCoins: 0 };
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S3-08', { gameMode: 'f2p' }), localStorage: { 'osrs-put:active-step': 'S3-08' }, market: true,
    status: { protocol: 6, player: 'XP Test', activeStepId: 'S3-08', ...gear, stats, xp },
    events: [{ type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0, bank: 13 }] }],
  }, '#/step/S3-08');
  await settle(page);
  const snapshots = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan'));
  const step = snapshots.at(-1)?.body?.step;
  // Whichever spot wins (2.75 compares every spot of the registry), the line names it and the game gets its NPC.
  const trainers = (JSON.parse(readFileSync(new URL('../../../../src/data/generated/trainers.json', import.meta.url), 'utf8')) as { trainers: { name: string; foe: string }[] }).trainers;
  const named = /Plan: Train on ([^.]+)\./.exec(await text(page, '.status-combat-route'))?.[1];
  const spot = trainers.find((t) => t.name === named);
  expect(!!spot && step?.npcNames?.[0] === spot.foe, `XP-only training: the default trainer is adopted in the app and game payload (${named})`);
  expect(step?.pacing?.skill === 'strength' && step?.pacing?.targetExp === 4470 && JSON.stringify(step?.completionTrigger).includes('"attack"'), 'XP-only training: training order and the original combined completion goals are retained');
  expect(await noOverflow(page) && !errors.length, 'XP-only training: no overflow or console errors');
  await page.context().close();
}

async function magicRouteScenarios(browser: Browser) {
  for (const width of [1280]) {
    const names = ['Mind rune', 'Air rune', 'Water rune', 'Earth rune', 'Fire rune', 'Nature rune', 'Iron ore', 'Staff of air', 'Staff of water', 'Staff of earth', 'Staff of fire', 'Trout', 'Salmon', 'Tuna', 'Lobster', 'Swordfish'];
    const stock = (counts: Record<string, number>) => names.map(name => ({ name, carried: counts[name] ?? 0, noted: 0, bank: 0 }));
    const stats = { magic: 1, smithing: 15 };
    const gear = { equipment: [], inventory: [], coins: 0, bankCoins: 0 };
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-03', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-03' },
      status: { protocol: 6, inGame: true, activeStepId: 'S6-03', player: 'Magic Supplies', stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: stock({}) }],
    }, '#/step/S6-03');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const initial = await snapshot();
    expect(initial?.step?.checklist?.some((r: any) => r.name === 'Mind rune' && r.count === 100) && !initial.step.checklist.some((r: any) => r.name === 'Nature rune'), `magic (${width}): a beginner gets actual Strike inputs instead of a nature-only placeholder`);
    const nextStats = { magic: 43, smithing: 15 };
    await page.evaluate(({ stats, items }) => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, stats }; w.__emit({ type: 'STATS', stats }); w.__emit({ type: 'OWNED', bankSeen: true, items }); }, { stats: nextStats, items: stock({ 'Nature rune': 25, 'Iron ore': 25, 'Fire rune': 100 }) });
    await settle(page);
    const utility = await snapshot();
    expect(utility?.step?.checklist?.some((r: any) => r.name === 'Iron ore' && r.count === 25) && utility.step.checklist.some((r: any) => r.name === 'Fire rune' && r.count === 100) && !(utility.step.npcNames?.length), `magic (${width}): an unlocked supplied Superheat batch replaces the combat inputs and NPCs`);
    const staffGear = { ...gear, equipment: [{ id: 1387, name: 'Staff of fire', slot: 'weapon', count: 1 }] };
    await page.evaluate(({ gear, items }) => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, ...gear }; w.__emit({ type: 'GEAR', gear }); w.__emit({ type: 'OWNED', bankSeen: true, items }); }, { gear: staffGear, items: stock({ 'Nature rune': 24, 'Iron ore': 24, 'Staff of fire': 1 }) });
    await settle(page);
    const remaining = await snapshot();
    expect(remaining?.step?.checklist?.some((r: any) => r.name === 'Staff of fire' && r.equip) && remaining.step.checklist.some((r: any) => r.name === 'Iron ore' && r.count === 24) && !remaining.step.checklist.some((r: any) => r.name === 'Fire rune'), `magic (${width}): worn staff substitution and the remaining castable bag reach one snapshot`);
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Superheat Item') && !(await text(page, '.training-recommendation')).includes('Alchemy'), `magic (${width}): desktop and game share the usable method`);
    expect(Boolean((await page.locator('.training details', { hasText: 'Other methods' }).textContent())?.includes('manual setup')), `magic (${width}): unverified alternatives remain disclosed behind details`);
    expect(await noOverflow(page) && !errors.length, `magic (${width}): no overflow or runtime errors`);
    await page.context().close();
  }
}

async function styleQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const unavailable of [false, true]) {
    const stats = { magic: 10, attack: 1, defence: 1, ranged: 1 };
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: unavailable, progress: progressBefore('S2-04', { levels: stats }),
      marketQuotes: { 'Staff of fire': { id: 1387, price: 1500 }, 'Amulet of magic': { id: 1727, price: 700 } },
      status: { protocol: 6, inGame: true, stats, coins: 10000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats }],
    }, '#/step/S2-04');
    await reveal(page, '.style-gear summary');
    await page.locator('.style-gear summary').click();
    await settle(page);
    const prices = await page.locator('.style-market-price').allTextContents();
    expect(prices.length > 0 && (unavailable ? prices.every(p => p.includes('Price unavailable')) : prices.some(p => p.includes('GE estimate:'))),
      `style quotes (${width}, unavailable=${unavailable}): shared market estimates or honest quote absence`);
    expect(!(await text(page, '.style-gear')).includes('not sold at the exchange'), `style quotes (${width}): an unavailable quote cannot invent trade restrictions`);
    expect((await text(page, '.magic-plan')).includes('Price unavailable for a complete option'), `Magic quotes (${width}, unavailable=${unavailable}): missing rune quotes keep the requirements visible`);
    expect(await noOverflow(page) && !errors.length, `style quotes (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

// Explicitly choose the written Minotaur route to retain its food/variant coverage.
// Automatic trainer selection is exercised separately in combatRouteScenarios.
async function minotaurRoute(browser: Browser) {
  const width = 1100;
  const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 500, bankCoins: 3000 };
  const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
  const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S3-08'),
    localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:combat-plans:main:-': '{"S3-08":{"key":"route","at":1,"by":"player"}}' },
    status: { protocol: 5, ...gear, stats, xp, activeStepId: 'S3-08' },
    events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [
      { name: 'Salmon', carried: 0, noted: 0, bank: 13 },
      ...['Trout', 'Tuna', 'Lobster', 'Swordfish'].map(name => ({ name, carried: 0, noted: 0, bank: 0 })),
    ] }],
  }, '#/step/S3-08');
  await waitFor(page, '.combat-plan', 8000);
  const t = await text(page, '.combat-plan');
  expect(t.includes('Next trip: 26 Salmon') && t.includes('You have 13 Salmon') && t.includes('buy about'), `food plan: next trip, owned, deficit (${t.replace(/\s+/g, ' ').slice(0, 160)})`);
  expect(!(await page.locator('.food-advice').count()), 'food plan: the generic food block is not repeated');
  await page.locator('.combat-plan summary').click();
  const d = await text(page, '.combat-plan');
  expect(d.includes('Minotaur (level 27) instead') && d.includes('Strength 16 → 20'), 'food plan: the details hold the phases and the level 27 Minotaur');
  if (process.env.UI_SHOTS) await page.locator('.combat-plan').screenshot({ path: `${process.env.UI_SHOTS}/combat-plan-${width}.png` }).catch(() => {});
  expect(await noOverflow(page), 'food plan: no horizontal scrolling');
  expect(!errors.length, `food plan: no console errors ${errors.join('; ')}`);
  await page.context().close();

  // The same in the default "Zen" view: the step page and its Preparation view, for the visual review.
  const zen = await open(browser, width, {

    progress: progressBefore('S3-08'),
    localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:combat-plans:main:-': '{"S3-08":{"key":"route","at":1,"by":"player"}}' },
    status: { protocol: 5, ...gear, stats, xp, activeStepId: 'S3-08' },
    // As the plugin reports it: the step's fish alternatives are counted too (0 here).
    events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [
      { name: 'Salmon', carried: 0, noted: 0, bank: 13 }, { name: 'Mithril scimitar', carried: 1, noted: 0, bank: 0 },
      ...['Trout', 'Tuna', 'Lobster', 'Swordfish'].map((name) => ({ name, carried: 0, noted: 0, bank: 0 })),
    ] }],
  }, '#/step/S3-08');
  await waitFor(zen.page, '.step-status', 8000);
  await zen.page.keyboard.press('Escape');
  if (process.env.UI_SHOTS) await zen.page.screenshot({ path: `${process.env.UI_SHOTS}/zen-s308-${width}.png`, fullPage: true }).catch(() => {});
  await zen.page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Preparation/i }).click();
  await settle(zen.page);
  if (process.env.UI_SHOTS) await zen.page.screenshot({ path: `${process.env.UI_SHOTS}/zen-s308-prep-${width}.png`, fullPage: true }).catch(() => {});
  const prep = await zen.page.locator('body').innerText();
  // Training food is a suggestion (owner report 2026-11-08): never a Preparation requirement, never the whole goal.
  expect(!prep.includes('Salmon ×110'), 'food plan (Zen): Preparation never asks for the whole goal of training food');
  // The readiness verdict (2.62.0): the status, the bank first (13 Salmon owned), then what to buy; both Minotaur versions; the weapon judged.
  const verdict = await text(zen.page, '.readiness-verdict');
  // Training food never blocks the step (owner report 2026-11-08): ready, with the food named as optional.
  expect(verdict.startsWith('Ready: your kit suits Minotaur') && verdict.includes('food is optional') && !verdict.includes('Preparation needed'),
    `readiness (Zen): training food is optional, never a preparation block (${verdict.replace(/\s+/g, ' ').slice(0, 200)})`);
  expect(verdict.includes('Minotaur (level 12) suits your current kit best') && verdict.includes('Minotaur (level 27):'), 'readiness (Zen): both Minotaur versions are compared');
  // Preparation opens on its ribbon: its own card is the one in the step view's panel.
  await zen.page.locator('#step-view-panel .readiness-verdict summary').first().click();
  const why = await text(zen.page, '#step-view-panel .readiness-verdict');
  expect(why.includes('Mithril scimitar: suitable for training') && why.includes('Armour: Iron full helm'), 'readiness (Zen): the weapon and the armour are judged');
  expect(why.includes('not a chance of surviving'), 'readiness (Zen): the percent is never a survival chance');
  if (process.env.UI_SHOTS) await zen.page.locator('dialog[aria-label="Preparation"] .readiness-verdict').first().screenshot({ path: `${process.env.UI_SHOTS}/readiness-s308-${width}.png` }).catch(() => {});
  expect(!prep.includes('What to train with'), 'food plan (Zen): no other training place beside the Minotaurs of the step');
  expect(prep.includes('Where to get each item') && !prep.includes('Required items and food'), 'food plan (Zen): the item cards wait behind "Where to get each item"');
  expect(await noOverflow(zen.page), 'food plan (Zen): no horizontal scrolling');
  expect(!zen.errors.length, `food plan (Zen): no console errors ${zen.errors.join('; ')}`);
  await zen.page.context().close();
}

// 2.12.1: Magic 25 is there but the runes are not — the quick Varrock Teleport is not passed off as ready, it says what is missing.
async function magic25Runes(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-05'),
    events: [{ type: 'STATS', stats: { magic: 25 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Law rune', carried: 0, noted: 0, bank: 0 }, { name: 'Air rune', carried: 0, noted: 0, bank: 0 }] }],
  }, '#/step/S2-05');
  await waitFor(page, '.branch-missing', 5000);
  const t = await text(page, '.branch-missing');
  expect(t.includes('Missing') && t.includes('Law rune'), 'quick variant: no runes — "missing Law rune"');
  expect((await page.locator('.branch button:has-text("Lead in the game")').count()) === 0, 'quick variant: without runes it does not lead by teleport in the game');
  expect(!errors.length, `quick variant: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// 2.15: the dragon fight (S5-08) — "Food for combat": Elvarg's hits per the wiki and the food advice.
async function dragonFightFood(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S5-08'),
    events: [{ type: 'STATS', stats: { hitpoints: 40 } }],
  }, '#/step/S5-08');
  const f = await text(page, '.food-advice');
  expect(f.includes('Food for combat') && f.includes('Elvarg') && f.includes('Eat when HP is below'), 'S5-08: "Food for combat" — Elvarg\'s hits and the food threshold');
  expect(await noOverflow(page), 'S5-08: no horizontal scrolling');
  expect(!errors.length, `S5-08: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// 2.63.0: a quest fight with the real kit (S2-08 Count Draynor): how long, how much damage, the food, and how it is worked out.
async function questFightKit(browser: Browser) {
  const width = 1100;
  const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [{ id: 333, name: 'Trout', count: 5 }], coins: 100, bankCoins: 0 };
  const stats = { attack: 20, strength: 20, defence: 1, hitpoints: 20 };
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-08'),
    status: { protocol: 5, ...gear, stats, activeStepId: 'S2-08' },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }],
  }, '#/step/S2-08');
  await waitFor(page, '.fight-plan', 8000);
  const f = await text(page, '.fight-plan');
  expect(/Count Draynor: about \d+ s on (Accurate|Aggressive|Defensive); you take about \d+ damage/.test(f), `S2-08: the fight with your kit (${f.replace(/\s+/g, ' ').slice(0, 160)})`);
  await page.locator('.fight-plan summary').click();
  const d = await text(page, '.fight-plan');
  expect(d.includes('you hit') && d.includes('No kit guarantees survival'), 'S2-08: how the fight estimate is worked out');
  if (process.env.UI_SHOTS) await page.locator('.food-advice').screenshot({ path: `${process.env.UI_SHOTS}/fight-s208-${width}.png` }).catch(() => {});
  expect(await noOverflow(page), 'S2-08: no horizontal scrolling');
  expect(!errors.length, `S2-08: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'combat-route': combatRouteScenarios,
  'item-food': retainedCombatFoodScenario,
  'xp-only-combat': xpOnlyCombatScenario,
  'magic-route': magicRouteScenarios,
  'style-quotes': styleQuoteScenarios,
  'minotaur-route': minotaurRoute,
  'magic-25-runes': magic25Runes,
  'dragon-fight-food': dragonFightFood,
  'quest-fight-kit': questFightKit,
};
