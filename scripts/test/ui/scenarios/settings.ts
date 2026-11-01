// Settings, saves and recovery: scenarios of the browser suite (npm run test:ui -- --only settings).
import type { Browser } from 'playwright';
import { progressBefore, open, settle, expect, noOverflow, waitFor, text } from '../harness.ts';

async function dateFreeSettingsScenarios(browser: Browser) {
  for (const width of [1280]) {
    const progress = { version: 3, steps: { 'S1-01': 'done' }, levels: {}, notes: { 'S1-01': 'Keep this note' }, updatedAt: '2001-02-03T04:05:06.000Z', gameMode: 'f2p' };
    const { page, errors } = await open(browser, width, { offline: true, progress, localStorage: { 'osrs-put-settings-tab': 'progress' } }, '#/settings');
    const transfer = page.locator('section').filter({ has: page.getByRole('button', { name: 'Export progress', exact: true }) });
    expect(!/2001|changed \d/.test(await transfer.innerText()), `dates (${width}): the normal progress view omits its saved date`);
    await page.locator('input[type="file"]').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'osrs-put', ...progress })) });
    const preview = page.locator('.notice').filter({ hasText: 'In the file:' });
    await preview.waitFor();
    expect((await preview.innerText()).includes('1 done') && !/2001|saved \d/.test(await preview.innerText()), `dates (${width}): import still previews contents without exposing its date`);
    await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved));
    expect(saved.updatedAt === progress.updatedAt && saved.notes['S1-01'] === 'Keep this note', `dates (${width}): internal save ordering metadata and notes remain intact`);
    expect(await noOverflow(page) && !errors.length, `dates (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function accountSyncProofScenarios(browser: Browser) {
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, {
      progress: { version: 3, steps: { 'S1-04': 'skipped' }, levels: {}, notes: { 'S1-01': 'Keep this note' }, gameMode: 'f2p' },
      localStorage: { 'osrs-put-settings-tab': 'progress' },
      status: { protocol: 6, inGame: true, player: 'Sync Proof', questsDone: ['Goblin Diplomacy'] },
      events: [{ type: 'QUESTS', done: ['Goblin Diplomacy'] }],
    }, '#/settings');
    await settle(page);
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Account sync', exact: true }) });
    const automatic = await card.locator(':scope > ul > li code').allTextContents();
    expect(automatic.join(',') === 'S2-12', `sync proof (${width}): only the observed quest is game-confirmed`);
    const manual = await card.locator('details ul').textContent();
    expect(!!manual?.includes('S2-01') && !manual?.includes('S2-10'), `sync proof (${width}): shopping stays unverified and the contradicted quest is excluded`);
    await card.getByRole('button', { name: /^Mark \d+ steps$/ }).click();
    await settle(page);
    const saved = await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved));
    expect(saved.steps['S2-12'] === 'done' && !saved.steps['S2-10'] && !saved.steps['S2-01'], `sync proof (${width}): applying sync cannot mark inferred ancestors`);
    expect(saved.steps['S1-04'] === 'skipped' && saved.notes['S1-01'] === 'Keep this note', `sync proof (${width}): existing skips and notes remain intact`);
    expect(await noOverflow(page) && !errors.length, `sync proof (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function recovery(browser: Browser) {
  // Recovery uses the real StoreProvider: a parser test alone would not catch its automatic save overwriting a valid source.
  {
    const progress = progressBefore('S3-05', { notes: { 'S3-05': 'recovered from disk' } });
    const { page, errors } = await open(browser, 1280, { offline: true, progress, localStorage: { 'osrs-put:progress': '{broken' } }, '#/settings');
    const saved = await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved));
    expect(saved.notes['S3-05'] === 'recovered from disk', 'progress recovery: damaged browser storage cannot beat the valid file');
    expect(await page.evaluate(() => localStorage.getItem('osrs-put:progress:recovery:local')) === '{broken', 'progress recovery: the damaged source is kept');
    expect(await page.locator('.progress-storage-warning').count() === 0 && !errors.length, 'progress recovery: recovered progress saves normally without errors');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { offline: true, progress: { ...progressBefore('S3-05'), version: 99 } }, '#/settings');
    expect(await page.locator('.progress-storage-warning').isVisible(), 'progress recovery: unsupported file shows a saving-paused warning');
    expect(await page.evaluate(() => (window as unknown as { __saved?: string }).__saved === undefined), 'progress recovery: an unsupported save is not automatically overwritten');
    expect(!errors.length, 'progress recovery: unsupported format does not crash the page');
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    const imported = progressBefore('S4-03', { notes: { 'S4-03': 'explicit compatible import' } });
    await page.locator('input[type="file"]').setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await settle(page);
    expect(await page.locator('.progress-storage-warning').count() === 0, 'progress recovery: explicit compatible import resumes saving');
    expect(await page.evaluate(() => JSON.parse((window as unknown as { __saved: string }).__saved).notes['S4-03']) === 'explicit compatible import', 'progress recovery: the explicitly imported progress is saved');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress:recovery:file')!).version) === 99, 'progress recovery: explicit import retains the unsupported original');
    await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, reset everything', exact: true }).click();
    await settle(page);
    expect(await page.evaluate(() => Object.keys(JSON.parse((window as unknown as { __saved: string }).__saved).steps).length) === 0, 'progress recovery: explicit reset saves a fresh state after recovery');
    expect(!errors.length, 'progress recovery: import and reset have no page errors');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { offline: true, progress: progressBefore('S3-05') }, '#/settings');
    const before = await page.evaluate(() => (window as unknown as { __saved: string }).__saved);
    await page.evaluate(() => {
      const bad = JSON.stringify({ version: 99, steps: {} });
      localStorage.setItem('osrs-put:progress', bad);
      window.dispatchEvent(new StorageEvent('storage', { key: 'osrs-put:progress', newValue: bad }));
    });
    await settle(page);
    expect(await page.locator('.progress-storage-warning').isVisible(), 'progress recovery: an unsupported cross-window update pauses saving');
    expect(await page.evaluate(() => (window as unknown as { __saved: string }).__saved) === before, 'progress recovery: cross-window corruption cannot overwrite the working file');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:progress:recovery:local')!).version) === 99 && !errors.length, 'progress recovery: the cross-window source is preserved without a crash');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, {
      oversizedSnapshot: true, progress: progressBefore('S3-05'), status: { protocol: 6, pluginVersion: '2.74.0', activeStepId: 'S3-05' },
      localStorage: { 'osrs-put:active-step': 'S3-05' },
    }, '#/step/S3-05');
    await page.getByText(/The game guide could not sync: its data exceeds/).waitFor({ timeout: 5000 });
    expect(await page.locator('.bridge-indicator.is-online').count() === 1, 'bridge limits: snapshot 413 does not mark a reachable game offline');
    expect(!errors.length, 'bridge limits: snapshot refusal has an explanation without a page crash');
    await page.context().close();
  }
  {
    const { page, errors } = await open(browser, 1280, { offline: true, fileWriteFailure: true, progress: progressBefore('S2-07'), }, '#/step/S2-07');
    expect((await text(page, '.progress-storage-warning')).includes('desktop file could not be written'), 'save failure: working browser storage does not hide a failed desktop write');
    await page.evaluate(() => { const w = window as unknown as Record<string, unknown>; w.__fileWriteFailure = false; w.__holdSave = true; });
    await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
    await settle(page);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__holdSave = false; });
    // A second edit has a newer successful acknowledgement than the first edit's delayed failure.
    await page.getByRole('button', { name: /^(Done|Mark as done|Mark as manually completed)/ }).first().click();
    await settle(page);
    await page.evaluate(() => { ((window as unknown as { __releaseSave?: () => void }).__releaseSave)?.(); });
    await settle(page);
    expect(await page.locator('.progress-storage-warning').count() === 0, 'save retry: an old delayed failure cannot overwrite the newer successful write');
    expect(await noOverflow(page) && !errors.length, 'save failure/retry: no overflow or console errors');
    await page.context().close();
  }
  {
    const damaged = '{"active":"alt","list":[null]}';
    const { page, errors } = await open(browser, 1280, {
      offline: true, localStorage: { 'osrs-put:profiles': damaged },
      profileFile: { active: 'main', list: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Recovered alt', player: 'Alt tester' }] },
    }, '#/settings');
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    const names = await page.locator('.profile-list strong').allInnerTexts();
    expect(names.includes('Recovered alt'), 'profile recovery: a valid native alternate profile survives damaged browser rows');
    expect(await page.evaluate(() => (window as unknown as { __savedProfiles?: string }).__savedProfiles === undefined), 'profile recovery: reading the damaged source does not mirror a default over the native file');
    expect(await page.evaluate(() => localStorage.getItem('osrs-put:profiles:recovery')) === damaged, 'profile recovery: damaged browser rows are retained');
    expect(await noOverflow(page) && !errors.length, 'profile recovery: no overflow or console errors');
    await page.context().close();
  }
  for (const width of [1280]) {
    const profiles = { active: 'main', list: [{ id: 'main', name: 'Main', player: 'Profile test' }] };
    const { page, errors } = await open(browser, width, {
      profileFile: { version: 99, list: [] },
      localStorage: { 'osrs-put:profiles': JSON.stringify(profiles) },
      progress: progressBefore('S3-08', { levels: { attack: 30 } }),
      status: { protocol: 6, player: 'Profile test', stats: { attack: 99 } },
      events: [{ type: 'STATS', stats: { attack: 99 } }],
    }, '#/settings');
    expect(await page.locator('.profile-storage-warning').count() === 1, `profile protection (${width}): one actionable recovery warning`);
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    expect(await page.getByRole('textbox', { name: 'New profile name', exact: true }).isDisabled(), `profile protection (${width}): unsafe profile edits are disabled`);
    expect(await page.evaluate(() => (window as unknown as { __savedProfiles?: string }).__savedProfiles === undefined), `profile protection (${width}): the valid browser source does not overwrite the unknown native format`);
    expect(await page.evaluate(() => JSON.parse((window as unknown as { __saved?: string }).__saved ?? localStorage.getItem('osrs-put:progress') ?? '{}').levels?.attack !== 99), `profile protection (${width}): game levels are not imported into a protected profile`);
    expect(await noOverflow(page) && !errors.length, `profile protection (${width}): no overflow or console errors`);
    if (process.env.UI_ONLY === 'stabilization') await page.screenshot({ path: `audit-temp/profile-protected-${width}.png` });
    await page.context().close();
  }
  for (const width of [1280]) {
    const browserProfiles = { active: 'main', list: [{ id: 'main', name: 'Main', player: 'Profile test' }] };
    const nativeProfiles = { ...browserProfiles, list: [...browserProfiles.list, { id: 'alt', name: 'Native only', player: 'Other hero' }] };
    const { page, errors } = await open(browser, width, {
      profileFile: nativeProfiles,
      localStorage: { 'osrs-put:profiles': JSON.stringify(browserProfiles) },
      progress: progressBefore('S3-08', { levels: { attack: 30 } }),
      status: { protocol: 6, player: 'Profile test', stats: { attack: 99 } },
      events: [{ type: 'STATS', stats: { attack: 99 } }],
    }, '#/settings');
    expect(await page.locator('.profile-storage-warning').count() === 1 && (await text(page, '.profile-storage-warning')).includes('saved profile lists disagree'), `profile conflict (${width}): one warning explains the conflict between supported lists`);
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    expect(await page.getByRole('textbox', { name: 'New profile name', exact: true }).isDisabled(), `profile conflict (${width}): profile edits stay paused`);
    expect(await page.evaluate(() => (window as unknown as { __savedProfiles?: string }).__savedProfiles === undefined), `profile conflict (${width}): no supported list overwrites the other`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:profiles:recovery:file')!).list.some((p: { id: string }) => p.id === 'alt')), `profile conflict (${width}): the native-only character is preserved`);
    expect(await page.evaluate(() => JSON.parse((window as unknown as { __saved?: string }).__saved ?? localStorage.getItem('osrs-put:progress') ?? '{}').levels?.attack !== 99), `profile conflict (${width}): game levels cannot write into an unresolved account`);
    expect(await noOverflow(page) && !errors.length, `profile conflict (${width}): no overflow or console errors`);
    if (process.env.UI_ONLY === 'stabilization') await page.screenshot({ path: `audit-temp/profile-conflict-${width}.png` });
    await page.context().close();
  }
  for (const width of [1280]) {
    const profiles = { active: 'main', list: [{ id: 'main', name: 'Main' }] };
    const { page, errors } = await open(browser, width, {
      offline: true, profileFile: profiles, profileWriteFailure: true,
      localStorage: { 'osrs-put:profiles': JSON.stringify(profiles) },
    }, '#/settings');
    await page.getByRole('tab', { name: 'Progress and copies', exact: true }).click();
    await page.getByRole('textbox', { name: 'New profile name', exact: true }).fill('Unsaved alt');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    expect(await page.locator('.profile-write-warning').count() === 1 && (await page.locator('.profile-list strong').allInnerTexts()).length === 1, `profile write (${width}): failed native create shows one warning without accepting or switching the profile`);
    expect(await page.getByRole('textbox', { name: 'New profile name', exact: true }).inputValue() === 'Unsaved alt', `profile write (${width}): failed creation retains the player's input`);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__profileWriteFailure = false; });
    await page.getByRole('button', { name: 'Retry profile save', exact: true }).click();
    expect(await page.locator('.profile-write-warning').count() === 0 && (await page.locator('.profile-list strong').allInnerTexts()).includes('Unsaved alt'), `profile write (${width}): retry confirms and publishes the intended profile`);
    expect(await noOverflow(page) && !errors.length, `profile write (${width}): no overflow or console errors`);
    if (process.env.UI_ONLY === 'stabilization') await page.screenshot({ path: `audit-temp/profile-write-retry-${width}.png` });
    await page.context().close();
  }
}

// 2.12: another character does not write into the active profile and gets an offer; XP from the game is visible on the skill page.
async function otherCharacter(browser: Browser) {
  const width = 1100;
  const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] });
  const { page, errors } = await open(browser, width, {
    localStorage: { 'osrs-put:profiles': profiles },
    status: { protocol: 5, pluginVersion: '2.12.0', player: 'Beta Two', xp: { woodcutting: 10, strength: 0 } },
  }, '#/skills/WC');
  await waitFor(page, '.plaque-warning', 5000);
  const t = await text(page, '.plaque-warning');
  expect(t.includes('new character') && t.includes('Beta Two'), 'profile: another character — an offer to create a profile');
  expect(!errors.length, `profile: no console errors ${errors.join('; ')}`);
  await page.context().close();

  const ok = await open(browser, width, {
    localStorage: { 'osrs-put:profiles': profiles },
    status: { protocol: 5, pluginVersion: '2.12.0', player: 'Alpha One', xp: { woodcutting: 10 } },
  }, '#/skills/WC');
  await ok.page.getByRole('tab', { name: 'Reference', exact: true }).click();
  await waitFor(ok.page, '.live-xp', 5000);
  const x = await text(ok.page, '.live-xp');
  expect(x.includes('to ') && x.includes('XP left'), 'skill: XP from the game — "N XP left to the level"');
  expect((await ok.page.locator('.plaque-warning').count()) === 0, 'profile: the own character — no warning');
  await ok.page.context().close();
}

// 2.19.2: the resource journal lives between sessions — the records of the earlier launch are in place, another character's is not visible, clearing works.
async function resourceJournal(browser: Browser) {
  const width = 1100;
  const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] });
  const now = Date.now();
  const rows = [
    { name: 'Coins', quantityDelta: 5000, reason: 'LOOT', timestamp: now - 3 * 24 * 3600_000, estimatedGpValue: 5000 },
    { name: 'Cowhide', quantityDelta: 10, reason: 'LOOT', timestamp: now - 3 * 24 * 3600_000, estimatedGpValue: 1000 },
  ];
  const key = (who: string) => `osrs-put:ledger:main:${who}`;
  const { page, errors } = await open(browser, width, {
    localStorage: { 'osrs-put:profiles': profiles, [key('alpha one')]: JSON.stringify(rows), [key('beta two')]: JSON.stringify(rows.slice(0, 1)) },
    status: { protocol: 5, pluginVersion: '2.20.0', player: 'Alpha One' },
  }, '#/settings');
  await page.getByRole('tab', { name: 'Progress and copies' }).click();
  await waitFor(page, '.ledger-block', 5000);
  const t = await text(page, '.ledger-block');
  expect(t.includes('entries 2') && t.includes('Coins +'), 'journal: the records of the earlier launch are in place');
  await page.getByRole('button', { name: 'Clear the journal' }).click();
  await page.getByRole('button', { name: 'Yes, clear the journal' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('The resource journal is empty'), null, { timeout: 5000 });
  const left = await page.evaluate((k) => ({ a: localStorage.getItem(k.a), b: localStorage.getItem(k.b) }), { a: key('alpha one'), b: key('beta two') });
  expect(left.a === null && left.b !== null, 'journal: clearing erases this character\'s journal and does not touch another\'s');
  expect(!errors.length, `journal: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'date-proof': dateFreeSettingsScenarios,
  'sync-proof': accountSyncProofScenarios,
  'recovery': recovery,
  'other-character': otherCharacter,
  'resource-journal': resourceJournal,
};
