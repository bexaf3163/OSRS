// The Ledger frame: scenarios of the browser suite (npm run test:ui -- --only ledger).
import type { Browser, Page } from 'playwright';
import { steps, progressBefore, open, settle, expect, noOverflow } from '../harness.ts';

async function ledgerScenarios(browser: Browser) {
  console.log('Ledger frame');
  const titleOf = (id: string) => (steps as unknown as { id: string; title: string }[]).find((s) => s.id === id)!.title;
  const saved = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps ?? {}) as Record<string, string>);
  // What reached RuneLite for a step: the snapshot (protocol 6), the active step or a navigation target that names it.
  const sent = (page: Page, id: string) => page.evaluate((id) => (window as unknown as { __posts: { path: string; body?: unknown }[] }).__posts.filter((p) => p.path !== '/status' && JSON.stringify(p.body ?? '').includes(`"${id}"`)).length, id);
  const navPosts = (page: Page) => page.evaluate(() => (window as unknown as { __posts: { path: string }[] }).__posts.filter((p) => p.path === '/nav-target').length);
  const { page, errors } = await open(browser, 1440, { progress: progressBefore('S2-09'), status: { protocol: 6, inGame: true, activeStepId: null } }, '#/step/S2-09');
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

  // The road: a complete chapter unrolls and folds back; a row opens its step; "To the current step" returns.
  const rows = () => page.locator('.la-rrow').count();
  const folded = await rows();
  await page.locator('.la-seal6').first().click();
  await settle(page);
  const unrolled = await rows();
  expect(unrolled > folded && await page.locator('#rail-S1-01').count() === 1, `ledger road: Unroll shows a complete chapter's steps (${folded} -> ${unrolled})`);
  await page.locator('button.la-stagehead').first().click();
  await settle(page);
  expect(await rows() === folded && await page.locator('#rail-S1-01').count() === 0, 'ledger road: the chapter heading folds it again');
  await page.locator('#rail-S2-10').click();
  await settle(page);
  expect((await title()) === titleOf('S2-10') && await page.locator('#rail-S2-10[aria-current="step"]').count() === 1, 'ledger road: a row opens its step');
  await page.getByRole('button', { name: /to the current step/i }).click();
  await settle(page);
  expect((await title()) === titleOf('S2-09'), 'ledger road: To the current step returns to it');

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

  // The hotbar.
  const bar = page.getByRole('toolbar', { name: 'Step actions' });
  const slot = (name: RegExp) => bar.getByRole('button', { name });
  await slot(/next/i).click();
  await settle(page);
  expect((await title()) === titleOf('S2-10'), 'ledger hotbar: NEXT opens the next step');
  await slot(/previous/i).click();
  await settle(page);
  expect((await title()) === titleOf('S2-09'), 'ledger hotbar: PREVIOUS opens the step before');
  await page.keyboard.press('e');
  await settle(page);
  const afterE = await title();
  await page.keyboard.press('q');
  await settle(page);
  expect(afterE === titleOf('S2-10') && (await title()) === titleOf('S2-09'), 'ledger hotbar: E and Q move between steps');
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
  n = await sent(page, 'S2-10');
  await slot(/start the step/i).click();
  await settle(page);
  expect((await sent(page, 'S2-10')) > n, 'ledger hotbar: START THE STEP sends the step to RuneLite');
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
  await page.locator('#rail-S2-09').click();
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
};
