// The step workspace: scenarios of the browser suite (npm run test:ui -- --only step).
import { readFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright';
import { BASE, steps, progressBefore, open, settle, expect, noOverflow, reveal, waitFor, stepButton, text } from '../harness.ts';

async function canonicalPlanScenario(browser: Browser, width = 1000) {
    // A catalogue-backed skill uses its canonical plan and priorities, never the old competing roadmap.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S4-03', { gameMode: 'f2p' }),
        status: { stats: { woodcutting: 21, attack: 40 } },
        events: [{ type: 'STATS', stats: { woodcutting: 21, attack: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Bronze axe', carried: 1, noted: 0, bank: 0 }, { name: 'Coins', carried: 10000, noted: 0, bank: 0 }] }],
      }, '#/skills/WC/woodcutting');
      await page.getByRole('group', { name: 'Training priority' }).waitFor();
      expect(await page.getByRole('tab', { name: 'Train', exact: true }).getAttribute('aria-selected') === 'true', 'skill plan: opens on the compact recommendation');
      await page.getByRole('group', { name: 'Training priority' }).getByRole('button', { name: 'XP', exact: true }).click();
      expect(await page.getByRole('button', { name: 'XP', exact: true }).getAttribute('aria-pressed') === 'true', 'skill plan: the canonical priority remains editable');
      await page.getByRole('tab', { name: 'Plan', exact: true }).click();
      expect(await page.locator('.skill-guide-roadmap').count() === 0 && await page.locator('.training').count() === 1, 'skill plan: one canonical plan, no static duplicate');
      await page.getByRole('tab', { name: 'Train', exact: true }).click();
      await page.getByRole('button', { name: 'Follow training plan', exact: true }).click();
      await waitFor(page, '.tracked-skill', 5000);
      const tracked = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:skill-track') ?? 'null') as { skill?: string; target?: number } | null);
      expect(tracked?.skill === 'woodcutting' && tracked.target === 36, 'skill plan: followed skill and actual checkpoint are preserved');
      await page.getByRole('button', { name: /Back to the quest route/ }).click();
      expect(await page.locator('.tracked-skill').count() === 0, 'skill plan: stopping returns to the quest route');
      expect(await noOverflow(page) && !errors.length, 'skill plan: no overflow or runtime errors');
      await page.context().close();
    }

}

async function workspaceScenarios(browser: Browser) {
  const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps ?? {});
  for (const width of [1000, 1440]) {
    const { page, errors } = await open(browser, width, { progress: progressBefore('S4-03') }, '#/journal');
    const before = JSON.stringify(await saved(page));
    const quest = page.locator('.quest-select').nth(1);
    const title = (await quest.locator('.quest-title').innerText()).trim();
    await quest.click();
    expect((await page.getByRole('region', { name: 'Selected quest' }).innerText()).includes(title), 'workspace: selecting a quest changes the right page');
    expect(await page.getByRole('link', { name: 'Review route' }).count() === 1, 'workspace: completed quest offers review');
    expect(await page.locator('.journal-session:not([open])').count() === 1, 'workspace: session statistics do not occupy the default quest page');
    await page.locator('.journal-session > summary').click();
    expect(await page.getByRole('heading', { name: /This session/i }).isVisible(), 'workspace: session statistics remain available');
    expect(JSON.stringify(await saved(page)) === before, 'workspace: browsing quest details does not change progress');
    await page.getByRole('group', { name: 'Quest filter' }).getByRole('button', { name: /^Blocked/ }).click();
    if (await page.locator('.quest-select').count() === 0) expect((await page.locator('.la-r').innerText()).includes('Select a quest'), 'workspace: empty filter shows an honest prompt');
    await page.screenshot({ path: `audit-temp/workspace-journal-${width}.png` });
    expect(await noOverflow(page) && !errors.length, 'workspace: journal has no overflow or browser errors');
    await page.goto(`${BASE}#/skills`);
    expect(await page.locator('.skills-detail table').count() === 0, 'workspace: unselected Skills does not show a raw XP table');
    expect(await page.locator('.skills-index .skill-card-link').evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth + 1)), 'workspace: skill names fit the index');
    await page.screenshot({ path: `audit-temp/workspace-skills-${width}.png` });
    await page.locator('.skills-index .skill-card-link[href*="/ranged"]').click();
    await page.getByRole('tab', { name: 'Calculator', exact: true }).click();
    await page.getByText('XP table', { exact: true }).click();
    expect(await page.locator('.skills-detail table').isVisible() && await noOverflow(page), 'workspace: XP table remains available on demand in Calculator');
    await page.context().close();
  }
  const complete = Object.fromEntries(steps.map(step => [step.id, 'done']));
  const { page, errors } = await open(browser, 1440, { progress: { ...progressBefore('S1-01'), steps: complete, gameMode: 'f2p' } }, '#/journal');
  const card = page.getByRole('region', { name: 'Quest route complete' });
  await card.waitFor();
  expect(await card.getByRole('link', { name: 'Choose training' }).getAttribute('href') === '#/skills', 'workspace: finished quest route leads to existing training');
  expect(/saved progress/.test(await card.innerText()), 'workspace: saved completion is not falsely presented as verified in game');
  await page.screenshot({ path: 'audit-temp/workspace-quests-complete.png' });
  expect(!errors.length, 'workspace: completed journal has no browser errors');
  await page.context().close();
}

async function stepS308(browser: Browser) {
  for (const width of [1280]) {
    const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
      .map(([id, name, slot]) => ({ id, name, slot }));
    const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
    const gear = { equipment, inventory: [{ id: 330, name: 'Salmon', count: 40, noted: true }], coins: 500, bankCoins: 3000 };
    const { page, errors } = await open(browser, width, {
      // The route's own plan, chosen: noted Salmon is what is tested here, not which spot needs the least food (2.75: the monks need none).
      progress: progressBefore('S3-08'), localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:combat-plans:main:-': '{"S3-08":{"key":"route","at":1,"by":"player"}}' },
      status: { protocol: 6, ...gear, stats, activeStepId: 'S3-08' },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 40, bank: 0, exactCarried: 0, exactNoted: 40, exactBank: 0 }] }],
    }, '#/step/S3-08');
    await reveal(page, 'text=/Bank: unnote/i');
    await page.getByText(/Bank: unnote/i).first().waitFor({ timeout: 8000 });
    expect((await page.locator('main').innerText()).includes('Unnote at bank'), `notes (${width}): notes are an action, not ready-to-eat food`);
    expect(await page.evaluate(() => (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; unnote?: number }[] } } }[] }).__posts.some((p) => p.path === '/prep-plan' && p.body?.plan?.lines.some((l) => l.name === 'Salmon' && (l.unnote ?? 0) > 0))), `notes (${width}): the actual game snapshot carries the unnote action`);
    expect(await noOverflow(page) && !errors.length, `notes (${width}): no overflow or console errors`);
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 26, noted: 14, bank: 0, exactCarried: 26, exactNoted: 14, exactBank: 0 }] }));
    await settle(page);
    expect(!(await page.locator('main').innerText()).includes('Unnote at bank'), `notes (${width}): unnoting clears the action after the live ownership update`);
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0 }] }));
    await settle(page);
    const unreported = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { plan?: { lines: { name: string; where: string; action?: string }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines.find(l => l.name === 'Salmon');
    });
    expect(unreported?.where === 'UNKNOWN' && !/^(Buy|Withdraw) /i.test(unreported.action ?? ''), `bank quantity (${width}): an unreported bank count stays unknown in the game payload`);
    expect(await noOverflow(page) && !errors.length, `bank quantity (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function stepS901(browser: Browser) {
  const stats = { crafting: 31, woodcutting: 36, magic: 13, hitpoints: 31, attack: 40, strength: 40, defence: 33 };
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S9-01', { gameMode: 'members', levels: stats }),
    localStorage: { 'osrs-put:active-step': 'S9-01' }, status: { protocol: 6, inGame: true, player: 'Entrana Test', stats, activeStepId: 'S9-01', questInstruction: { stepId: 'S9-01', stageAt: 2, lineIndex: 0, peeking: false } },
    events: [{ type: 'STATS', stats }, { type: 'OWNED', bankSeen: true, items: [
      { name: 'Knife', carried: 1, noted: 0, bank: 0 }, { name: 'Bronze axe', carried: 0, noted: 0, bank: 1 },
      ...['Tuna', 'Trout', 'Salmon', 'Lobster'].map(name => ({ name, carried: 0, noted: 0, bank: name === 'Salmon' ? 5 : 0 })),
    ] }],
  }, '#/step/S9-01');
  await page.waitForFunction(() => (window as unknown as { __posts: { path: string; body?: { plan?: { stepId?: string } } }[] }).__posts
    .some(p => p.path === '/prep-plan' && p.body?.plan?.stepId === 'S9-01'), null, { timeout: 10000 });
  const plan = await page.evaluate(() => {
    const posts = (window as unknown as { __posts: { path: string; body?: { plan?: {
      lines: { name: string; timing: string; action?: string }[]; bankWithdrawals?: { itemName: string }[];
    } } }[] }).__posts;
    return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan;
  });
  expect(plan?.lines.find(l => l.name === 'Bronze axe')?.timing === 'IN_STEP', 'Entrana: the game snapshot keeps the dungeon axe as an acquired-during-quest item');
  expect(!plan?.bankWithdrawals?.some(l => l.itemName === 'Bronze axe'), 'Entrana: departure withdrawals do not tell the player to take the banked axe');
  expect(Boolean(plan?.bankWithdrawals?.some(l => l.itemName === 'Salmon')), 'Entrana: the confirmed entry sends the physical Salmon alternative to the game');
  await page.evaluate(() => {
    const w = window as unknown as { __status: unknown; __emit: (e: unknown) => void };
    w.__status = { questInstruction: { stepId: 'S9-01', stageAt: 2, lineIndex: 2, peeking: false } };
    w.__emit({ type: 'STATUS', inGame: true, player: 'Entrana Test' });
  });
  await page.waitForFunction(() => {
    const posts = (window as unknown as { __posts: { path: string; body?: { plan?: { stepId?: string; lines?: { name: string }[] } } }[] }).__posts;
    const plan = posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan;
    return plan?.stepId === 'S9-01' && !plan.lines?.some(l => l.name === 'Tuna');
  }, null, { timeout: 10000 });
  expect(true, 'Entrana: after entry the guide stops demanding the entry food buffer');
  expect(await noOverflow(page) && !errors.length, 'Entrana: no overflow or console errors');
  await page.context().close();
}

async function stepS802(browser: Browser) {
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S8-02'),
    status: { protocol: 6, questsDone: [], questPoints: 60 },
    events: [{ type: 'QUESTS', done: [] }],
  }, '#/step/S8-02');
  expect((await page.locator('.step-blocked').allInnerTexts()).some(t => t.includes('S8-01')), 'prerequisites: live unfinished quest overrides an old route done mark');
  await reveal(page, '.requires .step-ref[href="#/step/S8-01"]');
  expect(await page.locator('.requires .step-ref.is-met[href="#/step/S8-01"]').count() === 0, 'prerequisites: a contradicted done mark is not shown as met');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'QUESTS', done: ['Priest in Peril', 'The Restless Ghost'] }));
  await settle(page);
  expect(await page.locator('.step-blocked').count() === 0, 'prerequisites: live completion clears the hard blocker without changing route marks');
  await reveal(page, '.requires .step-ref[href="#/step/S8-01"]');
  expect(await page.locator('.requires .step-ref.is-met[href="#/step/S8-01"]').count() === 1, 'prerequisites: the dependency label follows the same live proof as its blocker');
  await page.keyboard.press('Escape');
  expect(await noOverflow(page) && !errors.length, 'prerequisites: no overflow or page errors');
  await page.context().close();
}

async function stepS705(browser: Browser) {
  for (const width of [1280]) {
    const progress = progressBefore('S7-05', { gameMode: 'members', levels: { agility: 24 } });
    progress.steps['S7-04'] = 'skipped';
    const { page, errors } = await open(browser, width, {
      progress, status: { protocol: 6, stats: { agility: 24 } }, events: [{ type: 'STATS', stats: { agility: 24 } }],
    }, '#/step/S7-05');
    await page.getByRole('tab', { name: 'Preparation', exact: true }).click(); // the readiness verdict is on the Preparation ribbon
    expect((await page.locator('main').innerText()).includes('First S7-04'), `skill dependency (${width}): skipping below the goal does not unlock the quest`);
    await reveal(page, '.requires .step-ref[href="#/step/S7-04"]');
    expect(await page.locator('.requires .step-ref.is-met[href="#/step/S7-04"]').count() === 0, `skill dependency (${width}): a skipped training step is not labelled met`);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'STATS', stats: { agility: 25 } }));
    await settle(page);
    expect(!(await page.locator('main').innerText()).includes('First S7-04'), `skill dependency (${width}): reaching the actual level removes the redundant training blocker`);
    await reveal(page, '.requires .step-ref[href="#/step/S7-04"]');
    expect(await page.locator('.requires .step-ref.is-met[href="#/step/S7-04"]').count() === 1, `skill dependency (${width}): reached levels satisfy the displayed dependency without rewriting the skip`);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps?.['S7-04']) === 'skipped', `skill dependency (${width}): the original skip mark is preserved`);
    expect(await noOverflow(page) && !errors.length, `skill dependency (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function questPhase(browser: Browser) {
  const id = 'S7-01';
  const gear = { equipment: [], inventory: [{ id: 294, name: "Glarial's pebble", count: 1 }], coins: 1000, bankCoins: 0 };
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore(id), localStorage: { 'osrs-put:active-step': id },
    status: { protocol: 6, inGame: true, activeStepId: id, player: 'Phase Test', ...gear, questInstruction: { stepId: id, stageAt: 3, lineIndex: 4, peeking: false } },
    events: [{ type: 'GEAR', ...gear }, { type: 'OWNED', bankSeen: true, items: ['Rope', 'Air rune', 'Earth rune', 'Water rune', "Glarial's pebble"].map(name => ({ name, carried: name.includes('pebble') ? 1 : 0, noted: 0, bank: 0 })) }],
  }, '#/step/S7-01');
  await page.getByRole('tab', { name: 'Preparation', exact: true }).click();
  expect((await text(page, '.loadout.is-current')).includes("Glarial's Tomb"), 'phase: confirmed tomb cursor selects the tomb inventory');
  const timing = () => page.evaluate(() => {
    const posts = (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan');
    const plan = posts.at(-1)?.body?.plan;
    return plan?.lines?.find((l: { name: string }) => l.name === 'Air rune')?.timing ?? (plan?.later?.some((l: string) => l.includes('Air rune')) ? 'LATER' : undefined);
  });
  await settle(page);
  expect(await timing() === 'LATER', 'phase: rune supplies are sent to the game as later, not required inside the tomb');
  const move = async (peeking: boolean) => {
    await page.evaluate(({ id, peeking }) => {
      const w = window as unknown as { __status: unknown; __emit: (e: unknown) => void };
      w.__status = { questInstruction: { stepId: id, stageAt: 3, lineIndex: 7, peeking } };
      w.__emit({ type: 'STATUS', inGame: true, player: 'Phase Test' });
    }, { id, peeking });
    await settle(page);
  };
  await move(true);
  expect((await text(page, '.loadout.is-current')).includes("Glarial's Tomb") && await timing() === 'LATER', 'phase: manually viewing the future dungeon does not change current preparation');
  await move(false);
  expect((await text(page, '.loadout.is-current')).includes('Waterfall dungeon') && await timing() === 'NOW', 'phase: a confirmed within-stage transition makes the rune supply current in the app and game payload');
  await page.evaluate(() => {
    const w = window as unknown as { __status: unknown; __emit: (e: unknown) => void };
    w.__status = { questInstruction: null };
    w.__emit({ type: 'STATUS', inGame: true, player: 'Phase Test' });
  });
  await settle(page);
  expect(await page.locator('.loadout.is-current').count() === 0, 'phase: an authoritative cleared cursor removes the confirmed phase badge');
  expect(await noOverflow(page) && !errors.length, 'phase: no overflow or console errors');
  await page.context().close();
}

// Step readiness: a level is missing — the action "catch up"; an item is in the bank — "to the bank". The auto preparation is off —
// the trip starts with a button (the auto queue is checked below).
async function stepReadiness(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S9-01'),
    status: { stats: { crafting: 28, woodcutting: 40 } },
    events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
    localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
  }, '#/step/S9-01');
  const t = await text(page, '.readiness');
  expect(t.includes('A short preparation is needed') && t.includes('Catch up Crafting'), 'readiness: Crafting 31 is missing — "⚡ Catch up Crafting"');
  expect(t.includes('To the bank'), 'readiness: Knife is in the bank — "🧭 To the bank"');
  // The preparation route: one main thing, the start button, the return to the step; the trip survives a page reload.
  const prep = await text(page, '.prep-route');
  expect(prep.includes('Preparing for S9-01') && prep.includes('Start the preparation') && prep.includes('then we return to S9-01'), 'preparation: the main thing, the button and the return to the step');
  await (await stepButton(page, /Start the preparation/)).click();
  await settle(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string }[] });
  expect(saved.stack?.length === 1 && saved.stack[0].sourceStepId === 'S9-01', 'preparation: the trip was remembered in the storage');
  await page.reload();
  await settle(page);
  expect((await text(page, '.prep-route')).includes('Preparation underway'), 'preparation: after a reload the trip is still going');
  expect(await noOverflow(page), 'step: no horizontal scrolling');
  expect(!errors.length, `step: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// "Zen": instead of a stack of plaques — one status line; the details on a button, as tabs; ready — "Start the step".
async function zenStatus(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {

    progress: progressBefore('S9-01'),
    status: { stats: { crafting: 28, woodcutting: 40 } },
    events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
    localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
  }, '#/step/S9-01');
  await waitFor(page, '.step-status', 8000);
  const line = await text(page, '.status-line');
  expect(/Preparation required \(\d/.test(line) && line.includes('Fix'), `Zen: one status line with the preparation and the Fix button (${line.replace(/\s+/g, ' ').slice(0, 90)})`);
  expect((await text(page, '.readiness')).length > 0, 'Zen: Preparation exposes the readiness panel');
  await page.keyboard.press('Escape');
  expect((await text(page, '.manual-complete')).includes('Done'),'Zen: Done is one clear action under the current instruction');
  expect(await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab').count() === 5, 'Zen: the step views are five ribbons: Steps, Preparation, Route & game, Details, Wiki');
  await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Preparation/i }).click();
  await settle(page);
  const open1 = await text(page, '.readiness');
  expect(open1.includes('Catch up Crafting') && open1.includes('To the bank'), 'Zen: the Preparation view holds the whole preparation panel');
  expect(await noOverflow(page), 'Zen: no horizontal scrolling');
  expect(!errors.length, `Zen: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

async function stepS104(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {

    progress: progressBefore('S1-04'),
    status: { stats: {} },
  }, '#/step/S1-04');
  await waitFor(page, '.step-status', 8000);
  const line = await text(page, '.status-line');
  expect(line.includes('Ready to set off') && !line.includes('Fix') && await page.getByRole('button', { name: /Show in game/ }).count() > 0, `Zen: ready — "Ready to set off" and the step has its own "Show in game" (${line.replace(/s+/g, ' ').slice(0, 80)})`);
  expect(await noOverflow(page), 'Zen (ready): no horizontal scrolling');
  await page.goto(`${BASE}#/settings`);
  expect(await page.getByRole('button', { name: /^Inspector$/ }).count() === 0 && await page.getByRole('button', { name: /^Compact$/ }).count() === 0, 'Retired appearance modes do not return in Settings');
  expect(!errors.length, `Zen (ready): no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// The cockpit: the current sub-step is the hero, its items are a strip, the walkthrough is folded, and the dossier column is never an empty hint.
async function cockpit(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-10'),
    status: { protocol: 5, pluginVersion: '2.37.3', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [],
      navTarget: { label: 'Lady Keli: use soft clay on the key for a print', x: 3127, y: 3244, plane: 0, stepId: 'S2-10' } },
  }, '#/step/S2-10');
  await waitFor(page, '.sub-hero', 5000);
  const hero = await text(page, '.sub-hero');
  const action = (await text(page, '.current-action')).toLowerCase();
  expect(action.includes('navigation target') && action.includes('lady keli'), 'legacy cockpit: a navigation target is labelled as navigation, not confirmed quest progress');
  expect(hero.includes('Lead to Target in Game'), 'cockpit: the sub-step has the lead button');
  expect(hero.includes('Could I touch the key for a moment please?'), 'cockpit: the dialogue options are listed');
  expect((await text(page, '.sub-items')).includes('Soft clay'), 'cockpit: the strip holds the items of this sub-step');
  expect(await page.locator('details.step-fold:not([open])', { hasText: 'Full walkthrough and dialogue' }).count() === 1, 'cockpit: the full walkthrough is folded');
  expect(await page.locator('.one-trip').count() === 0, 'cockpit: the preparation of later steps is not on the Steps view');
  expect(await noOverflow(page), 'cockpit: no horizontal scrolling');
  expect(!errors.length, `cockpit: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// The recovery mode: died in a dungeon and respawned in Lumbridge — instead of "kill zombies" a plan "collect the things, go back".
async function recoveryMode(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    localStorage: { 'osrs-put:active-step': 'S2-07' }, progress: progressBefore('S2-07'),
    status: { activeStepId: 'S2-07', protocol: 5, pluginVersion: '2.20.0', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [] },
    events: [
      { type: 'MOVED', kind: 'DEATH', from: { x: 3049, y: 9566, plane: 0 }, to: null },
      { type: 'MOVED', kind: 'TELEPORT', from: { x: 3049, y: 9566, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } },
    ],
  }, '#/step/S2-07');
  await waitFor(page, '.prep-recovery', 5000);
  const t = await text(page, '.prep-recovery');
  expect(t.includes('Recovery mode') && t.includes('died') && t.includes('Collect the things') && t.includes('Go back to step S2-07'), 'recovery: died — the things, the missing, the return');
  expect((await text(page, '.step-status')).includes('recovery mode'), 'recovery: the step status speaks of the mode');
  expect(await noOverflow(page), 'recovery: no horizontal scrolling');
  await (await stepButton(page, 'This is not a derailment — continue')).click();
  await page.waitForFunction(() => !document.querySelector('.prep-recovery'), null, { timeout: 5000 });
  expect(!errors.length, `recovery: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// A retired saved compact preference must not hide the working Guardian guide.
async function compactPreference(browser: Browser) {
  const questData = JSON.parse(readFileSync(new URL('../../../../src/data/authored/questStages.json', import.meta.url), 'utf8')).quests['S3-04'];
  const stage = questData.stages.find((s: { do: { k?: string }[] }) => s.do.some((l) => l.k === 'defeatGuardian'));
  const lineIndex = stage.do.findIndex((l: { k?: string }) => l.k === 'defeatGuardian');
  const { page, errors } = await open(browser, 1440, {
    progress: progressBefore('S3-04'),
    localStorage: { 'osrs-put:active-step': 'S3-04', 'osrs-put:features': JSON.stringify({ compact: true }) },
    status: { protocol: 6, inGame: true, activeStepId: 'S3-04', questInstruction: { stepId: 'S3-04', stageAt: stage.at, lineIndex, peeking: false } },
  }, '#/step/S3-04');
  await waitFor(page, '.cockpit', 5000);
  expect(await page.locator('.strip').count() === 0 && await page.locator('.la-pg.la-l').isVisible(), 'legacy display preference: the normal Ledger remains available');
  expect(/guardian/i.test(await text(page, '.cockpit')), 'legacy display preference: the Guardian instructions remain available');
  await page.getByRole('tab', { name: 'Preparation', exact: true }).click();
  expect(await page.locator('.quest-supplies, .quest-preparation, .readiness').count() > 0, 'legacy display preference: preparation remains available');
  await page.getByRole('tab', { name: 'Route & game', exact: true }).click();
  expect(await page.locator('.step-map').count() === 1 && await page.locator('.ingame').count() > 0, 'legacy display preference: route and in-game controls remain available');
  expect(errors.length === 0 && await noOverflow(page), 'legacy display preference: no runtime errors or overflow');
  await page.context().close();
}

// Shield of Arrav had no stage data until 2.53 (the card never moved past Reldo). Now its overview lists the lines of both gangs.
async function shieldOfArravStages(browser: Browser) {
  const {page, errors} = await open(browser,1440,{
    progress:progressBefore('S3-05'), status:{protocol:6,inGame:true,activeStepId:'S3-05'}, localStorage:{'osrs-put:active-step':'S3-05'},
  },'#/step/S3-05');
  await waitFor(page,'.quest-walkthrough',5000);
  const overview = await page.locator('.quest-walkthrough').first().innerText();
  expect(['Reldo', 'Baraek', 'Charlie the Tramp', 'Katrine', 'Straven', 'King Roald'].every((n) => overview.includes(n)),'Shield of Arrav: the overview lists both gangs\' lines');
  expect(errors.length === 0 && await noOverflow(page),'Shield of Arrav: no runtime errors or horizontal overflow');
  await page.context().close();
}

// A step's tasks: buying the Dragon scimitar completes the step; wielding it needs Attack 60 and is tracked beside the step, not inside it.
async function dragonScimitarTasks(browser: Browser) {
  const { page, errors } = await open(browser, 1440, {
    progress: progressBefore('S9-04'), localStorage: { 'osrs-put:active-step': 'S9-04' },
    status: { protocol: 6, inGame: true, activeStepId: 'S9-04', stats: { attack: 52 }, equipment: [], inventory: [], coins: 1000, bankCoins: 0 },
  }, '#/step/S9-04');
  await settle(page);
  const tasks = await text(page, '.step-tasks');
  expect(/Attack 52 of 60/.test(tasks) && /Wield the Dragon scimitar/.test(tasks), 'step tasks: Attack 60 and wielding are tracked beside the step');
  expect(errors.length === 0, `step tasks: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'canonical-plan': (browser: Browser) => canonicalPlanScenario(browser, 1100),
  'workspace': workspaceScenarios,
  'step-s3-08': stepS308,
  'step-s9-01': stepS901,
  'step-s8-02': stepS802,
  'step-s7-05': stepS705,
  'quest-phase': questPhase,
  'step-readiness': stepReadiness,
  'zen-status': zenStatus,
  'step-s1-04': stepS104,
  'cockpit': cockpit,
  'recovery-mode': recoveryMode,
  'compact-preference': compactPreference,
  'shield-of-arrav-stages': shieldOfArravStages,
  'dragon-scimitar-tasks': dragonScimitarTasks,
};
