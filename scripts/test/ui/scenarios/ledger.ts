// The Ledger frame: scenarios of the browser suite (npm run test:ui -- --only ledger).
import type { Browser, Page } from 'playwright';
import { steps, progressBefore, questStatesBefore, open, settle, expect, noOverflow } from '../harness.ts';

async function ledgerScenarios(browser: Browser) {
  console.log('Ledger frame');
  const titleOf = (id: string) => (steps as unknown as { id: string; title: string }[]).find((s) => s.id === id)!.title;
  const saved = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps ?? {}) as Record<string, string>);
  // What reached RuneLite for a step: the snapshot (protocol 6), the active step or a navigation target that names it.
  const sent = (page: Page, id: string) => page.evaluate((id) => (window as unknown as { __posts: { path: string; body?: unknown }[] }).__posts.filter((p) => p.path !== '/status' && JSON.stringify(p.body ?? '').includes(`"${id}"`)).length, id);
  const navPosts = (page: Page) => page.evaluate(() => (window as unknown as { __posts: { path: string }[] }).__posts.filter((p) => p.path === '/nav-target').length);
  const { page, errors } = await open(browser, 1440, { progress: progressBefore('S2-09'), status: { protocol: 6, inGame: true, activeStepId: null, player: 'Fixture', questStates: questStatesBefore('S2-09') } }, '#/step/S2-09');
  await page.waitForSelector('.la-hotbar', { timeout: 5000 });
  const title = () => page.locator('#step-view-title').innerText();
  const hud = page.locator('.la-hud');

  // The spine: six sections, each opens its own page under its own name.
  const spine = page.getByRole('navigation', { name: 'Sections' });
  expect(await spine.getByRole('link').count() === 6, 'ledger spine: six sections (Lore is not in the spine)');
  for (const [label, hash, h1] of [['Skills', '#/skills', 'Skills'], ['Journal', '#/journal', 'Journal'], ['Gear', '#/gear', 'Gear'], ['Shopping', '#/shopping', 'Shopping'], ['Money', '#/money', 'Money'], ['Journey', '#/', 'Path']]) {
    const link = spine.getByRole('link', { name: new RegExp(`^${label}$`, 'i') });
    await link.click();
    await settle(page);
    const heads = (await page.locator('h1').allTextContents()).map((h) => h.trim().toLowerCase());
    expect(page.url().endsWith(hash) && heads.includes(h1.toLowerCase()) && await link.getAttribute('aria-current') === 'page', `ledger spine: ${label} opens the ${h1} page (${heads.join(' | ')})`);
  }
  await page.evaluate(() => { location.hash = '#/step/S2-09'; });
  await settle(page);

  // The HUD.
  const mode = page.getByRole('group', { name: 'Game mode' });
  await mode.getByRole('button', { name: 'FREE' }).click();
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.dataset.mode) === 'f2p' && await mode.getByRole('button', { name: 'FREE' }).getAttribute('aria-pressed') === 'true', 'ledger HUD: FREE switches to the free route');
  await mode.getByRole('button', { name: 'MEMBERS' }).click();
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.dataset.mode) === 'members', 'ledger HUD: MEMBERS switches back');
  expect(await hud.getByRole('button', { name: /^(zen|inspect)/i }).count() === 0, 'ledger HUD: no Zen or Inspect buttons');
  await hud.getByRole('button', { name: 'Search' }).click();
  await page.waitForSelector('dialog.search-dialog[open]', { timeout: 3000 });
  await page.keyboard.press('Escape');
  await settle(page);
  expect(await page.locator('dialog.search-dialog[open]').count() === 0, 'ledger HUD: Search opens the search and Escape closes it');
  await page.locator('#main').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('/');
  await settle(page);
  expect(await page.locator('dialog.search-dialog[open]').count() === 1, 'ledger HUD: "/" opens the search');
  await page.keyboard.press('Escape');
  const pin = page.getByRole('button', { name: 'Always on top' });
  await pin.click();
  const pinned = await pin.getAttribute('aria-pressed');
  await pin.click();
  expect(pinned === 'true' && await pin.getAttribute('aria-pressed') === 'false', 'ledger title strip: the pin turns always-on-top on and off');
  await hud.getByRole('link', { name: 'Settings' }).click();
  await settle(page);
  expect(page.url().endsWith('#/settings') && await page.getByRole('tablist', { name: 'Settings sections' }).count() === 1, 'ledger HUD: the slider button opens Settings');
  await hud.locator('a.la-stat').click();
  await settle(page);
  expect(page.url().endsWith('#/') && await page.locator('.cockpit').count() === 1, 'ledger HUD: the quest-point ring opens the Path');
  expect(await hud.getByRole('button', { name: /compact|full workspace/i }).count() === 0, 'ledger HUD: retired compact controls are absent');
  expect(await page.locator('.la-pg.la-l').isVisible(), 'ledger HUD: the accepted full Ledger remains visible');
  await page.evaluate(() => { location.hash = '#/step/S2-09'; });
  await settle(page);

  // The planner's order is the only list on Path (2.82.4: the old guide's walkthrough is gone): a row opens its step and
  // "To the current step" returns to the Decision's step.
  const row = (id: string) => page.locator(`.planner-row[data-step="${id}"]`);
  expect(await page.locator('.la-rrow, [id^="rail-"]').count() === 0, 'ledger path: no guide walkthrough rows');
  const ids = await page.locator('.planner-row').evaluateAll((els) => els.map((el) => el.getAttribute('data-step') ?? ''));
  const other = ids.slice(1).find((id) => id && id !== 'S2-09')!;
  await row(other).click();
  await settle(page);
  expect((await title()) === titleOf(other) && await row(other).getAttribute('aria-current') === 'step', `ledger path: a planner row opens its step (${other})`);
  const from = await title();
  await page.getByRole('button', { name: /to the current step/i }).click();
  await settle(page);
  expect((await title()) !== from && await page.getByText('CURRENT STEP', { exact: true }).count() > 0 && await page.locator('button.rail-now').isDisabled(), "ledger path: To the current step opens the Decision's step");
  await row('S2-09').click();
  await settle(page);

  // The ribbons: each one opens its own view; P, T and D too.
  for (const [name, id] of [['Preparation', 'prep'], ['Route & game', 'travel'], ['Details', 'details'], ['Steps', 'steps']]) {
    await page.getByRole('tab', { name, exact: true }).click();
    await settle(page);
    expect(await page.locator(`#step-view-${id}[aria-selected="true"]`).count() === 1 && (await page.locator('#step-view-panel').innerText()).trim().length > 20, `ledger ribbons: ${name} opens its view`);
  }
  await page.getByRole('tab', { name: 'Wiki', exact: true }).click();
  await settle(page);
  expect(await page.locator('#step-view-wiki-panel').isVisible() && await page.locator('#step-view-wiki[aria-selected="true"]').count() === 1, 'ledger ribbons: Wiki opens the dossier place');
  for (const [key, id] of [['p', 'prep'], ['t', 'travel'], ['d', 'details']]) {
    await page.keyboard.press(key);
    await settle(page);
    expect(await page.locator(`#step-view-${id}[aria-selected="true"]`).count() === 1, `ledger ribbons: ${key.toUpperCase()} opens ${id}`);
  }
  await page.getByRole('tab', { name: 'Steps', exact: true }).click();

  // The planner's live order is shown apart from the guide's walkthrough, every row with its reason (owner report 2026-11-08).
  const plannerSteps = await page.locator('.planner-order button[data-step]').evaluateAll((els) => els.map((el) => el.getAttribute('data-step') ?? ''));
  const reasons = await page.locator('.planner-order .planner-why').allInnerTexts();
  expect(plannerSteps.length > 3 && reasons.length === plannerSteps.length && reasons.every((r) => r.trim().length > 10), `ledger planner: the open quests are listed with reasons (${plannerSteps.length})`);
  expect(/^Chosen/.test(reasons[0]) && await page.getByText(/GUIDE WALKTHROUGH/).count() === 0, 'ledger planner: the first row is the choice; no guide walkthrough');
  // The Decision output names its replan condition: the evidence that ends the current action.
  const replan = await page.locator('.planner-replan').innerText();
  expect(/^The plan updates when .+, or when your levels, items, coins, quests or goal change.$/.test(replan.trim()), `ledger planner: the replan condition is shown (${replan})`);
  const nextId = plannerSteps[plannerSteps.indexOf('S2-09') + 1];
  expect(plannerSteps.includes('S2-09') && !!nextId, `ledger planner: S2-09 has a quest after it in the planner's order (${plannerSteps.join(', ')})`);

  // The hotbar: NEXT and PREVIOUS follow the planner's order between quests, never the guide's written order.
  const bar = page.getByRole('toolbar', { name: 'Step actions' });
  const slot = (name: RegExp) => bar.getByRole('button', { name });
  await slot(/next/i).click();
  await settle(page);
  expect((await title()) === titleOf(nextId), "ledger hotbar: NEXT opens the planner's next quest");
  await slot(/previous/i).click();
  await settle(page);
  expect((await title()) === titleOf('S2-09'), 'ledger hotbar: PREVIOUS opens the step before');
  await page.keyboard.press('e');
  await settle(page);
  const afterE = await title();
  await page.keyboard.press('q');
  await settle(page);
  expect(afterE === titleOf(nextId) && (await title()) === titleOf('S2-09'), 'ledger hotbar: E and Q move between steps');
  const fix = slot(/^f\s*(fix|preparation)$/i);
  const fixLabel = (await fix.innerText()).toLowerCase();
  const before = await navPosts(page);
  await fix.click();
  await settle(page);
  expect(fixLabel.includes('preparation')
    ? await page.locator('#step-view-prep[aria-selected="true"]').count() === 1
    : (await navPosts(page)) > before || await page.locator('#step-view-prep[aria-selected="true"]').count() === 1,
  `ledger hotbar: ${fixLabel.replace(/\s+/g, ' ')} does what it says (opens Preparation, or leads to what is missing)`);
  let n = await sent(page, 'S2-09');
  await slot(/show in game/i).click();
  await settle(page);
  expect((await sent(page, 'S2-09')) > n, 'ledger hotbar: SHOW IN GAME sends the step to RuneLite');
  await slot(/next/i).click();
  await settle(page);
  n = await sent(page, nextId);
  await slot(/start the step/i).click();
  await settle(page);
  expect((await sent(page, nextId)) > n, 'ledger hotbar: START THE STEP sends the step to RuneLite');
  await slot(/previous/i).click();
  await settle(page);
  await slot(/world map/i).click();
  await page.waitForSelector('dialog.map-modal[open]', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await settle(page);
  await page.getByRole('tab', { name: 'Steps', exact: true }).click();
  await page.getByRole('tab', { name: 'Route & game', exact: true }).click();
  await settle(page);
  expect(await page.locator('dialog.map-modal[open]').count() === 0, 'ledger hotbar: the world map does not reopen by itself on the next visit');
  await page.keyboard.press('m');
  await page.waitForSelector('dialog.map-modal[open]', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await settle(page);
  expect(await page.locator('dialog.map-modal[open]').count() === 0, 'ledger hotbar: WORLD MAP and M open the map every time');
  expect(await slot(/skip step/i).isDisabled() && await slot(/remove mark/i).isDisabled(), 'ledger hotbar: Skip and Remove mark wait for an optional or a marked step');
  await bar.getByRole('button', { name: /^done$/i }).click();
  await settle(page);
  expect((await saved(page))['S2-09'] === 'done' && (await title()) !== titleOf('S2-09'), 'ledger hotbar: DONE marks the step and opens the next one');
  // A done quest leaves the planner's order; its link still opens it.
  await page.evaluate(() => { location.hash = '#/journal'; });
  await settle(page);
  await page.evaluate(() => { location.hash = '#/step/S2-09'; });
  await settle(page);
  await slot(/remove mark/i).click();
  await settle(page);
  expect(!(await saved(page))['S2-09'], 'ledger hotbar: REMOVE MARK takes the mark back');
  await page.evaluate(() => { location.hash = '#/step/S3-05'; });
  await settle(page);
  await slot(/skip step/i).click();
  await settle(page);
  expect((await saved(page))['S3-05'] === 'skipped', 'ledger hotbar: SKIP STEP skips an optional step');
  await page.keyboard.press('u');
  await settle(page);
  expect(!(await saved(page))['S3-05'], 'ledger hotbar: U removes the skip');

  // The other pages' own menus.
  await page.evaluate(() => { location.hash = '#/journal'; });
  await settle(page);
  expect((await page.getByRole('region', { name: 'Selected quest' }).innerText()).length > 20 && await page.locator('.journal-session > summary').count() === 1, 'ledger Journal: session remains alongside the quest list');
  expect(await page.getByRole('link', { name: /^stage goals$/i }).count() === 0 && await page.locator('.goals-table').count() === 0, 'ledger Journal: retired stage matrix is absent');
  // The Journal lists quests in the planner's live rank, not the guide's order, and says why the selected one is placed there.
  const ranks = (await page.locator('.quest-list .quest-plan').allInnerTexts()).map((t) => Number(t.replace(/\D+/g, '')));
  expect(ranks.length > 3 && ranks.every((r, i) => i === 0 || r > ranks[i - 1]) && ranks[0] === 1, `ledger Journal: quests follow the planner's rank (${ranks.join(', ')})`);
  expect(/Planner #\d+: /.test(await page.getByRole('region', { name: 'Selected quest' }).innerText()), "ledger Journal: the selected quest shows the planner's reason");
  await page.evaluate(() => { location.hash = '#/reference'; });
  await settle(page);
  const second = page.locator('.reference-index .nav-list a').nth(1);
  const topic = (await second.innerText()).trim();
  await second.click();
  await settle(page);
  expect((await page.locator('.reference-article h1').innerText()).trim() === topic, `ledger Reference: an index link opens its article (${topic})`);
  await page.evaluate(() => { location.hash = '#/settings'; });
  await settle(page);
  for (const tab of ['RuneLite', 'Training', 'Progress and copies', 'App']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await settle(page);
    expect(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected') === 'true' && (await page.locator('.settings-content').innerText()).length > 20, `ledger Settings: ${tab} opens its section`);
  }
  await page.evaluate(() => { location.hash = '#/skills'; });
  await settle(page);
  await page.locator('.skills-index .skill-card-link[href*="/defence"]').click();
  await settle(page);
  expect(page.url().includes('/defence') && (await page.locator('.skills-detail h1').innerText()).includes('Defence'), 'ledger Skills: a tile opens its skill on the right page');
  await page.evaluate(() => { location.hash = '#/shopping'; });
  await settle(page);
  const scopes = page.getByRole('group', { name: 'What to prepare for' }).getByRole('button');
  for (let i = 0; i < await scopes.count(); i++) {
    await scopes.nth(i).click();
    await settle(page);
    expect(await scopes.nth(i).getAttribute('aria-pressed') === 'true', `ledger Shopping: scope ${i + 1} is selectable`);
  }
  expect(await noOverflow(page) && !errors.length, `ledger: no overflow or console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'ledger': ledgerScenarios,
  'combat-strategy': combatStrategy,
  'f2p-next': f2pNext,
  'f2p-next-optional': f2pNextOptional,
};

async function combatStrategy(browser: Browser) {
  const stats = { attack: 40, strength: 40, defence: 40, hitpoints: 40, ranged: 1, magic: 20, prayer: 1 };
  const gear = { equipment: [{ id: 1329, name: 'Mithril scimitar', slot: 'weapon', count: 1 }], inventory: [{ id: 333, name: 'Trout', count: 26 }], coins: 5000, bankCoins: 0 };
  const observation = questStatesBefore('S2-11');
  observation.states = Object.fromEntries(Object.keys(observation.states).map(id => [id, id === 'Ernest the Chicken' ? 'NOT_STARTED' : 'COMPLETED']));
  const { page, errors } = await open(browser, 1440, {
    progress: progressBefore('S2-11'), market: true,
    localStorage: { 'osrs-put:active-step': 'S2-11', 'osrs-put:planning-intent': JSON.stringify({ version: 1, intent: { kind: 'quest', questId: 'Ernest the Chicken' } }) },
    status: { protocol: 6, player: 'Fixture', inGame: true, activeStepId: 'S2-11', questStates: observation, stats, ...gear },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true,
      items: [{ name: 'Mithril scimitar', carried: 1, bank: 0, noted: 0 }, { name: 'Trout', carried: 26, bank: 0, noted: 0 }] }],
  }, '#/path');
  await settle(page);
  const chosen = await page.evaluate(() => {
    const posts = (window as unknown as { __posts: { path: string; body?: { decision?: { title?: string } } }[] }).__posts;
    return posts.filter(p => p.path === '/prep-plan').map(p => p.body?.decision?.title).filter(Boolean).pop() ?? '';
  });
  expect(chosen === 'Ernest the Chicken', `combat strategy: an adequately equipped and supplied player continues the quest (${chosen})`);
  const pathText = await page.getByRole('region', { name: 'Combat strategy' }).innerText();
  expect(pathText.includes(chosen), 'combat strategy: Ledger shows the same current action as the bridge');
  await page.evaluate(() => { location.hash = '#/gear'; });
  await settle(page);
  expect((await page.locator('.gear-page').innerText()).includes(chosen), 'combat strategy: Gear shows the committed preparation instead of an independent purchase');
  await page.evaluate(() => { location.hash = '#/shopping'; });
  await settle(page);
  const shopping = await page.locator('body').innerText();
  expect(!/Get Mithril scimitar|Attack to 30|Train attack/.test(shopping), 'combat strategy: Shopping does not require a replacement weapon or an unnecessary training detour');
  expect(!errors.length && await noOverflow(page), 'combat strategy: no console errors or horizontal overflow');
  await page.context().close();
}

// Every F2P quest done (2.86.1): Path offers the F2P checkpoints ranked by the training engine, and Follow starts the ordinary training plan.
async function f2pNext(browser: Browser) {
  const stats = { attack: 40, strength: 44, defence: 44, hitpoints: 43, ranged: 40, prayer: 8, magic: 25, woodcutting: 31, firemaking: 30, fishing: 32,
    cooking: 30, mining: 18, smithing: 29, crafting: 9, runecraft: 1 };
  const gear = { equipment: [], inventory: [{ id: 1353, name: 'Steel axe', count: 1 }], coins: 30000, bankCoins: 0 };
  const { page, errors } = await open(browser, 1440, { market: true, progress: { ...progressBefore('S1-01'), gameMode: 'f2p' },
    status: { protocol: 6, inGame: true, player: 'Fixture', ...gear, stats, questStates: questStatesBefore('S7-01') },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Steel axe', carried: 1, noted: 0, bank: 0 }] }] }, '#/path');
  await settle(page);
  const next = await page.getByRole('region', { name: 'Next action' }).innerText();
  expect(/Next in F2P/.test(next) && !/Waiting for the planner/.test(next), 'F2P complete: Path offers what to do next instead of waiting');
  const rows = await page.locator('ol li', { hasText: '→' }).allInnerTexts();
  expect(rows.length > 2 && rows[0].startsWith('★') && rows.every(r => /Follow/.test(r)), `F2P complete: ranked checkpoints, good value first, each can be followed (${rows[0]})`);
  await page.getByRole('button', { name: 'Follow' }).first().click();
  await settle(page);
  expect(await page.getByRole('region', { name: 'Training plan' }).count() === 1, 'F2P complete: Follow opens the ordinary training plan');
  expect(!errors.length && await noOverflow(page), 'F2P complete: no console errors or horizontal overflow');
  await page.context().close();
}

// Every quest but Shield of Arrav done, and it is started (a partner from the other gang is needed). Its stage check points the game at
// its step, where the plugin reads the stage; once the player skips the step, the check no longer hides the F2P checkpoints.
async function f2pNextOptional(browser: Browser) {
  const stats = { attack: 40, strength: 44, defence: 44, hitpoints: 43, ranged: 40, prayer: 8, magic: 25, woodcutting: 31, firemaking: 30, fishing: 32,
    cooking: 30, mining: 18, smithing: 29, crafting: 9, runecraft: 1 };
  const gear = { equipment: [], inventory: [], coins: 30000, bankCoins: 0 };
  const states = questStatesBefore('S7-01');
  const at = async (mark: 'open' | 'skipped') => {
    const progress = progressBefore('S7-01', { gameMode: 'f2p' }), marks = progress.steps as Record<string, string>;
    if (mark === 'open') delete marks['S3-05']; else marks['S3-05'] = 'skipped';
    return open(browser, 1440, { market: true, progress,
      status: { protocol: 6, inGame: true, player: 'Fixture', ...gear, stats, questStates: { ...states, states: { ...states.states, 'Shield of Arrav': 'IN_PROGRESS' } } },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [] }] }, '#/path');
  };
  let { page, errors } = await at('open');
  await settle(page);
  const pointed = await page.evaluate(() => (window as unknown as { __posts: { path: string; body?: unknown }[] }).__posts
    .filter(p => p.path === '/prep-plan').map(p => (p.body as { step?: { stepId?: string } | null })?.step?.stepId ?? '-'));
  expect(pointed.includes('S3-05'), `optional quest open: the stage check points the game at Shield of Arrav's step, where the plugin reads it (${pointed.join(', ')})`);
  expect(!errors.length && await noOverflow(page), 'optional quest open: no console errors or horizontal overflow');
  await page.context().close();
  ({ page, errors } = await at('skipped'));
  await settle(page);
  const next = await page.getByRole('region', { name: 'Next action' }).innerText();
  expect(/Next in F2P/.test(next) && /SHIELD OF ARRAV OPTIONAL/i.test(next), `optional quest skipped: Path offers the F2P checkpoints and names the optional quest (${next.slice(0, 80)})`);
  expect(await page.locator('ol li', { hasText: '→' }).count() > 2, 'optional quest skipped: the ranked checkpoints are listed');
  expect(!errors.length && await noOverflow(page), 'optional quest skipped: no console errors or horizontal overflow');
  await page.context().close();
}
