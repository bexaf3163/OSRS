// Preparation and departure: scenarios of the browser suite (npm run test:ui -- --only prep).
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { PICKAXES } from '../../../../src/domain/items/toolTiers.ts';
import { BASE, progressBefore, open, settle, expect, noOverflow, reveal, waitFor, text } from '../harness.ts';

async function stockScenarios(browser: Browser) {
  const catalog = JSON.parse(readFileSync(new URL('../../../../src/data/generated/f2p-items.json', import.meta.url), 'utf8')) as { nameEn: string; id: number }[];
  const findLocalItem = (name: string) => catalog.find(item => item.nameEn === name);
  const styles = JSON.parse(readFileSync(new URL('../../../../src/data/generated/styleGear.json', import.meta.url), 'utf8')).ranged as Record<string, { names: string[] }[]>;
  const RANGED_WATCH = [...new Set([...Object.values(styles).flatMap(options => options.flatMap(option => option.names)), 'Longbow', 'Oak longbow', 'Willow longbow', 'Maple longbow'])];
  const stats = { ranged: 1, attack: 40, strength: 40, defence: 1, hitpoints: 30 };
  const equipped = ['Shortbow', 'Leather cowl', 'Leather body', 'Leather chaps', 'Leather vambraces', 'Leather boots'];
  const equipment = equipped.map((name, i) => ({ name, id: findLocalItem(name)?.id ?? 50000 + i, count: 1, slot: ['weapon', 'head', 'body', 'legs', 'hands', 'feet'][i] }));
  const marketQuotes = Object.fromEntries(RANGED_WATCH.flatMap(name => {
    const id = findLocalItem(name)?.id;
    return id === undefined ? [] : [[name, { id, price: name.endsWith('arrow') ? 1 : 100, limit: name.endsWith('arrow') ? 10000 : 100 }]];
  }));
  for (const cash of [20000, 120]) {
    const gear = { equipment, inventory: [], coins: cash, bankCoins: 0 };
    const items = RANGED_WATCH.map(name => ({ name, carried: 0, noted: 0, bank: 0 }));
    const { page, errors } = await open(browser, 1280, {
      market: true, marketQuotes, progress: progressBefore('S6-04', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:skill-track': JSON.stringify({ skill: 'ranged', mode: 'f2p', target: 40 }), 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      status: { inGame: true, protocol: 6, player: 'Stock fixture', activeStepId: 'S6-04', stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/shopping');
    await settle(page);
    const stock = page.getByRole('region', { name: 'Optional bank stock' });
    if (cash > 1000) {
      await stock.waitFor();
      expect((await stock.innerText()).includes('Oak shortbow'), 'stock: next bow is offered on the existing shopping trip');
      expect((await stock.innerText()).includes('Willow shortbow'), 'stock: second useful bow is included instead of stopping at a model-rate review');
      const snapshot = await page.evaluate(() => (window as any).__posts.filter((p: any) => p.path === '/prep-plan').at(-1)?.body?.shopping);
      expect(snapshot?.items?.some((i: any) => i.name === 'Oak shortbow'), 'stock: the same optional purchase reaches the in-game exchange list');
      expect(await page.getByRole('region', { name: 'Checkout', exact: true }).getByText('Shortfall', { exact: true }).count() === 0, 'stock: optional purchases do not create a funding shortfall');
      await page.screenshot({ path: 'audit-temp/stock-shopping.png' });
    } else expect(await stock.count() === 0, 'stock: a small budget retains the current kit without optional purchases');
    expect(await noOverflow(page) && errors.length === 0, `stock (${cash}gp): Ledger fits without runtime errors`);
    await page.goto(`${BASE}#/gear`);
    await page.getByRole('region', { name: 'Activity kit' }).waitFor();
    expect((await page.getByRole('region', { name: 'Activity kit' }).innerText()).includes('Ranged'), 'context: Gear uses the followed Ranged plan while the route is active');
    expect(await page.locator('.gear-reco').count() === 0 && !/Cow|attacks with crush/.test(await text(page, '.gear-page .page-head')), 'context: a ranged kit has no unrelated melee comparison');
    expect((await text(page, '.gear-now')).includes('Leather vambraces'), 'context: non-melee equipment includes gloves, not just the six melee slots');
    await page.screenshot({ path: `audit-temp/context-gear-${cash}.png` });
    await page.context().close();
  }
}

async function cleanupScenarios(browser: Browser) {
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S6-04', { gameMode: 'f2p' }),
    status: { stats: { ranged: 12, attack: 40, strength: 44, defence: 44, hitpoints: 40 } },
    events: [{ type: 'STATS', stats: { ranged: 12, attack: 40, strength: 44, defence: 44, hitpoints: 40 } }],
    localStorage: {
      'osrs-put:theme': 'dark', 'osrs-put:look': 'classic', 'osrs-put:solid': '1',
      'osrs-put:text-scale': '1.5', 'osrs-put-settings-tab': 'look',
      'osrs-put:features': JSON.stringify({ compact: true, inspector: true, profitTraining: true, autoPrep: false, keepDefenceOne: true }),
    },
  }, '#/settings');
  expect(await page.getByRole('tab', { name: 'RuneLite', exact: true }).getAttribute('aria-selected') === 'true', 'cleanup: retired saved Appearance tab falls back to RuneLite');
  expect(await page.getByRole('tab', { name: 'Appearance', exact: true }).count() === 0 && await page.getByRole('slider').count() === 0, 'cleanup: Appearance and font sliders are absent');
  expect(await page.getByRole('button', { name: /compact|full workspace|inspector/i }).count() === 0, 'cleanup: legacy saved modes cannot restore retired controls');
  expect(await page.evaluate(() => !document.documentElement.dataset.theme && !document.documentElement.dataset.look && !document.documentElement.style.getPropertyValue('--text-scale')), 'cleanup: retired saved appearance does not change the document');
  await page.getByRole('tab', { name: 'Training', exact: true }).click();
  const priorities = page.getByRole('group', { name: 'Training choices' });
  expect(await priorities.getByRole('button', { name: 'Money', exact: true }).getAttribute('aria-pressed') === 'true', 'cleanup: active saved training priority survives');
  expect(!await page.getByRole('checkbox', { name: /Auto preparation/ }).isChecked() && await page.getByRole('checkbox', { name: /Keep Defence/ }).isChecked(), 'cleanup: preparation and Defence preferences survive');
  await priorities.getByRole('button', { name: 'Balanced', exact: true }).click();
  expect(await priorities.getByRole('button', { name: 'Balanced', exact: true }).getAttribute('aria-pressed') === 'true', 'cleanup: training priority remains editable');
  await page.screenshot({ path: 'audit-temp/cleanup-training-settings.png' });
  await page.getByRole('tab', { name: 'RuneLite', exact: true }).click();
  const helpers = page.locator('.settings-advanced').filter({ hasText: 'More helpers' });
  await helpers.locator('summary').first().click();
  expect(await helpers.getByRole('checkbox').count() === 5, 'cleanup: all five working RuneLite helper controls remain');
  await page.getByRole('tab', { name: 'App', exact: true }).click();
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  expect(await page.evaluate(() => Number((window as unknown as { __updateChecks?: number }).__updateChecks)) === 1 && await page.getByRole('button', { name: 'Copy the report', exact: true }).count() === 0, 'cleanup: updates remain functional and retired Copy Report is absent');
  await page.goto(`${BASE}#/goals`);
  await settle(page);
  expect(await page.locator('.goals-table').count() === 0 && await page.locator('.journal-session > summary').count() === 1, 'cleanup: old goals links open the surviving journal/session');
  await page.goto(`${BASE}#/skills/RA/ranged`);
  await page.getByRole('group', { name: 'Training priority' }).waitFor();
  expect(await page.locator('.skill-roadmap').count() === 0 && await page.locator('.training').count() === 1, 'cleanup: Ranged has one personalized plan, not a competing static roadmap');
  await page.screenshot({ path: 'audit-temp/cleanup-ranged-plan.png' });

  let failTiles = true;
  const requested: string[] = [];
  const png = readFileSync(new URL('../../../../public/skill-icons/ranged.png', import.meta.url));
  await page.route(/maps\.runescape\.wiki/, (route) => {
    const url = route.request().url();
    requested.push(url);
    if (process.env.UI_REAL_MAP === '1' && !failTiles) return route.continue();
    if (url.includes('/data/dataloader.json')) return route.fulfill({ json: { baseMaps: [{ mapId: 0, cacheVersion: '2019-10-31_1', bounds: [[1000, 1000], [4300, 13000]] }] } });
    return route.fulfill({ status: failTiles ? 404 : 200, contentType: 'image/png', body: failTiles ? '' : png });
  });
  await page.goto(`${BASE}#/step/S6-04`);
  await page.getByRole('tab', { name: 'Route & game', exact: true }).click();
  await page.getByRole('button', { name: 'Retry map', exact: true }).waitFor();
  expect(await page.locator('.map-preview').count() === 1, 'cleanup: Route has one map preview');
  expect(!(await text(page, '.map-preview')).includes('no connection'), 'cleanup: a missing tile is not labelled an internet failure');
  failTiles = false;
  await page.getByRole('button', { name: 'Retry map', exact: true }).click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>('.map-preview .map-tiles img')];
    return images.length > 0 && images.every((i) => i.complete && i.naturalWidth > 0);
  });
  expect(requested.some((u) => /\/osrs\/tiles\/0_2019-10-31_1\//.test(u) && u.includes('?retry=1')), 'cleanup: retry loads the documented atlas schema');
  await page.getByRole('button', { name: /World map/i }).first().click();
  await page.locator('dialog.map-modal[open]').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('dialog.map-modal .leaflet-tile')].some((i) => i.complete && i.naturalWidth > 0));
  expect(await page.locator('dialog.map-modal[open]').count() === 1, 'cleanup: full map still loads after preview recovery');
  if (process.env.UI_REAL_MAP === '1') await page.screenshot({ path: 'audit-temp/cleanup-real-wiki-map.png' });
  await page.keyboard.press('Escape');
  expect(await noOverflow(page) && !errors.length, 'cleanup: surviving navigation has no overflow or runtime errors');
  await page.context().close();
}

async function marketPreparationScenarios(browser: Browser) {
  for (const width of [1280]) for (const unavailable of [false, true]) {
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: unavailable,
      progress: progressBefore('S4-04', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S4-04' },
      status: { protocol: 6, activeStepId: 'S4-04', coins: 10000, bankCoins: 0 },
      events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Lobster', carried: 0, noted: 0, bank: 0 }] }],
    }, '#/step/S4-04');
    // The quest's items are on the Preparation ribbon.
    await reveal(page, '.quest-supply-list');
    const supplies = page.locator('.quest-supply-list');
    await supplies.getByText(unavailable ? 'Price unavailable' : 'GE estimate: ≈ 2,060 gp (103 each)', { exact: true }).waitFor({ timeout: 6000 });
    expect(await supplies.getByText(unavailable ? 'Price unavailable' : 'GE estimate: ≈ 2,060 gp (103 each)', { exact: true }).count() === 1,
      'market preparation (' + width + ', unavailable=' + unavailable + '): one supporting estimate, multiplied from the current quote');
    await settle(page);
    const price = await page.evaluate(() => {
      const w = window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; price?: string }[] } } }[] };
      return w.__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines.find(l => l.name === 'Lobster')?.price;
    });
    expect(unavailable ? price === 'Price unavailable' : !!price?.startsWith('GE estimate: ≈ 2,060 gp'),
      'market preparation (' + width + ', unavailable=' + unavailable + '): the game receives the same estimate or honest absence');
    expect(!(await page.locator('main').innerText()).includes('26 Sep 2026'), 'market preparation (' + width + '): no historical route price date');
    expect(await noOverflow(page) && !errors.length, 'market preparation (' + width + '): no overflow or console errors');
    await page.context().close();
  }
}

async function toolProofScenarios(browser: Browser) {
  for (const width of [1280]) {
    const rows = PICKAXES.map(name => ({ name, carried: 0, noted: 0, bank: 0, exactCarried: 0, exactNoted: 0, exactBank: 0 }));
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S1-12', { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': 'S1-12' },
      status: { protocol: 6, stats: { mining: 6 }, activeStepId: 'S1-12' },
      events: [{ type: 'STATS', stats: { mining: 6 } }, { type: 'OWNED', bankSeen: true, items: [rows[0]] }],
    }, '#/step/S1-12');
    const line = () => page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; where: string; action?: string }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines.find(l => l.name === 'Bronze pickaxe');
    });
    await settle(page);
    const unreported = await line();
    if (!unreported) console.log('tool proof: missing snapshot line', await page.evaluate(() => (window as unknown as { __posts: unknown[] }).__posts.slice(-8)));
    expect(unreported?.where === 'UNKNOWN' && !/^(Buy|Withdraw) /i.test(unreported.action ?? ''), `tool proof (${width}): an absent bronze tier cannot invent a purchase while another usable tier is unread`);
    const banked = [rows[0], { ...rows[1], bank: 1, exactBank: 1 }];
    await page.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }), banked);
    await settle(page);
    expect((await line())?.where === 'BANK', `tool proof (${width}): confirmed banked stock can cover the goal without checking every other tier`);
    await page.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }), rows);
    await settle(page);
    expect((await line())?.where === 'MISSING', `tool proof (${width}): checking every eligible tier establishes a genuine shortage`);
    const held = rows.map(r => r.name === 'Iron pickaxe' ? { ...r, carried: 1, exactCarried: 1 } : r);
    await page.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }), held);
    await settle(page);
    expect((await line())?.where === 'INVENTORY', `tool proof (${width}): the owned usable tier clears the preparation action`);
    expect(await noOverflow(page) && !errors.length, `tool proof (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function armourPreparationScenarios(browser: Browser) {
  const pieces = ([[1165, 'Black full helm', 'head'], [1125, 'Black platebody', 'body'], [1077, 'Black platelegs', 'legs'], [1195, 'Black kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const weapon = { id: 1331, name: 'Adamant scimitar', slot: 'weapon' };
  const stats = { attack: 30, strength: 21, defence: 10, hitpoints: 24 };
  const xp = { attack: 13363, strength: 2000, defence: 1154, hitpoints: 3500 };
  const items = [...pieces.map(p => ({ name: p.name, carried: 1, noted: 0, bank: 0 })), { name: 'Black plateskirt', carried: 0, noted: 0, bank: 0 }];
  const gear = { equipment: [weapon], inventory: pieces, coins: 10000, bankCoins: 0 };
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S4-03', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S4-03' }, market: true,
      status: { protocol: 6, inGame: true, player: 'Armour Test', activeStepId: 'S4-03', stats, xp, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S4-03');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    await settle(page);
    const prep = await snapshot();
    expect(prep?.step?.goal?.includes('10 Defence required') && prep.step.checklist?.length === 4 && prep.step.checklist.every((i: any) => i.equip),
      `armour (${width}): the same four-piece equip requirement and Defence level reach the game`);
    const currentArmour = prep?.plan?.lines?.filter((i: any) => i.equip && i.timing === 'NOW') ?? [];
    expect(currentArmour.length === 4 && currentArmour.every((i: any) => i.where === 'INVENTORY' && /^Equip /.test(i.action))
      && !prep.plan.bankWithdrawals?.some((i: any) => pieces.some(p => p.id === i.itemId)),
      `armour (${width}): carried armour requires equipping, with no duplicate purchase or withdrawal`);
    await reveal(page, '.quest-supply-state');
    expect(await page.locator('.quest-supply-state').filter({ hasText: /^↗ Equip$/ }).count() === 4, `armour (${width}): each current supply says Equip`);
    const worn = { ...gear, equipment: [weapon, ...pieces], inventory: [] };
    await page.evaluate(g => {
      const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
      w.__status = { ...w.__status, ...g };
      w.__emit({ type: 'GEAR', gear: g });
    }, worn);
    await settle(page);
    const trained = await snapshot();
    expect(trained?.step?.pacing?.targetExp > 0 && !trained.step.checklist?.some((i: any) => i.equip), `armour (${width}): confirmed worn gear advances to training`);
    expect(trained?.step?.completionTrigger?.levels?.[0]?.level === 40 && !trained.step.completionTrigger?.items?.length, `armour (${width}): saved route completion remains Attack 40 only`);
    expect(await noOverflow(page) && !errors.length, `armour (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function rangedPreparationScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { ranged: 1, defence: 1, hitpoints: 30 };
    const weapon = { id: 841, name: 'Shortbow', slot: 'weapon', count: 1 };
    const arrow = { id: 882, name: 'Bronze arrow', slot: 'ammo', count: 1 };
    const clothes = ['Leather cowl', 'Leather body', 'Leather chaps', 'Leather vambraces', 'Leather boots'].map((name, i) => ({ id: 50000 + i, name, slot: ['head', 'body', 'legs', 'hands', 'feet'][i], count: 1 }));
    const gear = { equipment: [weapon, arrow], inventory: [], coins: 1000, bankCoins: 0 };
    const names = ['Maple shortbow', 'Maple longbow', 'Willow shortbow', 'Willow longbow', 'Oak shortbow', 'Oak longbow', 'Shortbow', 'Longbow', 'Adamant arrow', 'Mithril arrow', 'Steel arrow', 'Iron arrow', 'Bronze arrow', 'Salmon', 'Tuna', 'Lobster', 'Swordfish', ...clothes.map(c => c.name), 'Coif', 'Studded body', 'Studded chaps', "Green d'hide body", "Green d'hide chaps", "Green d'hide vambraces", 'Amulet of power', 'Amulet of accuracy'];
    const items = names.map(name => ({ name, carried: name === 'Shortbow' ? 1 : name === 'Bronze arrow' ? 100 : 0, noted: 0, bank: name === 'Salmon' ? 10 : clothes.some(c => c.name === name) ? 1 : 0 }));
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-04', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-04' },
      status: { protocol: 6, inGame: true, player: 'Ranged Preparation', activeStepId: 'S6-04', stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S6-04');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const initial = await snapshot();
    expect(/Train ranged to 5 at /.test(JSON.stringify(initial?.step?.guide?.steps)), `ranged (${width}): the actual game guide stops at the first bow milestone, not40`);
    expect(initial?.step?.npcNames?.includes('Seagull') && initial.step.worldPoint?.label?.includes('Port Sarim'), `ranged (${width}): a beginner gets the current surface trainer, not ogresses`);
    expect(initial?.step?.checklist?.some((r: any) => r.name === 'Bronze arrow' && r.count === 100 && r.equip) && initial.plan?.lines?.find((r: any) => r.name === 'Bronze arrow')?.where !== 'EQUIPPED', `ranged (${width}): one worn arrow cannot satisfy the starter stack`);
    expect(clothes.every(c => initial?.step?.checklist?.some((r: any) => r.name === c.name && r.equip) && initial.plan?.lines?.find((r: any) => r.name === c.name)?.where === 'BANK'), `ranged (${width}): the whole owned ranged outfit is prepared from the bank`);
    const equipped = { ...gear, equipment: [weapon, { ...arrow, count: 100 }, ...clothes] };
    await page.evaluate(g => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, ...g }; w.__emit({ type: 'GEAR', gear: g }); }, equipped);
    await settle(page);
    const ready = await snapshot();
    expect(ready?.plan?.lines?.find((r: any) => r.name === 'Bronze arrow')?.where === 'EQUIPPED', `ranged (${width}): a GEAR-only quantity update reaches the canonical preparation snapshot`);
    expect(clothes.every(c => ready?.plan?.lines?.find((r: any) => r.name === c.name)?.where === 'EQUIPPED'), `ranged (${width}): actual equipped outfit clears its preparation lines`);
    // Known HP/Defence are needed for personalized recovery; prices and owned food make the frog kit practical.
    for (const [level, npc] of [[20, 'Monk'], [26, 'Giant frog'], [30, 'Giant frog']] as const) {
      await page.evaluate(s => { const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, { ranged: level, defence: 1, hitpoints: 30 });
      await settle(page);
      const current = await snapshot();
      expect(JSON.stringify(current?.step?.npcNames) === JSON.stringify([npc]) && !current?.step?.worldPoint?.label?.includes('Corsair'), `ranged (${width}, level${level}): method, scenery and destination advance together`);
      expect(current?.step?.checklist?.some((r: any) => r.name === (level >= 30 ? 'Maple shortbow' : 'Willow shortbow') && r.equip), `ranged (${width}, level${level}): the current bow unlock is actual preparation`);
      if (level === 26) expect(current?.step?.checklist?.some((r: any) => r.name === 'Salmon' && r.count === 10) && current.plan?.lines?.find((r: any) => r.name === 'Salmon')?.where === 'BANK', `ranged (${width}): the later combat method asks for owned banked food`);
    }
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Giant frogs'), `ranged (${width}): the visible desktop advice matches the game target`);
    await page.screenshot({ path: `audit-temp/ranged-kit-${width}.png` });
    expect(await noOverflow(page) && !errors.length, `ranged (${width}): no overflow or runtime errors`);
    await page.evaluate(() => { location.hash = '#/skills'; });
    await page.locator('.skill-tile a[href$="/ranged"]').click();
    expect(await page.locator('.skill-detail details').count() === 0, `ranged (${width}): the Train view gains no disclosure stack`);
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    const goalText = await text(page, '.training-analysis');
    expect(goalText.includes('Conditional goal supplies (estimate)') && goalText.includes('Salmon') && goalText.includes('arrow'), `ranged (${width}): Plan exposes the complete staged ammunition and food estimate`);
    expect(goalText.includes('assumes safe arrow recovery') && goalText.includes('Future funding and product sales are not assumed'), `ranged (${width}): pickup and funding assumptions stay explicit`);
    expect(await noOverflow(page) && !errors.length, `ranged (${width}): goal estimates fit the accepted Ledger`);
    await page.screenshot({ path: `audit-temp/ranged-goal-plan-${width}.png` });
    await page.evaluate(() => { (window as any).__trainingMain = document.getElementById('main'); });
    await page.getByRole('tab', { name: 'Train', exact: true }).click();
    await page.locator('.training-follow').click();
    await waitFor(page, '.tracked-skill', 5000);
    await settle(page);
    const followed = await snapshot();
    expect(followed?.step?.stepId === 'S0-04' && !followed.skillPath && followed.step.checklist?.some((r: any) => r.name === 'Maple shortbow'), `ranged (${width}): the real Train button starts a prepared engine session, not a temporary location arrow`);
    expect(followed?.plan?.stepId === 'S0-04' && !followed.step.completionTrigger, `ranged (${width}): the followed skill has canonical preparation without writing synthetic quest completion`);
    expect(await page.evaluate(() => (window as any).__trainingMain === document.getElementById('main')), `ranged (${width}): starting training preserves the app tree and existing UI state`);
    expect((await page.locator('.step-view').count()) === 0 && await noOverflow(page) && !errors.length, `ranged (${width}): the active skill replaces the quest workspace without a second guide or overflow`);
    await page.screenshot({ path: `audit-temp/ranged-guided-session-${width}.png` });
    await page.getByRole('button', { name: 'Back to the quest route', exact: true }).click();
    await settle(page);
    expect((await snapshot())?.step?.stepId === 'S6-04', `ranged (${width}): stopping restores the retained quest route`);
    expect(await page.evaluate(() => (window as any).__trainingMain === document.getElementById('main')), `ranged (${width}): stopping training preserves the app tree`);
    await page.context().close();
    const restarted = await open(browser, width, {
      market: true, progress: progressBefore('S6-04', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-04', 'osrs-put:skill-track': JSON.stringify({ skill: 'ranged', mode: 'fast', freeOnly: true }) },
      status: { protocol: 6, inGame: true, player: 'Ranged Preparation', activeStepId: 'S6-04', stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/');
    const last = () => restarted.page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    expect((await last())?.step?.stepId === 'S0-04' && !(await last())?.skillPath && /to 5/.test((await last())?.step?.goal), `ranged (${width}): an old saved Wiki-follow setting reloads into the current engine leg, never seagulls to40`);
    await restarted.page.evaluate(() => {
      const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
      const stats = { ranged: 20, defence: 1, hitpoints: 30 };
      w.__status = { ...w.__status, stats }; w.__emit({ type: 'STATS', stats });
    });
    await settle(restarted.page);
    const advanced = await last();
    expect(advanced?.step?.stepId === 'S0-04' && !advanced.step.npcNames?.includes('Seagull') && advanced.step.checklist?.some((i: any) => i.name === 'Willow shortbow'), `ranged (${width}): the followed session advances its trainer and required bow on a real-level event without another click`);
    expect(await noOverflow(restarted.page) && !restarted.errors.length, `ranged (${width}): restored session has no overflow or runtime errors`);
    await restarted.page.evaluate(() => {
      const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
      const stats = { ranged: 40, defence: 1, hitpoints: 30 };
      w.__status = { ...w.__status, stats }; w.__emit({ type: 'STATS', stats });
    });
    await settle(restarted.page);
    const reached = await last();
    expect((await text(restarted.page, '.tracked-skill')).includes('checkpoint reached'), `ranged (${width}): the actual level40 event stops at the F2P checkpoint`);
    expect(!reached?.skillPath && reached?.step?.stepId !== 'S6-04' && !reached?.step?.worldPoint && !reached?.step?.npcNames?.length, `ranged (${width}): completion clears the trainer without silently restoring the quest`);
    await restarted.page.getByRole('button', { name: 'Back to the quest route', exact: true }).click();
    await settle(restarted.page);
    expect((await last())?.step?.stepId === 'S6-04', `ranged (${width}): only the explicit return restores the quest after completion`);
    await restarted.page.context().close();
    const poorStats = { ...stats, ranged: 20, attack: 30, strength: 21, mining: 18, woodcutting: 15 };
    const poorGear = { ...gear, coins: 0, bankCoins: 0 };
    const poor = await open(browser, width, {
      market: true, progress: progressBefore('S6-04', { gameMode: 'f2p', levels: poorStats, sellRestrictions: 'lifted' }),
      marketQuotes: { 'Willow shortbow': { id: 849, price: 100 } },
      localStorage: { 'osrs-put:active-step': 'S6-04', 'osrs-put:skill-track': JSON.stringify({ skill: 'ranged', mode: 'fast', freeOnly: true }) },
      status: { protocol: 6, inGame: true, player: 'Range Fund', activeStepId: 'S6-04', stats: poorStats, questPoints: 40, totalLevel: 200, pos: { x: 3093, y: 3495, plane: 0 }, ...poorGear },
      events: [{ type: 'STATS', stats: poorStats }, { type: 'GEAR', gear: poorGear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/');
    await waitFor(poor.page, '.funding-card.is-running', 12000).catch(async error => {
      await poor.page.screenshot({ path: `audit-temp/ranged-funding-failure-${width}.png` });
      throw new Error(`${String(error)}\n${await poor.page.locator('.tracked-skill').innerText()}`);
    });
    const poorSnapshot = () => poor.page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    await settle(poor.page);
    expect(Boolean((await poorSnapshot())?.funding?.action) && (await poorSnapshot())?.step?.stepId === 'S0-04', `ranged (${width}): a confirmed kit shortfall automatically starts the existing earning guide for the same skill session`);
    await poor.page.locator('.funding-card.is-running').getByRole('button', { name: 'Cancel', exact: true }).click();
    await settle(poor.page);
    expect(await poor.page.locator('.funding-card.is-running').count() === 0, `ranged (${width}): cancelling the earning detour does not immediately restart it`);
    await poor.page.evaluate(g => {
      const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
      w.__status = { ...w.__status, ...g }; w.__emit({ type: 'GEAR', gear: g });
    }, { ...poorGear, coins: 100000 });
    await settle(poor.page);
    expect(!(await poorSnapshot())?.funding && (await poorSnapshot())?.plan?.stepId === 'S0-04', `ranged (${width}): available funds return to the same preparation flow`);
    expect(await noOverflow(poor.page) && !poor.errors.length, `ranged (${width}): funding handover has no overflow or runtime errors`);
    await poor.page.context().close();
  }
}

async function nonCombatPreparationScenarios(browser: Browser) {
  const stats = { mining: 1, smithing: 1, attack: 1, strength: 1, defence: 1, hitpoints: 10 };
  const gear = { equipment: [], inventory: [{ id: 1265, name: 'Bronze pickaxe', count: 1 }], coins: 0, bankCoins: 0 };
  const items = PICKAXES.map(name => ({ name, carried: name === 'Bronze pickaxe' ? 1 : 0, noted: 0, bank: name === 'Mithril pickaxe' ? 1 : 0 }));
  const mock = {
    market: true, progress: progressBefore('S2-07', { gameMode: 'f2p', levels: stats }),
    localStorage: { 'osrs-put:active-step': 'S2-07' },
    status: { protocol: 6, inGame: true, player: 'Preparation Target', activeStepId: 'S2-07', questsDone: [], stats, ...gear },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
  };
  {
    const { page, errors } = await open(browser, 1280, mock, '#/skills/MI/mining?goal=10');
    await page.locator('.training-follow').waitFor();
    expect((await text(page, 'h1')).includes('Goal 10'), 'Preparation: Mining10 opens directly instead of the default45 checkpoint');
    await page.locator('.training-follow').click();
    await page.locator('.tracked-skill').waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('osrs-put:skill-track') ?? '{}').target === 10);
    await page.evaluate(() => { location.hash = '#/skills/MI/mining?goal=15'; });
    await page.locator('h1').filter({ hasText: 'Goal 15' }).waitFor();
    await page.locator('.training-follow').click();
    await page.locator('.tracked-skill').waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('osrs-put:skill-track') ?? '{}').target === 15);
    expect(true, 'Preparation: following a new target updates an already followed skill');
    await page.getByRole('button', { name: 'Back to the quest route', exact: true }).click();
    await page.waitForFunction(() => (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.stepId === 'S2-07');
    await page.evaluate(next => {
      const w = window as any; w.__status = { ...w.__status, stats: next }; w.__emit({ type: 'STATS', stats: next });
      location.hash = '#/skills/MI/mining?goal=25';
    }, { ...stats, mining: 21 });
    await page.locator('.training-follow').waitFor();
    await page.locator('.training-follow').click();
    await page.locator('.tracked-skill').waitFor();
    await page.waitForFunction(() => (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.guide?.items?.some((item: any) => item.name === 'Mithril pickaxe'));
    expect((await text(page, '.tracked-skill')).includes('Mithril pickaxe'), 'Preparation: the owned usable pickaxe is named even with Attack1');
    expect(await noOverflow(page) && !errors.length, 'Preparation: exact goals and owned tools fit the accepted Ledger');
    await page.screenshot({ path: 'audit-temp/peaceful-preparation-1280.png' });
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, mock, '#/skills/SM/smithing');
    await page.getByRole('button', { name: 'Open quest guide', exact: true }).waitFor();
    expect((await text(page, '.training')).includes("The Knight's Sword"), 'Smithing: the default29 checkpoint offers its actual XP quest rather than a bronze grind');
    await page.getByRole('button', { name: 'Open quest guide', exact: true }).click();
    await page.waitForFunction(() => location.hash === '#/step/S2-07' && (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.stepId === 'S2-07');
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}'));
    expect(!progress.steps?.['S2-07'] && progress.levels?.smithing === 1, 'Smithing: opening the real quest guide awards neither XP nor quest completion');
    expect(await page.locator('.tracked-skill').count() === 0 && !errors.length, 'Smithing: the existing quest route starts without a parallel training engine');
    await page.context().close();
  }
}

async function magicPreparationScenarios(browser: Browser) {
  const width = 1280, stats = { magic: 3, defence: 10, hitpoints: 24, smithing: 15 };
  const clothes = ['Blue wizard hat', 'Blue wizard robe', 'Amulet of magic'];
  const names = (JSON.parse(readFileSync(new URL('../../../../src/data/generated/gear.json', import.meta.url), 'utf8')) as { items: { name: string }[] }).items.map(item => item.name);
  const items = [...new Set([...names, 'Air rune', 'Mind rune', 'Water rune', 'Earth rune', 'Fire rune', 'Nature rune', 'Trout', 'Salmon', 'Tuna', 'Lobster', 'Swordfish'])].map(name => ({
    name, carried: ['Air rune', 'Mind rune'].includes(name) ? 1000 : name === 'Trout' ? 5 : name === 'Staff of fire' ? 1 : 0,
    noted: 0, bank: clothes.includes(name) ? 1 : 0,
  }));
  const gear = { equipment: [{ id: 1387, name: 'Staff of fire', slot: 'weapon', count: 1 }], inventory: [
    { id: 556, name: 'Air rune', count: 1000 }, { id: 558, name: 'Mind rune', count: 1000 }, { id: 333, name: 'Trout', count: 5 },
  ], coins: 0, bankCoins: 0 };
  const { page, errors } = await open(browser, width, {
    market: true, progress: progressBefore('S6-03', { gameMode: 'f2p', levels: stats }),
    localStorage: { 'osrs-put:active-step': 'S6-03' },
    status: { protocol: 6, inGame: true, player: 'Magic Prep', activeStepId: 'S6-03', stats, ...gear },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
  }, '#/skills/MA/magic');
  await page.getByRole('tab', { name: 'Calculator', exact: true }).click();
  await page.getByLabel('Goal', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Follow to level 6', exact: true }).click();
  await page.locator('.tracked-skill').waitFor();
  const snapshot = () => page.evaluate(() => (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body);
  await page.waitForFunction(() => (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.stepId === 'S0-06');
  const first = await snapshot();
  expect(/to 5/.test(first.step.goal), 'Magic: the first action ends at the next real spell milestone');
  expect(first.step.checklist.some((item: any) => item.name === 'Mind rune') && first.step.checklist.some((item: any) => item.name === 'Air rune'), 'Magic: the followed session carries the actual casting ingredients');
  expect(clothes.every(name => first.step.watchItems.includes(name)), 'Magic: bank scanning requests the verified robe, hat and amulet options');
  expect(!first.step.completionTrigger && !first.skillPath, 'Magic: the canonical prepared step replaces the old Wiki path without synthetic completion');
  await page.evaluate(next => {
    const w = window as any; w.__status = { ...w.__status, stats: next }; w.__emit({ type: 'STATS', stats: next });
  }, { ...stats, magic: 5 });
  await page.waitForFunction(() => /to 6/.test((window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.goal ?? ''));
  expect((await snapshot()).step.stepId === 'S0-06', 'Magic: the real level update advances the same session to its next leg');
  expect(await noOverflow(page) && !errors.length, 'Magic: the staged guide fits the accepted Ledger without runtime errors');
  await page.screenshot({ path: 'audit-temp/magic-guided-session-1280.png' });
  await page.getByRole('button', { name: 'Back to the quest route', exact: true }).click();
  await page.waitForFunction(() => (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.stepId === 'S6-03');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}'))).steps?.['S6-03'] !== 'done', 'Magic: stopping restores the quest without awarding the uncompleted Magic55 goal');
  await page.context().close();
}

// The auto queue of the preparation: it sets the arrow to the bank for a Knife by itself, remembers the trip, survives a reload;
// the player cleared the arrow — the queue is paused, "Continue" brings it back.
async function autoQueue(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S9-01'),
    status: { stats: { crafting: 40, woodcutting: 40 } },
    events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
  }, '#/step/S9-01');
  type Post = { path: string; body: Record<string, unknown> };
  const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
  // The link with the game and the bank do not arrive at once — we wait until the queue starts a trip.
  await page.waitForFunction(() => (window as unknown as { __posts: Post[] }).__posts.some((p) => p.path === '/nav-target'), null, { timeout: 10000 }).catch(() => undefined);
  await settle(page);
  const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
  expect(nav?.itemName === 'Knife' && nav?.stepId === 'S9-01', 'auto queue: the arrow leads to the bank for a Knife by itself');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string; detourId: string }[] });
  expect(saved.stack?.length === 1 && saved.stack[0].detourId === 'bank', 'auto queue: the trip started by itself and was remembered');
  expect((await text(page, '.prep-route')).includes('Preparation underway'), 'auto queue: the preparation block says "Preparation underway"');
  const navCount = (await posts()).filter((p) => p.path === '/nav-target').length;
  await settle(page);
  expect((await posts()).filter((p) => p.path === '/nav-target').length === navCount, 'auto queue: the arrow is not jerked in circles');
  await page.reload();
  await settle(page);
  expect((await text(page, '.prep-route')).includes('Preparation underway'), 'auto queue: after a reload the trip is still going');
  expect(!errors.length, `auto queue: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// "One trip": the bank is open, the items of the step and the nearest ones are missing — what to take now, meanwhile and later; the unknown — separately.
async function oneTrip(browser: Browser) {
  const width = 1100;
  const route = JSON.parse(readFileSync(new URL('../../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; amount: string | number; inStep?: boolean }[] }[];
  const at = route.findIndex((x) => x.id === 'S2-10');
  const names = route.slice(at, at + 4).flatMap((x) => (x.itemsRequired ?? []).filter((i) => !i.inStep).map((i) => i.nameEn));
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-10'),
    status: { protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 100, bankCoins: 0, equipment: [], inventory: [] },
    events: [{ type: 'OWNED', bankSeen: true, items: [...new Set(names)].map((n) => ({ name: n, carried: 0, noted: 0, bank: 0 })) }],
  }, '#/step/S2-10');
  // The preparation of the next steps lives in the Preparation view of the workspace.
  await waitFor(page, '.one-trip', 5000);
  const trip = await text(page, '.one-trip');
  expect(trip.includes('What you need') && trip.includes('Needed now') && trip.includes('Open the shopping list'), 'what you need: the "Needed now" list and a link to shopping');
  expect(/ready \d+%/.test(trip) && trip.includes('critical'), 'what you need: the readiness in percent and the number of critical ones');
  expect(trip.includes('missing') && /Buy|Take|Obtain|Earn/.test(trip), 'what you need: for each thing — what to do with it');
  if (process.env.UI_SHOTS) await page.locator('.one-trip').screenshot({ path: `${process.env.UI_SHOTS}/prep-plan-${width}.png` }).catch(() => {});
  if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/step-prep-${width}.png` }).catch(() => {});
  expect(await noOverflow(page), 'one trip: no horizontal scrolling');
  expect(!errors.length, `one trip: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// The quest is handed in — the "Departure check" does not demand items that are no longer there.
async function departureCheck(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-10'),
    status: { protocol: 5, questsDone: ['Prince Ali Rescue'], pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 0, equipment: [], inventory: [] },
  }, '#/step/S2-10');
  await settle(page);
  const t = await text(page, '.preflight-verdict');
  expect(t.includes('The step is done') && !/Not ready|missing/i.test(t), `a handed-in quest: the departure check does not complain about an empty bag (${t.slice(0, 80)})`);
  expect(!errors.length, `a handed-in quest: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

async function inventoryCleanup(browser: Browser) {
  // Inventory cleanup: the bag is checked against the open steps, "Always keep" moves a line to the kept list and survives a reload.
  for (const width of [1440]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S2-10', { gameMode: 'f2p' }),
      status: {
        protocol: 6, inGame: true, player: 'Cleanup Test', questPoints: 4, totalLevel: 41, coins: 100, bankCoins: 0,
        equipment: [], inventory: [{ id: 1759, name: 'Ball of wool', count: 23 }, { id: 1760, name: 'Ball of wool', count: 7, noted: true }, { id: 315, name: 'Shrimps', count: 4 }, { id: 995, name: 'Coins', count: 100 }],
      },
    }, '#/shopping');
    await settle(page);
    // Cleanup is folded away on the shopping page and mounted when opened.
    await page.locator('.shop-cleanup > summary').click();
    await settle(page);
    const card = await text(page, '.cleanup-card');
    expect(/Inventory cleanup/.test(card) && /Ball of wool/.test(card), `inventory cleanup (${width} px): the section lists the bag`);
    expect(/Keep 3 for Prince Ali Rescue/.test(card), `inventory cleanup (${width} px): the quantity kept for the route is named`);
    expect(!/Shrimps ×4[^]*Sell/.test(card.split('Staying in the bag')[0] ?? ''), `inventory cleanup (${width} px): food is never offered for sale`);
    expect(/sells, drops and destroys nothing/.test(card), `inventory cleanup (${width} px): it says it is advice only`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(!overflow, `inventory cleanup (${width} px): no horizontal scroll`);
    if (process.env.UI_SHOTS) await page.locator('.cleanup-card').screenshot({ path: `${process.env.UI_SHOTS}/cleanup-${width}.png` }).catch(() => {});
    // The same advice goes to the game in the snapshot: the surplus wool with its ids, for this character; food and coins never.
    const lastCleanup = async () => {
      const posts = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
      const snaps = posts.filter((p) => p.path === '/prep-plan');
      return snaps.length ? (snaps[snaps.length - 1].body.cleanup ?? null) : undefined;
    };
    const sentHint = await lastCleanup();
    expect(sentHint?.player === 'Cleanup Test' && sentHint.lines.some((l: any) => l.id === 1760 && l.qty === 7 && l.noted)
      && !sentHint.lines.some((l: any) => l.id === 315 || l.id === 995), `inventory cleanup (${width} px): the game gets the same lines in the snapshot`);
    await page.getByRole('button', { name: 'Always keep' }).first().click();
    await settle(page);
    expect((await lastCleanup()) === null, `inventory cleanup (${width} px): "Always keep" takes the lines out of the game too`);
    expect(/You marked it/.test(await page.evaluate(() => document.querySelector('.cleanup-keeps')?.textContent ?? '')) && /Stop always keeping/.test(await page.evaluate(() => document.querySelector('.cleanup-keeps')?.textContent ?? '')), `inventory cleanup (${width} px): Always keep moves the line to the kept list`);
    expect(errors.length === 0, `inventory cleanup (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

export const scenarios = {
  'stock': stockScenarios,
  'cleanup': cleanupScenarios,
  'market-preparation': marketPreparationScenarios,
  'tool-proof': toolProofScenarios,
  'armour': armourPreparationScenarios,
  'ranged-preparation': rangedPreparationScenarios,
  'peaceful-preparation': nonCombatPreparationScenarios,
  'magic-preparation': magicPreparationScenarios,
  'auto-queue': autoQueue,
  'one-trip': oneTrip,
  'departure-check': departureCheck,
  'inventory-cleanup': inventoryCleanup,
};
