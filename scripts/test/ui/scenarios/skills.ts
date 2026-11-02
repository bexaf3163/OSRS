// Skills and training: scenarios of the browser suite (npm run test:ui -- --only skills).
import { readFileSync, readdirSync } from 'node:fs';
import type { Browser } from 'playwright';
import { toolUse } from '../../../../src/domain/items/toolTiers.ts';
import { BASE, progressBefore, open, settle, expect, noOverflow, reveal, waitFor, stepButton, text } from '../harness.ts';

async function f2pSkillsScenarios(browser: Browser) {
  for (const width of [1000, 1440]) {
    const { page, errors } = await open(browser, width, { progress: progressBefore('S3-03', { gameMode: 'f2p', levels: { attack: 30, strength: 21, defence: 10 } }) }, '#/skills');
    const defence = page.locator('.skill-tile a[href="#/skills/ME/defence"]');
    expect(await defence.count() === 1, `Skills ${width}: Defence has one direct tile`);
    expect(await page.locator('.section-rail').count() === 0, `Skills ${width}: no duplicate skill menu`);
    expect(await page.locator('.f2p-skill-badge').count() === 15, `F2P ${width}: every free skill including passive Hitpoints has one marker`);
    expect((await defence.innerText()).includes('10 reached'), `F2P ${width}: a known reached checkpoint is marked`);
    expect((await page.locator('.skill-tile a[href="#/skills/CO/cooking"]').innerText()).includes('68'), `F2P ${width}: Cooking shows the verified wine checkpoint`);
    expect((await page.locator('.skill-tile a[href="#/skills/PR/prayer"]').innerText()).includes('Prefer members'), `F2P ${width}: Prayer does not demand a F2P grind`);
    expect(await noOverflow(page) && !errors.length, `F2P ${width}: compact markers have no overflow or console errors`);
    await page.screenshot({ path: `audit-temp/f2p-priorities-${width}.png` });
    await defence.click();
    await page.locator('.training').waitFor();
    expect((await page.locator('.training').innerText()).includes('Defence checkpoint reached'), `Skills ${width}: a completed F2P checkpoint is explained instead of an empty Train pane`);
    expect((await text(page, 'h1')).includes('Defence'), `Skills ${width}: Defence opens directly`);
    expect((await text(page, '.f2p-skill-checkpoint')).includes('10 reached'), `F2P ${width}: the detail uses the same checkpoint as its tile`);
    await page.locator('.skill-tile a[href="#/skills/ME/attack"]').click();
    await page.getByRole('group', { name: 'Training priority' }).waitFor();
    expect(await page.locator('[aria-label="Training priority"] button').count() === 3, `Skills ${width}: three priorities`);
    expect(await page.locator('[aria-label="Training priority"] button[aria-pressed="true"]').innerText() === 'Balanced', `Skills ${width}: Balanced is default`);
    expect(await page.locator('.skill-detail details').count() === 0, `Skills ${width}: default view contains no disclosure stack`);
    expect(await page.locator('.training-analysis, .skill-level-editor, .skill-guide-roadmap').count() === 0, `Skills ${width}: supporting tools are absent from the default view`);
    for (const label of ['Money', 'XP', 'Balanced']) {
      await page.getByRole('group', { name: 'Training priority' }).getByRole('button', { name: label, exact: true }).click();
      expect(await page.locator('[aria-label="Training priority"] button[aria-pressed="true"]').innerText() === label, `Skills ${width}: ${label} priority remains directly available`);
    }
    await page.screenshot({ path: `audit-temp/skills-compact-${width}.png` });
    await page.locator('.skill-tile a[href="#/skills/ME/defence"]').click();
    await page.locator('h1').filter({ hasText: 'Defence' }).waitFor();
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    expect(await page.locator('.training').count() === 1 && await page.locator('.skill-guide-roadmap').count() === 0 && await noOverflow(page), `Skills ${width}: the canonical plan remains accessible without a competing roadmap`);
    expect(await page.locator('.focus-reached').count() === 0 && (await text(page, '.training')).includes('checkpoint reached'), `Skills ${width}: completed checkpoint uses its actual goal without an obsolete stage-goal note`);
    expect((await text(page, 'h1')).includes('Defence'), `Skills ${width}: plan keeps the chosen combat skill`);
    await page.getByRole('tab', { name: 'Calculator', exact: true }).click();
    expect(await page.locator('.calc').count() === 1, `Skills ${width}: calculator remains accessible`);
    await page.getByRole('tab', { name: 'Reference', exact: true }).click();
    expect((await text(page, '.f2p-skill-note')).includes('10 reached') && await page.locator('.skill-level-editor').count() === 1, `Skills ${width}: F2P evidence and level editing remain accessible`);
    await page.getByRole('tab', { name: 'Train', exact: true }).click();
    expect(await noOverflow(page) && !errors.length, `F2P ${width}: the direct skill guide stays usable`);
    await page.context().close();
  }

  for (const [group, skill, tool] of [['WC', 'woodcutting', 'axe'], ['MI', 'mining', 'pickaxe'], ['FI', 'fishing', 'rod/net'], ['CO', 'cooking', 'ingredients'], ['FM', 'firemaking', 'tinderbox'], ['SM', 'smithing', 'ores'], ['CR', 'crafting', 'recipe'], ['RC', 'runecraft', 'tiara'], ['PR', 'prayer', 'bones']] as const) {
    const { page, errors } = await open(browser, 1000, { market: true,
      progress: progressBefore('S6-02', { gameMode: 'f2p', levels: { [skill]: 1 } }),
    }, `#/skills/${group}/${skill}`);
    expect((await text(page, '.training-equipment:visible')).toLowerCase().includes(tool), `Skills equipment (${skill}): one practical hint accompanies the current method`);
    expect(await page.locator('.skill-detail details').count() === 0 && await noOverflow(page) && !errors.length, `Skills equipment (${skill}): compact without a disclosure stack or errors`);
    await page.context().close();
  }

  {
    const { page, errors } = await open(browser, 1000, { theme: 'light', scale: 1.5, progress: progressBefore('S3-03', { gameMode: 'f2p' }) }, '#/skills');
    expect(await page.locator('.f2p-skill-badge').count() === 15 && await noOverflow(page) && !errors.length, 'F2P desktop light theme and 150% scaling: every marker remains readable without horizontal scrolling');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { theme: 'light', scale: 1.5,
      progress: progressBefore('S9-01', { gameMode: 'members', levels: Object.fromEntries(readdirSync(new URL('../../../../src/data/generated/skills/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), 30])) }) }, '#/skills');
    expect(await page.locator('.f2p-skill-badge').count() === 0, 'Members: F2P preparation markers do not clutter the overview');
    const links = await page.locator('.skill-tile a').evaluateAll(els => els.map(el => ({ href: el.getAttribute('href')!, name: el.querySelector('.skill-name')!.textContent! })));
    for (const { href, name } of links) {
      await page.evaluate(hash => { location.hash = hash; }, href);
      await page.locator('.skill-detail h1').filter({ hasText: name }).waitFor();
      expect(await page.getByRole('tab', { name: 'Train', exact: true }).getAttribute('aria-selected') === 'true'
        && await page.locator('.skill-detail details').count() === 0, `${href}: direct recommendation without disclosure clutter`);
      expect(await noOverflow(page) && !errors.length, `${href}: light desktop at 150% has no overflow or console errors`);
    }
    await page.evaluate(() => { location.hash = '#/skills/WC/woodcutting'; });
    await waitFor(page, '.training', 5000);
    await page.screenshot({ path: 'audit-temp/skills-compact-light-150.png' });
    await page.context().close();
  }
}

async function membersGatheringScenarios(browser: Browser) {
  for (const width of [1000, 1440]) {
    const levels = { woodcutting: 55, attack: 40 };
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S9-01', { gameMode: 'members', levels }),
      localStorage: { 'osrs-put:features': JSON.stringify({ efficient: true }) },
      status: { protocol: 6, inGame: true, stats: levels, equipment: [], inventory: [{ id: 1359, name: 'Rune axe', count: 1 }], coins: 5000, bankCoins: 0 },
      events: [{ type: 'STATS', stats: levels }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Rune axe', carried: 1, noted: 0, bank: 0 }] }],
    }, '#/skills/WC/woodcutting');
    const card = await text(page, '.training-summary');
    expect(card.includes('Teak trees') && card.includes('Estimated for your setup') && !card.includes('93,000'), `Members gathering ${width}: ordinary chopping replaces the mixed tick-manipulation range`);
    expect(card.includes('Isle of Souls') && card.includes('Earnings not estimated') && await page.locator('.training-summary details').count() === 0, `Members gathering ${width}: one compact modelled location without invented bank income`);
    await page.getByRole('button', { name: 'Follow training plan', exact: true }).click();
    await settle(page);
    const targets = await page.evaluate(() => (window as unknown as { __posts: { path: string; body?: any }[] }).__posts.filter(p => p.path === '/prep-plan').map(p => p.body?.step));
    expect(targets.some(t => t?.worldPoint?.label?.includes('Isle of Souls') && t.objectNames?.includes('Teak tree')), `Members gathering ${width}: the prepared skill target and scenery use the model's spot`);
    await page.evaluate(() => { location.hash = '#/skills/WC/woodcutting'; });
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    expect((await text(page, '.training-analysis')).includes('drops logs because its banking route is not modelled'), `Members gathering ${width}: the banking limitation is explicit`);
    expect(await noOverflow(page) && !errors.length, `Members gathering ${width}: no overflow or console errors`);
    await page.context().close();
  }

  for (const sample of [
    { skill: 'fishing', code: 'FI', names: ['Monkfish', 'Karambwan'] },
    { skill: 'mining', code: 'MI', names: ['Motherlode Mine'] },
  ]) {
    const stats = { fishing: 70, mining: 50, attack: 40 };
    const items = ['Small fishing net', 'Fishing rod', 'Fly fishing rod', 'Feather', 'Fishing bait', 'Lobster pot', 'Harpoon', 'Karambwan vessel', 'Raw karambwanji', 'Rune pickaxe'];
    const gear = { equipment: [], inventory: items.map(name => ({ id: 0, name, count: name === 'Feather' || name === 'Fishing bait' || name === 'Raw karambwanji' ? 100 : 1 })), coins: 500000, bankCoins: 0 };
    const { page, errors } = await open(browser, 1280, {
      progress: progressBefore('S9-01', { gameMode: 'members', levels: stats }),
      status: { protocol: 6, inGame: true, stats, ...gear, questsDone: ['Swan Song'] },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'QUESTS', done: ['Swan Song'] },
        { type: 'OWNED', bankSeen: true, items: gear.inventory.map(i => ({ name: i.name, carried: i.count, noted: 0, bank: 0 })) }],
    }, `#/skills/${sample.code}/${sample.skill}?goal=80`);
    await page.locator('.training-now').waitFor();
    const recommended = await page.locator('.training-now').innerText();
    expect(sample.names.every(name => !recommended.includes(name)), `Members ${sample.skill}: an unmodelled cycle is not the automatic recommendation`);
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    const explanation = await text(page, '.training-analysis');
    // The compact alternative list is intentionally capped; catalogue retention for every method has separate unit coverage.
    if (sample.skill === 'mining') expect(explanation.includes('Motherlode Mine') && explanation.includes('manual setup:'), 'Members mining: the visible reference retains its manual-setup label');
    expect(await noOverflow(page) && !errors.length, `Members ${sample.skill}: the reference boundary preserves the accepted Ledger`);
    await page.context().close();
  }

}

async function processingKitScenarios(browser: Browser) {
  const processing = JSON.parse(readFileSync(new URL('../../../../src/data/generated/processing.json', import.meta.url), 'utf8'));
  const watched = [...new Set<string>(processing.recipes.flatMap((r: any) => [...r.tools, ...r.inputs.map((i: any) => i.name)]))];
  const samples: { skill: string; code: string; level: number; target: number; title: string; watch: string; extraStats?: Record<string, number>; quests?: string[]; unchecked?: boolean; items: Record<string, number>; object: string | null }[] = [
    { skill: 'crafting', code: 'CR', level: 1, target: 2, title: 'Leather gloves', watch: 'Thread', items: { Needle: 1, Thread: 2, Leather: 7 }, object: null },
    { skill: 'crafting', code: 'CR', level: 23, target: 24, title: 'Tiara', watch: 'Silver bar', items: { 'Tiara mould': 1, 'Silver bar': 7 }, object: 'Furnace' },
    { skill: 'smithing', code: 'SM', level: 30, target: 31, title: 'Steel bar', watch: 'Coal', items: { 'Iron ore': 3, Coal: 6 }, object: 'Furnace' },
    { skill: 'firemaking', code: 'FM', level: 30, target: 31, title: 'Willow logs', watch: 'Willow logs', items: { Tinderbox: 1, 'Willow logs': 7 }, object: null },
    { skill: 'prayer', code: 'PR', level: 1, target: 2, title: 'Camdozaal', watch: 'Small fishing net', extraStats: { fishing: 7, cooking: 7 }, quests: ['Below Ice Mountain'], items: { 'Small fishing net': 1, Knife: 1 }, object: null },
    { skill: 'prayer', code: 'PR', level: 1, target: 2, title: 'Camdozaal', watch: 'Small fishing net', extraStats: { cooking: 7 }, quests: ['Below Ice Mountain'], items: { 'Small fishing net': 1, Knife: 1 }, object: null, unchecked: true },
  ];
  for (const sample of samples) {
    const stats = { ...sample.extraStats, [sample.skill]: sample.level, hitpoints: 40 };
    const gear = { equipment: [], inventory: Object.entries(sample.items).map(([name, count]) => ({ id: 0, name, count })), coins: 0, bankCoins: 0 };
    const { page, errors } = await open(browser, 1280, {
      market: true, marketUnavailable: true,
      progress: progressBefore('S6-01', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      status: { protocol: 6, inGame: true, player: 'Processing kit', activeStepId: 'S6-01', stats, ...gear, ...(sample.quests ? { questsDone: sample.quests } : {}) },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true,
        items: [...new Set([...watched, ...Object.keys(sample.items)])].map(name => ({ name, carried: sample.items[name] ?? 0, noted: 0, bank: 0 })) }, ...(sample.quests ? [{ type: 'QUESTS', done: sample.quests }] : [])],
    }, `#/skills/${sample.code}/${sample.skill}?goal=${sample.target}`);
    await page.locator('.training-now').waitFor();
    const recommendation = await page.locator('.training-now').innerText();
    if (sample.unchecked) {
      expect(!recommendation.includes(sample.title), 'Prayer: an unread cross-skill gate is not advertised as the confirmed recommended activity');
      expect(await noOverflow(page) && !errors.length, 'Prayer: incomplete facts remain usable without UI errors');
      await page.context().close();
      continue;
    }
    expect(recommendation.includes(sample.title), 'Processing: owned usable recipe is recommended');
    await page.locator('.training-follow').click();
    await page.locator('.tracked-skill').waitFor();
    await page.waitForFunction(name => {
      const step = (window as any).__posts.filter((p: any) => p.path === '/prep-plan').at(-1)?.body?.step;
      return JSON.stringify(step).includes(name);
    }, sample.watch);
    if (sample.object) {
      const sent = await page.evaluate(() => (window as any).__posts.filter((p: any) => p.path === '/prep-plan').at(-1)?.body?.step);
      expect(sent.objectNames?.includes(sample.object), 'Processing: the selected station reaches the shared guide');
    }
    await page.goto(`${BASE}#/shopping`);
    await page.getByRole('region', { name: 'Checkout', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 0, 'Processing: partial usable kit does not require another purchase');
    expect(await page.getByRole('link', { name: 'Prepare funding', exact: true }).count() === 0, 'Processing: owned materials do not trigger funding');
    expect(await noOverflow(page) && !errors.length, 'Processing: guide and checkout fit the accepted Ledger');
    await page.context().close();
  }
}

async function cookingCatchScenarios(browser: Browser) {
  const processing = JSON.parse(readFileSync(new URL('../../../../src/data/generated/processing.json', import.meta.url), 'utf8'));
  const watched = [...new Set<string>(processing.recipes.flatMap((r: any) => [...r.tools, ...r.inputs.map((i: any) => i.name)]))];
  const stats = { cooking: 45, hitpoints: 40 };
  const gear = { equipment: [], inventory: [{ id: 371, name: 'Raw swordfish', count: 7 }], coins: 0, bankCoins: 0 };
  const { page, errors } = await open(browser, 1280, {
    market: true, marketUnavailable: true,
    progress: progressBefore('S6-01', { gameMode: 'f2p', levels: stats }),
    localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
    status: { protocol: 6, inGame: true, player: 'Cooking catch', activeStepId: 'S6-01', stats, ...gear },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true,
      items: watched.map(name => ({ name, carried: name === 'Raw swordfish' ? 7 : 0, noted: 0, bank: 0 })) }],
  }, '#/skills/CO/cooking?goal=46');
  await page.locator('.training-now').waitFor();
  expect((await page.locator('.training-now').innerText()).includes('Swordfish'), 'Cooking: owned catch wins over unpriced wine at zero cash');
  await page.locator('.training-follow').click();
  await page.locator('.tracked-skill').waitFor();
  await page.waitForFunction(() => {
    const step = (window as any).__posts.filter((p: any) => p.path === '/prep-plan').at(-1)?.body?.step;
    return JSON.stringify(step).includes('Raw swordfish');
  });
  const sent = await page.evaluate(() => (window as any).__posts.filter((p: any) => p.path === '/prep-plan').at(-1)?.body?.step);
  expect(!sent.npcNames?.length && sent.objectNames?.some((name: string) => /fire/i.test(name)), 'Cooking: shared guide sends the fire target without a stale combat NPC');
  await page.goto(`${BASE}#/shopping`);
  await page.getByRole('region', { name: 'Checkout', exact: true }).waitFor();
  expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 0, 'Cooking: current partial catch does not trigger another ingredient purchase');
  expect(await page.getByRole('link', { name: 'Prepare funding', exact: true }).count() === 0, 'Cooking: already-owned ingredients do not trigger funding');
  await page.screenshot({ path: 'audit-temp/cooking-owned-catch.png' });
  expect(await noOverflow(page) && !errors.length, 'Cooking: staged guide and checkout fit the accepted Ledger without errors');
  await page.context().close();
}

async function processingBudgetScenarios(browser: Browser) {
  for (const width of [1000, 1440]) {
    const levels = { fletching: 40 };
    const gear = { equipment: [], inventory: [{ id: 946, name: 'Knife', count: 1 }], coins: 0, bankCoins: 0 };
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S9-01', { gameMode: 'members', levels }),
      localStorage: { 'osrs-put:features': JSON.stringify({ efficient: true }) },
      status: { protocol: 6, inGame: true, stats: levels, ...gear },
      events: [{ type: 'STATS', stats: levels }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [
        { name: 'Knife', carried: 1, noted: 0, bank: 0 },
        { name: 'Oak logs', carried: 0, noted: 0, bank: 28 },
        { name: 'Willow logs', carried: 0, noted: 0, bank: 0 },
      ] }], market: true, marketQuotes: { 'Oak logs': { id: 1521, price: 100 }, 'Willow logs': { id: 1519, price: 100 } },
    }, '#/skills/FL/fletching');
    await page.locator('.training-method .training-now').filter({ hasText: 'Oak longbow (u)' }).waitFor();
    expect((await text(page, '.training-summary')).includes('Oak longbow (u)'), `Processing ${width}: owned inputs beat an unfundable faster recipe`);
    await page.evaluate(g => { (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'GEAR', gear: g }); }, { ...gear, coins: 10000 });
    await page.locator('.training-method .training-now').filter({ hasText: 'Willow longbow (u)' }).waitFor();
    expect((await text(page, '.training-summary')).includes('Willow logs'), `Processing ${width}: cash-only update refreshes recipe and required supplies`);
    expect((await text(page, '.training-summary')).includes('assumes future supplies'), `Processing ${width}: training time does not promise funded replenishment`);
    expect(await page.locator('.training-summary details').count() === 0 && await noOverflow(page) && !errors.length, `Processing ${width}: compact UI stays usable without console errors`);
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    expect((await text(page, '.training-analysis')).includes('Conditional goal supplies (estimate)') && (await text(page, '.training-analysis')).includes('Future funding and product sales are not assumed'), `Processing ${width}: the full-goal estimate is in Plan, separated from starter preparation`);
    expect(await noOverflow(page) && !errors.length, `Processing ${width}: goal quantities fit the current Ledger`);
    await page.screenshot({ path: `audit-temp/processing-budget-${width}.png` });
    await page.context().close();
  }
}

async function consumerDependencyScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { crafting: 30, woodcutting: 36, ranged: 1, slayer: 1, cooking: 1 };
    const progress = progressBefore('S9-01', { gameMode: 'members', levels: stats });
    progress.steps['S8-04'] = 'skipped';
    const { page, errors } = await open(browser, width, {
      progress, localStorage: { 'osrs-put:active-step': 'S9-01' },
      status: { protocol: 6, inGame: true, stats }, events: [{ type: 'STATS', stats }],
    }, '#/step/S9-01');
    await page.getByRole('tab', { name: 'Preparation', exact: true }).click(); // the readiness verdict is on the Preparation ribbon
    expect((await page.locator('main').innerText()).includes('First S8-04'), `consumer skills (${width}): a missing actual entry skill retains the blocker`);
    await page.evaluate(next => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'STATS', stats: next }), { ...stats, crafting: 31 });
    await settle(page);
    expect(!(await page.locator('main').innerText()).includes('First S8-04'), `consumer skills (${width}): reached Lost City skills do not demand unrelated Ranged/Slayer/Cooking`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}').steps?.['S8-04']) === 'skipped', `consumer skills (${width}): the producer remains skipped, not completed`);
    expect(await noOverflow(page) && !errors.length, `consumer skills (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function skillHandoverScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { fishing: 34, cooking: 30 };
    const recipes = JSON.parse(readFileSync(new URL('../../../../src/data/generated/processing.json', import.meta.url), 'utf8')).recipes;
    const names = [...new Set<string>(['Small fishing net', 'Fishing rod', 'Fishing bait', 'Fly fishing rod', 'Feather', 'Lobster pot', 'Harpoon',
      ...recipes.filter((r: any) => r.skill === 'cooking').flatMap((r: any) => r.inputs.map((i: any) => i.name))])];
    const items = names.map(name => ({ name, carried: 0, noted: 0, bank: name === 'Raw tuna' ? 26 : name === 'Grapes' || name === 'Jug of water' ? 13 : 0 }));
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-01', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-01' },
      status: { protocol: 6, inGame: true, player: 'Skill Handover', activeStepId: 'S6-01', stats, coins: 1000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S6-01');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const setLevels = async (levels: Record<string, number>, destination: string) => {
      await page.evaluate(s => { const w = window as unknown as { __emit: (e: unknown) => void; __status: Record<string, unknown> }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, levels);
      // The cold-start profile/bridge effects can finish after the old fixed delay. Wait for the actual projection; keep every assertion below.
      await page.waitForFunction(label => {
        const posts = (window as unknown as { __posts: { path: string; body: any }[] }).__posts;
        return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.step?.worldPoint?.label?.includes(label);
      }, destination, { timeout: 10000 });
    };
    await setLevels({ fishing: 35, cooking: 30 }, 'Cooking: Tuna');
    const cooking = await snapshot();
    expect(cooking?.step?.worldPoint?.label?.includes('Cooking: Tuna') && cooking.step.worldPoint.label.includes('Barbarian Village') && cooking.step.checklist?.some((r: any) => r.name === 'Raw tuna' && r.count === 26), `skill handover (${width}): completing Fishing projects Cooking supplies and destination into the game`);
    expect(!cooking?.step?.npcNames?.includes('Fishing spot') && !cooking?.step?.checklist?.some((r: any) => /fishing net|fishing rod|harpoon/i.test(r.name)), `skill handover (${width}): no obsolete Fishing targets or tools`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}'));
    expect(saved.steps?.['S6-01'] !== 'done', `skill handover (${width}): Fishing alone cannot complete the combined goal`);
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Cooking'), `skill handover (${width}): the visible method follows the same remaining skill`);
    // Optional goes on to Cooking 68, the Skills checkpoint: at 35 the step moves on to wine, the fastest Cooking for members too.
    await page.evaluate(s => { const w = window as unknown as { __emit: (e: unknown) => void; __status: Record<string, unknown> }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, { fishing: 35, cooking: 35 });
    await page.waitForFunction(() => {
      const step = (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.step;
      return step && (step.checklist ?? []).some((r: any) => r.name === 'Grapes' || r.name === 'Jug of water');
    }, undefined, { timeout: 10000 });
    const wine = await snapshot();
    expect(wine?.step?.checklist?.some((r: any) => r.name === 'Grapes' || r.name === 'Jug of water'), `skill handover (${width}): Cooking 35 moves on to wine towards 68`);
    expect(await noOverflow(page) && !errors.length, `skill handover (${width}): no overflow or console errors`);
    await page.context().close();
    // A fresh low-level profile: do not simulate Cooking dropping from35 to1 on the admitted character.
    const low = { fishing: 35, cooking: 1 };
    const mixedItems = names.map(name => ({ name, carried: name === 'Raw beef' || name === 'Raw chicken' ? 13 : 0, noted: 0, bank: 0 }));
    const { page: materialPage, errors: materialErrors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-01', { gameMode: 'f2p', levels: low }),
      localStorage: { 'osrs-put:active-step': 'S6-01' },
      status: { protocol: 6, inGame: true, player: 'Material Handover', activeStepId: 'S6-01', stats: low, coins: 1000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats: low }, { type: 'OWNED', bankSeen: true, items: mixedItems }],
    }, '#/step/S6-01');
    await materialPage.waitForFunction(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.lines?.some((r: any) => r.name === 'Raw beef' && r.where === 'INVENTORY' && r.need === 26));
    const mixed = await materialPage.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    expect(mixed.plan.lines.some((r: any) => r.name === 'Raw beef' && r.where === 'INVENTORY' && r.need === 26), `skill handover (${width}): mixed beef/chicken covers one bag without buying duplicate beef`);
    await materialPage.evaluate(items => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'OWNED', bankSeen: true, items }),
      names.map(name => ({ name, carried: 0, noted: 0, bank: name === 'Raw chicken' ? 26 : 0 })));
    await materialPage.waitForFunction(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.plan?.bankWithdrawals?.some((w: any) => w.itemName === 'Raw chicken' && w.quantity === 26));
    const banked = await materialPage.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    expect(banked.plan.lines.find((r: any) => r.name === 'Raw chicken')?.where === 'BANK', `skill handover (${width}): banked chicken is the named physical ingredient and withdrawal`);
    expect(await noOverflow(materialPage) && !materialErrors.length, `skill handover (${width}): mixed-material preparation has no overflow or console errors`);
    await materialPage.context().close();
  }
}

async function miningHandoverScenarios(browser: Browser) {
  for (const width of [1280]) {
    const stats = { mining: 44, woodcutting: 1, firemaking: 1 };
    const names = ['Bronze pickaxe', 'Iron pickaxe', 'Steel pickaxe', 'Mithril pickaxe', 'Adamant pickaxe', 'Rune pickaxe', 'Bronze axe', 'Iron axe', 'Steel axe', 'Mithril axe', 'Adamant axe', 'Rune axe', 'Tinderbox', 'Logs', 'Oak logs', 'Willow logs', 'Maple logs', 'Yew logs'];
    const items = names.map(name => ({ name, carried: name === 'Rune pickaxe' ? 1 : 0, noted: 0, bank: name === 'Bronze axe' || name === 'Tinderbox' ? 1 : name === 'Logs' ? 27 : 0 }));
    const { page, errors } = await open(browser, width, {
      market: true, progress: progressBefore('S6-02', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-02' },
      status: { protocol: 6, inGame: true, player: 'Mining Handover', activeStepId: 'S6-02', stats, coins: 1000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'STATS', stats }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/step/S6-02');
    const snapshot = () => page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body);
    const mining = await snapshot();
    expect(mining?.step?.worldPoint?.label?.includes('South-east Varrock mine') && JSON.stringify(mining.step.objectNames) === JSON.stringify(['Iron rocks']), `Mining handover (${width}): current Mining task has only iron scenery`);
    for (const [level, object, place] of [[1, 'Tree', 'Lumbridge'], [15, 'Oak tree', 'Draynor Bank'], [30, 'Oak tree', 'Draynor Bank']] as const) { // Oaks until 60 when logs are dropped (OSRS Wiki).
      await page.evaluate(s => { const w = window as unknown as { __emit: (e: unknown) => void; __status: Record<string, unknown> }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, { mining: 45, woodcutting: level, firemaking: 1 });
      await settle(page);
      const current = await snapshot();
      expect(current?.step?.worldPoint?.label?.includes(place) && JSON.stringify(current.step.objectNames) === JSON.stringify([object]), `Mining handover (${width}, WC${level}): one current Woodcutting scene and destination`);
      const axe = current?.step?.checklist?.length === 1 ? toolUse(current.step.checklist[0].name) : null;
      expect(axe?.skill === 'woodcutting' && !axe.members && axe.level <= level, `Mining handover (${width}, WC${level}): a usable F2P axe replaces pickaxe preparation`);
      expect(current?.step?.completionTrigger?.levels?.some((r: any) => r.skill === 'mining' && r.level === 45) && current.step.completionTrigger.levels.some((r: any) => r.skill === 'woodcutting' && r.level === 36) && current.step.completionTrigger.levels.some((r: any) => r.skill === 'firemaking' && r.level === 50), `Mining handover (${width}, WC${level}): all declared checkpoints remain`);
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress') ?? '{}'));
    expect(saved.steps?.['S6-02'] !== 'done', `Mining handover (${width}): Mining alone cannot complete this step`);
    await reveal(page, '.training:visible');
    expect((await text(page, '.training:visible')).includes('Woodcutting'), `Mining handover (${width}): desktop method and game payload agree`);
    await page.evaluate(s => { const w = window as unknown as { __emit: (e: unknown) => void; __status: Record<string, unknown> }; w.__status = { ...w.__status, stats: s }; w.__emit({ type: 'STATS', stats: s }); }, { mining: 45, woodcutting: 36, firemaking: 1 });
    await page.waitForFunction(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.step?.checklist?.some((r: any) => r.name === 'Tinderbox'));
    const burning = await snapshot();
    expect(burning.step.checklist.some((r: any) => r.name === 'Logs') && !burning.step.checklist.some((r: any) => /pickaxe| axe$/i.test(r.name)), `Mining handover (${width}): Firemaking receives its actual logs/tinderbox without old tools`);
    expect(await page.locator('.gear-banner').count() === 0, `Mining handover (${width}): no unrelated melee shopping banner`);
    expect((await text(page, '.training-equipment:visible')).includes('tinderbox'), `Mining handover (${width}): practical equipment advice follows the current phase`);
    await page.screenshot({ path: `audit-temp/optional-firemaking-${width}.png` });
    expect(await noOverflow(page) && !errors.length, `Mining handover (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function trainingScopeScenarios(browser: Browser) {
  for (const [mode, level, freeOnly, expectedTool] of [
    ['f2p', 11, true, 'Black axe'], ['members', 61, true, 'Rune axe'], ['members', 61, false, 'Dragon axe'],
  ] as const) {
    const stats = { woodcutting: level, attack: 1, strength: 1, defence: 1, hitpoints: 10 };
    const gear = { equipment: [], inventory: [], coins: 0, bankCoins: 0 };
    const items = ['Bronze axe', 'Iron axe', 'Steel axe', 'Black axe', 'Mithril axe', 'Adamant axe', 'Rune axe', 'Dragon axe']
      .map(name => ({ name, carried: 0, noted: 0, bank: mode === 'f2p' ? Number(name === 'Black axe') : Number(['Rune axe', 'Dragon axe'].includes(name)) }));
    const { page, errors } = await open(browser, 1280, {
      market: true, progress: progressBefore('S6-02', { gameMode: mode, levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S6-02', 'osrs-put:skill-track': JSON.stringify({ skill: 'woodcutting', mode: 'fast', freeOnly, target: level + 4 }) },
      status: { protocol: 6, inGame: true, player: 'Scoped Tool', activeStepId: 'S6-02', questsDone: [], stats, ...gear },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items }],
    }, '#/skills/WC/woodcutting');
    await page.locator('.training-follow').waitFor();
    await page.locator('.training-follow').click();
    await page.locator('.tracked-skill').waitFor();
    await page.waitForFunction(tool => (window as any).__posts.filter((post: any) => post.path === '/prep-plan').at(-1)?.body?.step?.guide?.items?.some((item: any) => item.name === tool), expectedTool);
    expect((await text(page, '.tracked-skill')).includes(expectedTool), `Training scope (${mode}, freeOnly=${freeOnly}): the canonical guide names ${expectedTool} for carrying at Attack1`);
    expect(await noOverflow(page) && !errors.length, `Training scope (${mode}, freeOnly=${freeOnly}): no Ledger overflow or runtime errors`);
    await page.context().close();
  }
}

async function fishingStep(browser: Browser) {
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: progressBefore('S6-01', { gameMode: 'f2p', levels: { fishing: 45 } }),
      localStorage: { 'osrs-put:features': JSON.stringify({ efficient: true }) },
      status: { protocol: 6, stats: { fishing: 45 } }, events: [{ type: 'STATS', stats: { fishing: 45 } }],
    }, '#/skills/FI');
    await waitFor(page, '.training', 5000);
    await page.getByRole('tab', { name: 'Calculator', exact: true }).click();
    await page.getByLabel('Goal', { exact: true }).fill('50');
    await page.getByRole('button', { name: 'Follow to level 50', exact: true }).click();
    await page.locator('.tracked-skill').waitFor();
    await page.evaluate(() => { location.hash = '#/skills/FI'; });
    await page.locator('.training-method .training-now').waitFor();
    const recommendation = await page.locator('.training-method .training-now').innerText();
    const content = await page.locator('.training').innerText();
    expect(recommendation.includes('fly fishing'), `skill bracket (${width}): an unlocked faster method remains selectable after its suggested range`);
    expect(/\bto 50\b/.test(content) && !content.includes('to level 40') && !/≈ 0 more/.test(content), `skill bracket (${width}): the card retains the future route goal without an expired action target`);
    expect(await noOverflow(page) && !errors.length, `skill bracket (${width}): no overflow or console errors`);
    await page.evaluate(() => { location.hash = '#/step/S6-01'; });
    await settle(page);
    await page.getByRole('button', { name: 'Back to the quest route', exact: true }).click();
    expect(!(await page.locator('.spot-switch').allTextContents()).join(' ').includes('Musa Point'), `method map (${width}): the current method does not offer a future climb spot`);
    await (await stepButton(page, '🧭 Show in the game')).first().click();
    await settle(page);
    const target = await page.evaluate(() => {
      const posts = (window as unknown as { __posts: { path: string; body?: { step?: { worldPoint?: { x: number; y: number }; groundTiles?: { x: number; y: number }[] } } }[] }).__posts;
      return posts.filter(p => p.path === '/prep-plan').at(-1)?.body?.step;
    });
    // Skills can keep training beyond35, but Optional must release Fishing and check the unread remaining Cooking level.
    expect(!target?.worldPoint && (target?.groundTiles ?? []).length === 0, `method map (${width}): the completed Fishing checkpoint cannot retain its obsolete fishing arrow`);
    expect(await noOverflow(page) && !errors.length, `method map (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

// "What to train with": the balanced choice by default (2.69), with no mode switch on the card; "Fastest" in Settings shows the time estimate.
async function whatToTrainWith(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S1-08', { levels: { woodcutting: 32 } }),
    status: { stats: { woodcutting: 32 } },
    events: [{ type: 'STATS', stats: { woodcutting: 32 } }],
  }, '#/skills/WC');
  await waitFor(page, '.training', 5000);
  const calm = await text(page, '.training');
  expect(calm.includes('Willow') && !calm.includes('by the wiki speed') && await page.locator('.training').getByRole('button', { name: /Calm|Efficient/ }).count() === 0, 'what to train with: at level 32 — willows, no time estimate and no mode switch on the card');
  expect(await noOverflow(page), 'what to train with: no horizontal scrolling');
  await page.goto(`${BASE}#/settings`);
  await settle(page);
  await page.getByRole('tab', { name: 'Training', exact: true }).click();
  await page.getByRole('group', { name: 'Training choices' }).getByRole('button', { name: 'Fastest' }).click();
  await settle(page);
  const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { efficient?: boolean; relaxedTraining?: boolean });
  expect(feat.efficient === true && feat.relaxedTraining === false, 'training choices: "Fastest" was remembered in the settings');
  await page.goto(`${BASE}#/skills/WC`);
  await waitFor(page, '.training', 5000);
  const fast = await text(page, '.training');
  // The goal passes the rune axe (41): the time is a forecast across the plan with the planned axe.
  expect(/across your plan/.test(fast), 'what to train with: "Fastest" shows the time across the plan');
  expect(!errors.length, `what to train with: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'f2p-skills': f2pSkillsScenarios,
  'members-gathering': membersGatheringScenarios,
  'processing-kit': processingKitScenarios,
  'cooking-catch': cookingCatchScenarios,
  'processing-budget': processingBudgetScenarios,
  'consumer-dependencies': consumerDependencyScenarios,
  'skill-handover': skillHandoverScenarios,
  'mining-handover': miningHandoverScenarios,
  'training-scope': trainingScopeScenarios,
  'fishing-step': fishingStep,
  'what-to-train-with': whatToTrainWith,
};
