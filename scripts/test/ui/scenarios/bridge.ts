// The RuneLite link: scenarios of the browser suite (npm run test:ui -- --only bridge).
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { BASE, progressBefore, open, settle, expect, noOverflow, waitFor, stepButton, text } from '../harness.ts';

// The player cleared the arrow themselves — the queue is paused and does not set it any more.
async function clearedArrow(browser: Browser) {
  const width = 1100;
  const target = { label: 'Bank: take Knife', x: 3185, y: 3436, plane: 0, itemName: 'Knife', stepId: 'S9-01' };
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S9-01'),
    status: { protocol: 5, stats: { crafting: 40, woodcutting: 40 }, navTarget: target },
    events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
    // The game follows S9-01, so the prep machine runs under it whatever the Decision ranks first.
    localStorage: { 'osrs-put:active-step': 'S9-01', 'osrs-put:prep': JSON.stringify({ stack: [{ sourceStepId: 'S9-01', detourId: 'bank', reason: 'Take it from the bank', startedAt: 1, returnCondition: 'done' }], done: [] }) },
  }, '#/step/S9-01');
  await (await stepButton(page, /Return to the step now/)).click();
  await settle(page);
  expect((await text(page, '.prep-route')).includes('Continue the preparation'), 'pause: after the arrow is cleared — "Continue the preparation"');
  type Post = { path: string };
  const navs = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
  await settle(page);
  const after = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
  expect(navs === after, 'pause: it does not set the arrow any more');
  expect(!errors.length, `pause: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// 2.63.3: "Launch RuneLite" in the header while the plugin does not answer; gone once it is connected.
async function launchRunelite(browser: Browser) {
  const width = 1100;
  const off = await open(browser, width, { offline: true }, '#/');
  const btn = off.page.locator('.la-hud .launch-runelite');
  expect(await btn.count() === 1, `header (${width} px): the launch button is there while the plugin does not answer`);
  if (await btn.count()) {
    // The app's own start-up launch (auto-launch) is counted already: the click is one more.
    const launched = () => off.page.evaluate(() => (window as unknown as { __launched?: number }).__launched ?? 0);
    const before = await launched();
    await btn.click();
    await settle(off.page);
    expect(await launched() === before + 1 && await btn.isDisabled(), `header (${width} px): a click starts RuneLite once and the button waits`);
  }
  if (process.env.UI_SHOTS) await off.page.screenshot({ path: `${process.env.UI_SHOTS}/header-launch-${width}.png`, clip: { x: 0, y: 0, width, height: 90 } }).catch(() => {});
  expect(await noOverflow(off.page), `header (${width} px): launch button, no horizontal scrolling`);
  await off.page.context().close();
  const on = await open(browser, width, {}, '#/');
  expect(await on.page.locator('.la-hud .launch-runelite').count() === 0, `header (${width} px): no launch button once the plugin is connected`);
  await on.page.context().close();
}

// An old plugin without the protocol field — a request to restart RuneLite.
async function oldPlugin(browser: Browser) {
  const width = 1100;
  const { page } = await open(browser, width, {}, '#/settings');
  await page.getByRole('tab', { name: 'RuneLite' }).click();
  const t = await text(page, '.plaque-warning');
  expect(t.includes('old plugin') && t.includes('restart RuneLite'), 'settings: a plugin without a handshake — "old plugin, restart RuneLite"');
  await page.context().close();
}

// Plugin 2.10 (protocol 3) with app 2.11: the step card says it is missing and what to do; with a new one — a hint about the list.
async function pluginProtocol3(browser: Browser) {
  const width = 1100;
  const { page } = await open(browser, width, {
    localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
    status: { activeStepId: 'S2-03', protocol: 3, pluginVersion: '2.10.0' },
  }, '#/step/S2-03');
  const t = await text(page, '.ingame');
  expect(t.includes('old plugin 2.10.0') && t.includes('"What you need" list on the game screen'), 'step: plugin 2.10 — "restart RuneLite", without the list in the game');
  await page.context().close();
  const fresh = await open(browser, width, {
    localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
    status: { activeStepId: 'S2-03', protocol: 6, pluginVersion: '2.22.0' },
  }, '#/step/S2-03');
  const f = await text(fresh.page, '.ingame');
  // The static explanations ("In the game at the top left...", "The path over land is laid by Shortest Path...") were removed on purpose: a current plugin
  // gets only the status and the buttons; the old-plugin note above stays.
  expect(!f.includes('old plugin') && !f.includes('at the top left') && !f.includes('laid by Shortest Path') && /Show(n)? in the game/.test(f), 'step: plugin 2.22 — only the status and the buttons, no explanatory paragraphs');
  expect(!fresh.errors.length, `step: no console errors ${fresh.errors.join('; ')}`);
  await fresh.page.context().close();
}

// 2.63.2: the live game wins. Mid-quest "Where" starts at the game's current target; the quest points are the game's; a quest marked
// done here that the game has not finished is said in the journal.
async function liveGameWins(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    localStorage: { 'osrs-put:active-step': 'S2-10' }, progress: progressBefore('S2-10'),
    status: { protocol: 6, inGame: true, activeStepId: 'S2-10', questPoints: 3, questsDone: [], stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [],
      navTarget: { label: 'Go down to the test target', x: 3200, y: 3300, plane: 0, stepId: 'S2-10' } },
  }, '#/step/S2-10');
  await waitFor(page, '.cockpit-where-card', 5000);
  const where = await text(page, '.cockpit-where-card');
  expect(where.includes('Now: Go down to the test target'), 'live: mid-quest "Where" starts at the game\'s current target');
  await page.evaluate(() => { location.hash = '#/journal'; });
  await settle(page);
  const journal = await text(page, 'main');
  expect(journal.includes('quest points 3') && journal.includes('not finished in the game'), 'live: the journal counts the game\'s quest points and names a quest the game has not finished');
  expect(await noOverflow(page), 'live: no horizontal scrolling');
  expect(!errors.length, `live: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// Protocol 6: the step, shopping, the bank highlight, the advice and the plan go to the game in one /prep-plan snapshot — there are no separate requests.
async function protocol6(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    localStorage: { 'osrs-put:active-step': 'S2-07', 'osrs-put:shopping-plan': '{"items":[{"name":"Iron bar","count":2}]}' }, progress: progressBefore('S2-07'),
    status: { protocol: 6, pluginVersion: '2.22.0', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [] },
  }, '#/step/S2-07');
  await settle(page);
  const sent = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
  const snaps = sent.filter((p) => p.path === '/prep-plan');
  expect(snaps.length > 0, 'protocol 6: the /prep-plan snapshot was sent');
  const last = snaps[snaps.length - 1]?.body;
  expect(last?.v === 6 && last?.step?.stepId === 'S2-07', 'protocol 6: the snapshot has step S2-07');
  expect(last?.plan?.stepId === 'S2-07' && Array.isArray(last?.plan?.lines) && last.plan.lines.length > 0, 'protocol 6: the snapshot has the preparation plan with items');
  expect(last?.shopping?.items?.[0]?.name === 'Iron bar', 'protocol 6: shopping — in the same snapshot');
  expect(!sent.some((p) => ['/active-step', '/gear-hint', '/bank-tags', '/shopping-plan'].includes(p.path)), 'protocol 6: there are no five separate requests');
  expect(snaps.every((p, i) => i === 0 || p.body.seq > snaps[i - 1].body.seq), 'protocol 6: the snapshot numbers grow');
  expect(!errors.length, `protocol 6: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

async function snapshotRefusal(browser: Browser) {
  for (const snapshotReply of [{ stale: true }, { rejected: { step: 'Step guidance is disabled' } }]) {
    const { page, errors } = await open(browser, 1100, {
      snapshotReply, progress: progressBefore('S2-07'), status: { protocol: 6, pluginVersion: '2.81.42' },
    }, '#/step/S2-07');
    await page.locator('.modern-show').click();
    await settle(page);
    expect((await page.getByText(/The game guide was not confirmed/).count()) > 0, 'snapshot refusal: HTTP 200 does not claim the guide is confirmed');
    expect(await page.getByRole('button', { name: /Shown in the game/ }).count() === 0, 'snapshot refusal: no successful target indicator');
    expect(await page.evaluate(() => localStorage.getItem('osrs-put:active-step')) === null, 'snapshot refusal: a failed target is not saved as active');
    expect(await page.locator('.bridge-indicator.is-online').count() === 1, 'snapshot refusal: the reachable bridge stays online');
    expect(!errors.length, 'snapshot refusal: no console errors');
    await page.context().close();
  }
  const { page, errors } = await open(browser, 1100, {
    snapshotReply: { rejected: { bankTags: 'Bank highlights are disabled' } }, progress: progressBefore('S2-07'),
    status: { protocol: 6, pluginVersion: '2.81.42' },
  }, '#/step/S2-07');
  await page.locator('.modern-show').click();
  await settle(page);
  expect(await page.evaluate(() => localStorage.getItem('osrs-put:active-step')) === 'S2-07', 'snapshot refusal: disabling an optional bank helper still permits the accepted quest target');
  expect(await page.getByText(/The game guide was not confirmed/).count() === 0, 'snapshot refusal: optional refusal does not claim the target failed');
  expect(!errors.length, 'snapshot refusal: optional refusal has no console errors');
  await page.context().close();
}

// A connected client at the login screen is not live guidance. Keep the target without claiming a visible arrow.
async function loginScreen(browser: Browser) {
  const questData = JSON.parse(readFileSync(new URL('../../../../src/data/authored/questStages.json', import.meta.url),'utf8')).quests['S3-04'];
  const stage = questData.stages.find((s: {do: {t:string;k?:string}[]}) => s.do.some(l => l.k === 'defeatGuardian'));
  const lineIndex = stage.do.findIndex((l: {t:string;k?:string}) => l.k === 'defeatGuardian');
  const {page, errors} = await open(browser,1440,{
    progress:progressBefore('S3-04'),localStorage:{'osrs-put:active-step':'S3-04'},
    status:{protocol:6,inGame:true,activeStepId:'S3-04',questInstruction:{stepId:'S3-04',stageAt:stage.at,lineIndex,peeking:false},navTarget:{stepId:'S3-04',label:'Talk to Willow (south of Ice Mountain)',x:0,y:0,plane:0}},
  },'#/step/S3-04');
  expect((await text(page,'.current-action-title')).includes('Ancient Guardian') && !(await text(page,'.current-action-title')).includes('Willow'),'current instruction: the quest cursor wins over the earlier arrow destination');
  const actionBox = await page.locator('.current-action-title').boundingBox();
  // On the step page the action keeps a readable measure (not squeezed into a sliver) and stays within four lines.
  expect(!!actionBox && actionBox.width >= 420 && actionBox.height < 180,'modern Path: the main action has readable desktop width');
  expect(await page.locator('#step-view-panel .overview').isVisible(),'cockpit: the walkthrough is open without a click');
  expect((await text(page,'.overview')).includes('In the game now'),'current instruction: the canonical walkthrough identifies the confirmed line');
  expect(/checked|Ready to set off/.test(await text(page,'.la-plaque .status-line')) && !(await text(page,'.la-plaque .status-line')).includes('Missing'),'cockpit: the verdict follows the stage too');
  await page.keyboard.press('p');
  await settle(page);
  expect(await page.locator('#step-view-prep[aria-selected="true"]').count() === 1 && await page.locator('#step-view-panel .quest-preparation').count() === 1 && await page.locator('#step-view-panel .one-trip').count() === 1,'cockpit: P opens the Preparation ribbon with the stage list and the whole plan');
  const need = await text(page,'#step-view-panel .quest-preparation');
  // The last fight asks for a pickaxe and food; the meat, bread, knife and beer of stage 15 are used up and folded away.
  expect(need.includes('Needed for this stage') && need.includes('Used earlier in this quest') && need.includes('Bronze pickaxe') && !need.includes('Missing')
    && !need.includes('Cooked meat') && !need.includes('Bread') && !need.includes('Knife') && !need.includes('Beer'),'cockpit: the quest items the stage no longer asks for are folded away, not listed as missing');
  expect(await page.locator('.manual-complete').isVisible(),'cockpit: manual completion stays accessible');
  await page.keyboard.press('t');
  await settle(page);
  expect(await page.locator('#step-view-travel[aria-selected="true"]').count() === 1,'cockpit: T opens the Route & game ribbon');
  await page.keyboard.press('Escape');
  expect(errors.length === 0 && await noOverflow(page),'modern Path: no runtime errors or horizontal overflow');
  await page.context().close();
}

// A connected client at the login screen is not live guidance. Keep the target without claiming a visible arrow.
async function loginScreenKeepsTarget(browser: Browser) {
  const {page, errors} = await open(browser, 1280, {
    progress:progressBefore('S3-04'), status:{protocol:6, inGame:false, activeStepId:'S3-04'}, localStorage:{'osrs-put:active-step':'S3-04'},
  }, '#/step/S3-04');
  await waitFor(page, '.current-action', 5000);
  const hero = await text(page, '.current-action');
  expect(hero.includes('Waiting for character') && !hero.includes('Shown in the game'), 'login screen: the action waits for the character');
  expect(!(await text(page, '.step-status')).includes('the arrow leads to it'), 'login screen: the step status does not claim a live arrow');
  const code = await page.locator('.cockpit .step-id').boundingBox();
  expect(!!code && code.height <= 20, 'route rail: the current step code stays on one line');
  const hints = await text(page, '.ingame');
  expect(hints.includes('Saved target') && !hints.includes('Shown in the game') && !hints.includes('Active in RuneLite'), 'login screen: travel keeps the saved target without a live badge');
  await page.goto(BASE+'#/settings');
  await page.getByRole('tab',{name:'RuneLite',exact:true}).click();
  expect((await text(page, 'main')).includes('your character logs in'), 'login screen: settings explain when guidance resumes');
  const launch = await page.getByRole('button',{name:/RuneLite with the bridge is running/}).boundingBox();
  expect(!!launch && launch.width > 260 && launch.height <= 60, 'RuneLite settings: the launch button uses a full action row');
  expect(errors.length === 0, `login screen: no runtime errors ${errors.join('; ')}`);
  await page.context().close();
}

// The desktop action follows the quest cursor while the player stays logged in: the plugin announces a moved cursor with a STATUS event.
async function questCursor(browser: Browser) {
  const quest = JSON.parse(readFileSync(new URL('../../../../src/data/authored/questStages.json', import.meta.url), 'utf8')).quests['S3-04'];
  const last = quest.stages.find((s: { do: { t: string; k?: string }[] }) => s.do.some((l) => l.k === 'defeatGuardian'));
  const earlier = quest.stages.find((s: { at: number; do: { t: string; k?: string }[] }) => s.at < last.at && s.do.length > 0 && s.do[0].k !== 'defeatGuardian');
  const { page } = await open(browser, 1440, {
    progress: progressBefore('S3-04'), localStorage: { 'osrs-put:active-step': 'S3-04' },
    status: { protocol: 6, inGame: true, activeStepId: 'S3-04', questInstruction: { stepId: 'S3-04', stageAt: earlier.at, lineIndex: 0, peeking: false } },
  }, '#/step/S3-04');
  const before = await text(page, '.current-action-title');
  await page.evaluate((at: number) => {
    const w = window as unknown as { __status: Record<string, unknown>; __emit: (e: unknown) => void };
    w.__status = { questInstruction: { stepId: 'S3-04', stageAt: at, lineIndex: 0, peeking: false } };
    w.__emit({ type: 'STATUS', inGame: true });
  }, last.at);
  await settle(page);
  const after = await text(page, '.current-action-title');
  expect(!before.includes('Ancient Guardian') && after.includes('Ancient Guardian'), 'current instruction: it moves with the quest cursor without a new login');
  await page.context().close();
}

async function questObservationFreshness(browser: Browser) {
  const observation = { player: 'Fixture', sessionId: 'login-current', revision: 1, questPoints: 3, states: { "Doric's Quest": 'NOT_STARTED' } };
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S1-03', { gameMode: 'f2p' }),
    status: { protocol: 6, inGame: true, player: 'Fixture', questPoints: 3, questsDone: [], questStates: observation },
  }, '#/journal');
  await page.locator('.la-stat b').filter({ hasText: /^3$/ }).waitFor();
  await page.evaluate(() => {
    const w = window as unknown as { __holdStatus: boolean; __emit: (event: unknown) => void };
    w.__holdStatus = true;
    w.__emit({ type: 'STATUS', inGame: true, player: 'Fixture' });
  });
  await page.waitForFunction(() => typeof (window as unknown as { __releaseStatus?: unknown }).__releaseStatus === 'function');
  await page.evaluate(observation => {
    const w = window as unknown as { __emit: (event: unknown) => void; __releaseStatus: () => void };
    w.__emit({ type: 'QUESTS', done: ["Doric's Quest"], questStates: { ...observation, revision: 2, questPoints: 4, states: { "Doric's Quest": 'COMPLETED' } } });
    w.__releaseStatus();
  }, observation);
  await settle(page);
  expect((await text(page, '.la-stat b')) === '4', 'quest observations: a delayed status cannot overwrite newer quest points');
  await page.evaluate(observation => {
    const w = window as unknown as { __emit: (event: unknown) => void };
    w.__emit({ type: 'QUESTS', done: [], questStates: observation });
    w.__emit({ type: 'QUESTS', done: [], questStates: { ...observation, sessionId: 'old-login', revision: 99 } });
  }, observation);
  await settle(page);
  expect((await text(page, '.la-stat b')) === '4', 'quest observations: old revisions and old login sessions cannot restore old totals');
  await page.evaluate(() => (window as unknown as { __emit: (event: unknown) => void }).__emit({ type: 'QUESTS', done: [] }));
  await settle(page);
  expect((await text(page, '.la-stat b')) === '4', 'quest observations: an unversioned event cannot downgrade the admitted observation or its QP');
  // The reminder is a Ledger notice with the Ledger's dark button, not a white bar across the page.
  const dismiss = await page.locator('.la-main > [aria-label="Bank reminder"]').evaluate((el) => { const b = el.querySelector('button')!;
    return { bg: getComputedStyle(b).backgroundColor, share: b.getBoundingClientRect().width / el.getBoundingClientRect().width, notice: el.classList.contains('la-notice') }; });
  expect(dismiss.notice && dismiss.bg === 'rgb(21, 14, 9)' && dismiss.share < 0.4, `bank reminder: a Ledger notice with a Ledger button (${JSON.stringify(dismiss)})`);
  await page.getByRole('button', { name: 'Dismiss bank reminder', exact: true }).click();
  await page.evaluate(() => {
    const w = window as unknown as { __holdStatus: boolean; __emit: (event: unknown) => void };
    w.__holdStatus = false;
    w.__emit({ type: 'STATUS', inGame: true, player: 'Fixture' });
  });
  await settle(page);
  expect(await page.getByRole('button', { name: 'Dismiss bank reminder', exact: true }).count() === 0, 'bank reminder: reconnect with the same login does not repeat it');
  await page.reload();
  await settle(page);
  expect(await page.getByRole('button', { name: 'Dismiss bank reminder', exact: true }).count() === 0, 'bank reminder: acknowledgement survives app reload during the same login');
  await page.evaluate(observation => {
    const w = window as unknown as { __status: unknown; __emit: (event: unknown) => void };
    w.__status = { questPoints: 4, questsDone: ["Doric's Quest"], questStates: { ...observation, sessionId: 'next-real-login', questPoints: 4 } };
    w.__emit({ type: 'STATUS', inGame: true, player: 'Fixture' });
  }, observation);
  await page.getByRole('button', { name: 'Dismiss bank reminder', exact: true }).waitFor();
  expect(true, 'bank reminder: a verified new login offers one refresh again');
  expect(!errors.length, 'quest observations: no runtime errors');
  await page.context().close();
}

async function protectedGoalStorage(browser: Browser) {
  const future = '{"version":99,"intent":{"kind":"unknown-future-goal"}}';
  for (const external of [false, true]) {
    const { page, errors } = await open(browser, 1280, {
      progress: progressBefore('S5-01', { gameMode: 'f2p' }),
      localStorage: external ? {} : { 'osrs-put:planning-intent': future },
      status: { stats: { woodcutting: 21, attack: 40 } },
      events: [{ type: 'STATS', stats: { woodcutting: 21, attack: 40 } },
        { type: 'OWNED', bankSeen: true, items: [{ name: 'Bronze axe', carried: 1, noted: 0, bank: 0 }] }],
    }, '#/skills/WC/woodcutting');
    await page.locator('.training-follow').waitFor();
    if (external) await page.evaluate(value => localStorage.setItem('osrs-put:planning-intent', value), future);
    await page.locator('.training-follow').click();
    await settle(page);
    expect(page.url().includes('#/skills/WC/woodcutting'), `goal protection (${external ? 'external change' : 'future format'}): a refused goal does not claim to follow another route`);
    expect(await page.evaluate(() => localStorage.getItem('osrs-put:planning-intent')) === future, 'goal protection: the original saved intention remains byte-for-byte intact');
    expect((await page.locator('[role="alert"]').allTextContents()).some(value => value.includes(external ? 'outside this window' : 'newer app')), 'goal protection: the reason is visible');
    expect(!errors.length, 'goal protection: no runtime errors');
    await page.context().close();
  }
}

export const scenarios = {
  'snapshot-refusal': snapshotRefusal,
  'protected-goal-storage': protectedGoalStorage,
  'quest-observation-freshness': questObservationFreshness,
  'cleared-arrow': clearedArrow,
  'launch-runelite': launchRunelite,
  'old-plugin': oldPlugin,
  'plugin-protocol-3': pluginProtocol3,
  'live-game-wins': liveGameWins,
  'protocol-6': protocol6,
  'login-screen': loginScreen,
  'login-screen-keeps-target': loginScreenKeepsTarget,
  'quest-cursor': questCursor,
};
