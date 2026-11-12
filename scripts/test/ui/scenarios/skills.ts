// Skills and training: scenarios of the browser suite (npm run test:ui -- --only skills).
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { SKILL_NAMES } from '../../../../src/domain/training/skillTrack.ts';
import { BASE, progressBefore, open, settle, expect, noOverflow, waitFor, text } from '../harness.ts';

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
    expect(!(await text(page, '.skill-level-goal')).includes('Goal'), `F2P ${width}: a reached checkpoint is not shown as a goal ahead ("Defence 10 → Goal 10")`);
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
    // The group without a chosen skill opens on the lagging skill whose checkpoint is still ahead: Strength 21 → 40, not Defence 10 (reached).
    await page.evaluate(() => { location.hash = '#/skills/ME'; });
    await page.locator('.skill-level-goal').filter({ hasText: 'Strength' }).waitFor({ timeout: 5000 }).catch(() => {});
    const groupHead = await text(page, '.skill-level-goal');
    expect(groupHead.includes('Strength 21') && groupHead.includes('Goal 40'), `F2P ${width}: Melee combat opens on Strength 21 → Goal 40, not on Defence past its checkpoint (got "${groupHead}")`);
    await page.context().close();
  }

  // The equipment line is the engine's own kit for the selected method (2.86.1): it names the real tool or materials; a skill saved for
  // membership shows no fixed note.
  for (const [group, skill, tool] of [['WC', 'woodcutting', /axe/], ['MI', 'mining', /pickaxe/], ['FI', 'fishing', /net|rod|harpoon/], ['CO', 'cooking', /raw /],
    ['FM', 'firemaking', /tinderbox.*logs/], ['SM', 'smithing', /hammer|bar|ore/], ['CR', 'crafting', /needle|chisel|mould|leather/], ['RC', 'runecraft', null], ['PR', 'prayer', null]] as const) {
    const { page, errors } = await open(browser, 1000, { market: true,
      progress: progressBefore('S5-01', { gameMode: 'f2p', levels: { [skill]: 1 } }),
    }, `#/skills/${group}/${skill}`);
    const equipment = (await page.locator('.training-equipment:visible').count()) ? (await text(page, '.training-equipment:visible')).toLowerCase() : null;
    expect(tool ? !!equipment && tool.test(equipment) : equipment === null, `Skills equipment (${skill}): the engine's kit for the current method, never a fixed note`);
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
      progress: progressBefore('S9-01', { gameMode: 'members', levels: Object.fromEntries(SKILL_NAMES.map((skill) => [skill, 30])) }) }, '#/skills');
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
      progress: progressBefore('S5-01', { gameMode: 'f2p', levels: stats }),
      localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      status: { protocol: 6, inGame: true, player: 'Processing kit', activeStepId: 'S5-01', stats, ...gear, ...(sample.quests ? { questsDone: sample.quests } : {}) },
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
    progress: progressBefore('S5-01', { gameMode: 'f2p', levels: stats }),
    localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
    status: { protocol: 6, inGame: true, player: 'Cooking catch', activeStepId: 'S5-01', stats, ...gear },
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

async function trainingScopeScenarios(browser: Browser) {
  for (const [mode, level, freeOnly, expectedTool] of [
    ['f2p', 11, true, 'Black axe'], ['members', 61, true, 'Rune axe'], ['members', 61, false, 'Dragon axe'],
  ] as const) {
    const stats = { woodcutting: level, attack: 1, strength: 1, defence: 1, hitpoints: 10 };
    const gear = { equipment: [], inventory: [], coins: 0, bankCoins: 0 };
    const items = ['Bronze axe', 'Iron axe', 'Steel axe', 'Black axe', 'Mithril axe', 'Adamant axe', 'Rune axe', 'Dragon axe']
      .map(name => ({ name, carried: 0, noted: 0, bank: mode === 'f2p' ? Number(name === 'Black axe') : Number(['Rune axe', 'Dragon axe'].includes(name)) }));
    const { page, errors } = await open(browser, 1280, {
      market: true, progress: progressBefore('S5-01', { gameMode: mode, levels: stats }),
      localStorage: { 'osrs-put:active-step': 'S5-01', 'osrs-put:skill-track': JSON.stringify({ skill: 'woodcutting', mode: 'fast', freeOnly, target: level + 4 }) },
      status: { protocol: 6, inGame: true, player: 'Scoped Tool', activeStepId: 'S5-01', questsDone: [], stats, ...gear },
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
      progress: progressBefore('S5-01', { gameMode: 'f2p', levels: { fishing: 45 } }),
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
    expect(await noOverflow(page) && !errors.length, `method map (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

// "What to train with": the balanced choice by default (2.69), with no mode switch on the card; the time estimate shows for everyone (2.94.3).
async function whatToTrainWith(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S1-09', { levels: { woodcutting: 32 } }),
    status: { stats: { woodcutting: 32 } },
    events: [{ type: 'STATS', stats: { woodcutting: 32 } }],
  }, '#/skills/WC');
  await waitFor(page, '.training', 5000);
  const calm = await text(page, '.training');
  expect(calm.includes('Willow') && /⏱ .+ to \d+/.test(calm) && await page.locator('.training').getByRole('button', { name: /Calm|Efficient/ }).count() === 0, `what to train with: at level 32 — willows with a time estimate on Balanced, no mode switch on the card (${calm.slice(0, 160)})`);
  expect(await noOverflow(page), 'what to train with: no horizontal scrolling');
  // The method priority is the skill card's own choice (2.93: the Settings copy is retired).
  await page.getByRole('group', { name: 'Training priority' }).getByRole('button', { name: 'XP', exact: true }).click();
  await settle(page);
  const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { efficient?: boolean; profitTraining?: boolean });
  expect(feat.efficient === true && feat.profitTraining === false, 'training choices: "XP" (fastest) on the skill card is remembered');
  await page.goto(`${BASE}#/skills/WC`);
  await waitFor(page, '.training', 5000);
  // No planner need: the goal is where the engine changes method, Willow trees until Teak trees take over at 41.
  const head = await text(page, '.page-head');
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  const note = await text(page, '.focus-note');
  expect(head.includes('Goal 41') && note.includes('switches to Teak trees'), `what to train with: the default goal is the engine's next method (${head} / ${note})`);
  // An explicit goal past the rune axe (41): the time is a forecast across the plan with the planned axe.
  await page.goto(`${BASE}#/skills/WC/woodcutting?goal=50`);
  await waitFor(page, '.training', 5000);
  const fast = await text(page, '.training');
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
  'training-scope': trainingScopeScenarios,
  'fishing-step': fishingStep,
  'what-to-train-with': whatToTrainWith,
};
