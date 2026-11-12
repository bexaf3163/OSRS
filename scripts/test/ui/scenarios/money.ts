// Money and funding: scenarios of the browser suite (npm run test:ui -- --only money).
import { readFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright';
import { type Mock, progressBefore, open, settle, expect, noOverflow, reveal, text } from '../harness.ts';

// Raising coins for training: a character with no coins and an empty bank is short of food. The card says so in one line with one button;
// Start sets an arrow and a status line, Cancel takes both away and the route step is untouched.
async function fundingScenarios(browser: Browser) {
  console.log('funding');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [], coins: 0, bankCoins: 0 };
  // The plugin reports every item the route asks about, zero included; what is worn counts as carried.
  const all = JSON.parse(readFileSync(new URL('../../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; anyOf?: string[] }[] }[];
  const from = all.findIndex((x) => x.id === 'S2-10');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])))];
  const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, bank: 0 }));
  for (const width of [1440]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S2-10', { gameMode: 'f2p' }),
      status: {
        protocol: 6, inGame: true, player: 'Funding Test', activeStepId: 'S2-10', questPoints: 30, totalLevel: 150,
        stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 }, pos: { x: 3093, y: 3495, plane: 0 }, ...gear,
      },
      events: [
        { type: 'OWNED', bankSeen: true, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
        { type: 'STATS', stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 } }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
      ],
      market: true,
    }, '#/step/S2-10');
    await reveal(page, '.one-trip');
    await settle(page);
    const posts = async () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
    const card = await text(page, '.funding-card');
    expect(/gp short/.test(card), `funding (${width} px): the card names the shortage in one line`);
    expect(await page.locator('.funding-card .btn-primary').count() === 1, `funding (${width} px): one primary button`);
    expect(await page.locator('.funding-card details').count() === 1 && !(await page.locator('.funding-card details').evaluate((d) => (d as HTMLDetailsElement).open)), `funding (${width} px): the details are folded`);
    expect(!/Coins for the steps/.test(await text(page, '.one-trip')), `funding (${width} px): the coin shortage is said once`);
    expect(await noOverflow(page), `funding (${width} px): no horizontal scroll`);
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-${width}.png` }).catch(() => {});
    await page.locator('.funding-card details > summary').click();
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-open-${width}.png` }).catch(() => {});
    expect(/Your coins: 0 gp/.test(await text(page, '.funding-card')), `funding (${width} px): the details state the coins`);
    await page.locator('.funding-card .btn-primary').click();
    await settle(page);
    const nav = (await posts()).filter((p) => p.path === '/nav-target');
    expect(nav.length > 0 && String(nav[nav.length - 1].body.label).startsWith('Funding: ') && !('stepId' in nav[nav.length - 1].body), `funding (${width} px): Start sets one arrow that is not a route step`);
    expect(await page.locator('.status-funding').count() >= 1, `funding (${width} px): the plan shows as one line in the step status`);
    await settle(page);
    const lastFunding = async () => {
      const snaps = (await posts()).filter((p) => p.path === '/prep-plan');
      return snaps.length ? (snaps[snaps.length - 1].body.funding ?? null) : undefined;
    };
    const sentPlan = await lastFunding();
    expect(sentPlan?.player === 'Funding Test' && sentPlan.status === 'ACTIVE' && typeof sentPlan.action === 'string' && sentPlan.stepCount >= 2, `funding (${width} px): the game gets the same plan in the snapshot`);
    expect((await text(page, '.status-funding')).includes(String(sentPlan?.action ?? '\u0000')), `funding (${width} px): the app and the game say the same sentence`);
    expect(await page.locator('.funding-card.is-running').count() === 1, `funding (${width} px): the card shows the step in hand`);
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:funding-plan')).map(([, v]) => JSON.parse(v)));
    expect(saved.length === 1 && saved[0].sourceStepId === 'S2-10' && saved[0].character === 'Funding Test', `funding (${width} px): the plan is saved for this character`);
    if (process.env.UI_SHOTS) await page.locator('.funding-card').screenshot({ path: `${process.env.UI_SHOTS}/funding-running-${width}.png` }).catch(() => {});
    await page.locator('.funding-card.is-running').getByRole('button', { name: 'Cancel', exact: true }).click();
    await settle(page);
    expect(await page.locator('.funding-card.is-running').count() === 0 && await page.locator('.status-funding').count() === 0, `funding (${width} px): Cancel closes the plan`);
    await settle(page);
    expect((await lastFunding()) === undefined || (await lastFunding()) === null, `funding (${width} px): Cancel takes the line out of the game too`);
    const gone = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('osrs-put:funding-plan')).length);
    expect(gone === 0, `funding (${width} px): nothing is left saved`);
    const done = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!done || !done.steps || done.steps['S2-10'] === undefined, `funding (${width} px): the route step was not touched`);
    expect(errors.length === 0, `funding (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// The Money section 2.71: every earning method at any time, one recommendation, a search, a sort, filters, the details under a row; Start asks for the
// goal and makes the coin card's plan (the arrow, the step's card, the game line); another method is an explicit switch; the route step is never touched.
async function moneyScenarios(browser: Browser) {
  console.log('money');
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const all = JSON.parse(readFileSync(new URL('../../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; anyOf?: string[] }[] }[];
  const askedFor = (id: string) => { const from = all.findIndex((x) => x.id === id); return [...new Set(all.slice(from, from + 8).flatMap((x) => (x.itemsRequired ?? []).flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])])))]; };
  const worn = new Set(equipment.map((e) => e.name));
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  const hero = (o: { bankSeen?: boolean; offline?: boolean; coins?: number; step?: string } = {}): Mock => {
    const step = o.step ?? 'S5-01', asked = askedFor(step);
    const gear = { equipment, inventory: [], coins: o.coins ?? 400, bankCoins: o.bankSeen === false ? null : 0 };
    const owned = asked.map((name) => ({ name, carried: worn.has(name) ? 1 : 0, noted: 0, ...(o.bankSeen === false ? {} : { bank: 0 }) }));
    return {
      progress: progressBefore(step, { gameMode: 'f2p' }),
      localStorage: { 'osrs-put:active-step': step },
      market: true,
      ...(o.offline ? { offline: true } : {
        status: { protocol: 6, inGame: true, player: 'Money Test', activeStepId: step, questPoints: 30, totalLevel: 150, stats, pos: { x: 3093, y: 3495, plane: 0 }, ...gear },
        events: [
          { type: 'OWNED', bankSeen: o.bankSeen !== false, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
          { type: 'STATS', stats }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
        ],
      }),
    };
  };
  type Post = { path: string; body: any };
  const shot = async (page: Page, name: string) => {
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/money-${name}.png`, fullPage: true }).catch(() => {});
  };
  const gpOf = (t: string) => { const m = /^([\d.]+)(k?)/.exec(t.trim()); return m ? Number(m[1]) * (m[2] ? 1000 : 1) : -Infinity; };

  for (const width of [1440]) {
    const { page, errors } = await open(browser, width, hero(), '#/money');
    await settle(page);
    const posts = async () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
    const lastFunding = async () => {
      const snaps = (await posts()).filter((p) => p.path === '/prep-plan');
      return snaps.length ? (snaps[snaps.length - 1].body.funding ?? null) : undefined;
    };
    const savedPlans = async () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('osrs-put:funding-plan')).map(([, v]) => JSON.parse(v)));
    const navBefore = (await posts()).filter((p) => p.path === '/nav-target').length;

    // Without a goal: one recommendation, a compact list, nothing started.
    expect(await page.getByRole('heading', { name: 'Money' }).count() === 1, `money (${width} px): the section opens from its own page`);
    expect(await page.locator('a[href="#/money"]').count() >= 1, `money (${width} px): it is in the navigation`);
    const best = (await page.locator('.money-reco-head strong').innerText()).trim();
    expect(best.length > 0 && await page.locator('.money-reco .btn-primary').count() === 1, `money (${width} px): one recommendation with one primary button (${best})`);
    expect(/Ranked by the time to make [\d,]+ more coins/.test(await page.locator('.money-context').innerText()), `money (${width} px): an already funded step does not invent a shortfall`);
    const rows = page.locator('.money-row');
    expect(await rows.count() >= 3 && await rows.count() <= 6, `money (${width} px): a compact list, ${await rows.count()} rows before "Show more"`);
    expect(await page.locator('.money-row .money-details').count() === 0, `money (${width} px): the details are folded`);
    const facts = await page.locator('.money-row-facts').allInnerTexts();
    expect(facts.every((t) => /gp\/h net|Estimate unavailable/.test(t) && /gp to start|No coins needed/.test(t)), `money (${width} px): every row says net an hour (or "Estimate unavailable") and the coins to start`);
    expect(await noOverflow(page), `money (${width} px): no horizontal scroll`);
    await shot(page, `default-${width}`);

    // Search, sort and filters.
    await page.locator('.money-search').fill('coal');
    await settle(page);
    const found = await page.locator('.money-row-title').allInnerTexts();
    expect(found.length >= 1 && found.length < 6, `money (${width} px): the search narrows the list (${found.join(', ')})`);
    await page.locator('.money-search').fill('');
    await page.locator('.money-sort select').selectOption('profit');
    await settle(page);
    const nets = (await page.locator('.money-row-facts').allInnerTexts()).map(gpOf);
    expect(nets.every((n, i) => i === 0 || n <= nets[i - 1]), `money (${width} px): "Profit an hour" orders the rows by profit`);
    await page.locator('.money-sort select').selectOption('recommended');
    await page.locator('.money-filters-toggle').click();
    await page.getByLabel('Show locked methods').check();
    await settle(page);
    while (await page.getByRole('button', { name: /^Show \d+ more$/ }).count()) await page.getByRole('button', { name: /^Show \d+ more$/ }).click();
    expect(await page.locator('.money-row .money-badge.is-locked').count() >= 1, `money (${width} px): "Show locked methods" adds what the account cannot do, with what is missing`);
    await page.getByLabel('Show locked methods').uncheck();
    await page.locator('.money-filters-toggle').click();

    // The details under a row: what it needs and how the player meets it; reading them changes nothing.
    await rows.first().locator('.money-row-head').click();
    await settle(page);
    const details = await page.locator('.money-row .money-details').first().innerText();
    expect(/What it needs/.test(details) && /Where and how/.test(details) && await page.locator('.money-row .money-checks li').count() >= 2, `money (${width} px): the details list the requirements and the way`);
    expect(await page.locator('.money-row .money-calc').first().evaluate((d) => !(d as HTMLDetailsElement).open), `money (${width} px): sources and calculations stay folded`);
    // 2.94 (owner: the guides said a lot and explained nothing): every opened guide's steps are its own, never the bare outline alone,
    // and no guide asks you to bring what it makes.
    const guideCheck = await page.locator('.money-row .money-details').first().evaluate((el) => ({
      steps: [...el.querySelectorAll('.money-guide li')].map((li) => li.textContent ?? ''),
      bring: [...el.querySelectorAll('.money-checks li')].map((li) => li.textContent ?? '').filter((t) => t.includes('Bring:')),
      title: el.closest('.money-row')?.querySelector('.money-row-title')?.textContent ?? '',
    }));
    expect(guideCheck.steps.length >= 3 && !guideCheck.bring.some((b) => b.toLowerCase().includes(guideCheck.title.toLowerCase().replace(/^(collecting|buying|making) /, '').slice(0, 6))),
      `money (${width} px): the opened guide (${guideCheck.title}) lists its steps and never asks to bring its own product (${guideCheck.steps.slice(0, 3).join(' / ')})`);
    expect((await posts()).filter((p) => p.path === '/nav-target').length === navBefore && (await savedPlans()).length === 0, `money (${width} px): browsing sets no arrow and starts nothing`);
    await rows.first().locator('.money-row-head').click();

    // Start: the goal, then the coin card's plan everywhere.
    await page.locator('.money-reco').getByRole('button', { name: 'Start…' }).click();
    const goal = page.locator('.money-reco .money-goal');
    expect(await goal.count() === 1 && /more coins/.test(await goal.innerText()) && !/S5-01 is short/.test(await goal.innerText()), `money (${width} px): Start offers a savings goal without a fake step shortfall`);
    await goal.locator('.money-goal-option', { hasText: 'more coins' }).locator('input[type=radio]').check();
    await goal.locator('.money-amount').fill('2,000');
    await goal.getByRole('button', { name: 'Start' }).click();
    await settle(page);
    expect(await page.locator('.money-running .funding-card.is-running').count() === 1, `money (${width} px): the plan runs, shown by the coin card itself`);
    const nav = (await posts()).filter((p) => p.path === '/nav-target');
    expect(nav.length > navBefore && String(nav[nav.length - 1].body.label).startsWith('Funding: '), `money (${width} px): Start sets the plan's arrow`);
    let saved = await savedPlans();
    expect(saved.length === 1 && saved[0].goal?.kind === 'amount' && saved[0].goal.coins === 2000 && saved[0].sourceStepId === 'S5-01' && saved[0].target.required === 2400,
      `money (${width} px): the plan is saved with its goal: 2,000 more than the 400 gp at the start`);
    await settle(page);
    const sent = await lastFunding();
    expect(sent?.status === 'ACTIVE' && sent.player === 'Money Test' && (await page.locator('.money-running .funding-line').innerText()).includes(String(sent.action)),
      `money (${width} px): the game gets the same action as the app`);
    await shot(page, `running-${width}`);

    // Pause and resume.
    await page.locator('.money-running').getByRole('button', { name: 'Pause' }).click();
    await settle(page);
    expect(await page.locator('.money-running .funding-card.is-paused').count() === 1, `money (${width} px): Pause holds the plan`);
    await page.locator('.money-running').getByRole('button', { name: 'Resume' }).click();
    await settle(page);
    expect(await page.locator('.money-running .funding-card.is-paused').count() === 0, `money (${width} px): Resume carries on`);

    // The step page shows the same plan; the route step is untouched.
    await page.evaluate(() => { location.hash = '#/step/S5-01'; });
    await settle(page);
    expect(await page.locator('.status-funding').count() >= 1, `money (${width} px): the step shows the running plan in its status`);
    await page.evaluate(() => { location.hash = '#/money'; });
    await settle(page);

    // An explicit switch to another method.
    const other = page.locator('.money-row').filter({ has: page.locator('.money-badge.is-ok') }).first();
    if (await other.count()) {
      const name = (await other.locator('.money-row-title').innerText()).trim();
      await other.locator('.money-row-head').click();
      await other.getByRole('button', { name: 'Start…' }).click();
      const chooser = other.locator('.money-goal');
      expect(/This stops/.test(await chooser.innerText()) && await chooser.getByRole('button', { name: 'Switch to this method' }).count() === 1, `money (${width} px): another method says what it stops and asks to switch`);
      await chooser.locator('.money-goal-option', { hasText: 'open session' }).locator('input[type=radio]').check();
      await chooser.getByRole('button', { name: 'Switch to this method' }).click();
      await settle(page);
      saved = await savedPlans();
      expect(saved.length === 1 && saved[0].openEnded === true && saved[0].title === name, `money (${width} px): the switch replaces the plan (${name}, open session)`);
    } else {
      expect(false, `money (${width} px): a second method the player can do now, to switch to`);
    }

    // Stop: nothing left running or saved, the game line gone, the route step not touched.
    await page.locator('.money-running').getByRole('button', { name: 'Cancel' }).click();
    await settle(page);
    expect(await page.locator('.money-running').count() === 0 && (await savedPlans()).length === 0, `money (${width} px): Stop ends the plan`);
    const line = await lastFunding();
    expect(line === null || line === undefined, `money (${width} px): the game line goes too`);
    const progress = await page.evaluate(() => { const j = (window as unknown as { __saved?: string }).__saved; return j ? JSON.parse(j) : null; });
    expect(!progress || !progress.steps || progress.steps['S5-01'] === undefined, `money (${width} px): the route step was not touched`);
    expect(errors.length === 0, `money (${width} px): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // The coin card leads here.
  {
    // A real quest shortfall (Prince Ali Rescue).
    const { page, errors } = await open(browser, 1440, hero({ coins: 0, step: 'S2-10' }), '#/step/S2-10');
    await reveal(page, '.one-trip');
    await settle(page);
    const card = (await page.locator('.funding-card .funding-line').first().innerText()).trim();
    expect(await page.locator('.funding-card a.funding-browse[href="#/money"]').count() === 1, 'money: the coin card links to "Browse earning methods"');
    await page.locator('.funding-card a.funding-browse').click();
    await settle(page);
    const best = (await page.locator('.money-reco-head strong').innerText()).trim();
    expect(card === best, `money: the coin card and the Money section recommend the same method (${card} / ${best})`);
    await page.locator('.money-reco').getByRole('button', { name: 'Start…' }).click();
    expect(/Cover the [\d,]+ gp S2-10 is short/.test(await page.locator('.money-reco .money-goal').innerText()), 'money: the zero-coin account still gets its real step-shortfall goal');
    expect(errors.length === 0, `money (card link): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // The bank not read: "more coins" cannot be counted yet, an open session can start.
  {
    const { page, errors } = await open(browser, 1440, hero({ bankSeen: false }), '#/money');
    await settle(page);
    expect(/bag only/.test(await page.locator('.money-context').innerText()), 'money (bank unread): the coins are said to be the bag only');
    await page.locator('.money-reco').getByRole('button', { name: 'Start…' }).click();
    const goal = page.locator('.money-reco .money-goal');
    await goal.locator('.money-goal-option', { hasText: 'more coins' }).locator('input[type=radio]').check();
    expect(/Open your bank once/.test(await goal.innerText()) && await goal.getByRole('button', { name: 'Start' }).isDisabled(), 'money (bank unread): "more coins" waits for the bank, with the reason');
    await goal.locator('.money-goal-option', { hasText: 'open session' }).locator('input[type=radio]').check();
    expect(!(await goal.getByRole('button', { name: 'Start' }).isDisabled()), 'money (bank unread): an open session can start');
    await shot(page, 'bank-unread');
    expect(errors.length === 0, `money (bank unread): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }

  // RuneLite not connected: published figures, nothing called available.
  {
    const { page, errors } = await open(browser, 1440, hero({ offline: true }), '#/money');
    await settle(page);
    expect(/No method can be recommended yet/.test(await page.locator('.money-empty').innerText()), 'money (offline): no recommendation without the account');
    expect(await page.locator('.money-row').count() >= 3 && await page.locator('.money-badge.is-ok').count() === 0, 'money (offline): the list shows the methods, none called "Can do now"');
    expect(/Connect RuneLite/.test(await page.locator('.money-context').innerText()), 'money (offline): it says what would confirm them');
    await shot(page, 'offline');
    expect(errors.length === 0, `money (offline): no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

// New-account trade limits (2.94.3): with 10 quest points and total level 100 reached the game still cannot show the 20 hours of play. One
// button says the limits are lifted, Undo takes it back; an account below the numbers has nothing to press.
async function tradeLimitsScenario(browser: Browser) {
  const mock = (questPoints: number): Mock => ({
    progress: progressBefore('S5-01', { gameMode: 'f2p' }), market: true,
    status: { protocol: 6, inGame: true, player: 'Trade Test', questPoints, totalLevel: 150, stats: { attack: 30, strength: 21, defence: 1, hitpoints: 24 } },
  });
  {
    const { page, errors } = await open(browser, 1300, mock(30), '#/money');
    const line = page.locator('.trade-limits');
    await line.waitFor({ timeout: 5000 }).catch(() => {});
    expect((await line.count()) === 1 && (await line.innerText()).includes('20 hours of play cannot be read'), 'trade limits: with the numbers reached the line names the hours the game cannot show');
    await line.getByRole('button', { name: 'My trade limits are lifted' }).click();
    await page.locator('.trade-limits').filter({ hasText: 'you marked them lifted' }).waitFor({ timeout: 5000 }).catch(() => {});
    expect((await text(page, '.trade-limits')).includes('you marked them lifted'), 'trade limits: the button records the answer');
    await page.locator('.trade-limits').getByRole('button', { name: 'Undo' }).click();
    await page.locator('.trade-limits').getByRole('button', { name: 'My trade limits are lifted' }).waitFor({ timeout: 5000 }).catch(() => {});
    expect(await page.locator('.trade-limits').getByRole('button', { name: 'My trade limits are lifted' }).count() === 1 && !errors.length, 'trade limits: Undo brings the question back, no console errors');
    await page.context().close();
  }
  {
    const { page } = await open(browser, 1300, mock(5), '#/money');
    await settle(page);
    expect(await page.locator('.trade-limits').count() === 0, 'trade limits: a new account below 10 quest points has nothing to press');
    await page.context().close();
  }
}

export const scenarios = {
  'funding': fundingScenarios,
  'money': moneyScenarios,
  'trade-limits': tradeLimitsScenario,
};
