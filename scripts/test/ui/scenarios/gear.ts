// Gear: scenarios of the browser suite (npm run test:ui -- --only gear).
import type { Browser, Page } from 'playwright';
import { progressBefore, open, settle, expect, noOverflow, text } from '../harness.ts';

// The Gear page in its four states (2.68): one recommendation from what is owned, no worthwhile change, offline with the last known gear of
// the character, and offline with nothing known. At most one action; nothing empty is drawn.
async function gearScenarios(browser: Browser) {
  console.log('gear');
  const item = (id: number, name: string, slot: string) => ({ id, name, slot });
  const BRONZE = item(1321, 'Bronze scimitar', 'weapon');
  const RUNE = item(1333, 'Rune scimitar', 'weapon');
  const STRENGTH = item(1725, 'Amulet of strength', 'amulet');
  const live = (equipment: { id: number; name: string; slot: string }[], stats: Record<string, number>, coins: number, bank: { name: string; bank: number }[] = []) => {
    const gear = { equipment, inventory: [], coins, bankCoins: 0 };
    return {
      progress: progressBefore('S4-02'), localStorage: { 'osrs-put:active-step': 'S4-02' }, market: true,
      status: { protocol: 6, inGame: true, player: 'Gear Test', activeStepId: 'S4-02', ...gear, stats },
      events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: bank.map((b) => ({ name: b.name, carried: 0, noted: 0, bank: b.bank })) }],
    };
  };
  const shot = async (page: Page, name: string) => {
    if (process.env.UI_SHOTS) await page.locator('.gear-page').screenshot({ path: `${process.env.UI_SHOTS}/gear-${name}.png` }).catch(() => {});
  };
  for (const width of [1440]) {
    // What is owned beats a purchase: the Mithril scimitar in the bank is the one recommendation, the rest folded.
    {
      const { page, errors } = await open(browser, width, live([BRONZE], { attack: 20, strength: 20, defence: 1, hitpoints: 25 }, 5000, [{ name: 'Mithril scimitar', bank: 1 }]), '#/gear');
      await settle(page);
      const head = await text(page, '.gear-page .page-head');
      const reco = await text(page, '.gear-reco');
      // The opponent of the step in effect: Brutus, and Gear judges against him.
      expect(/For S4-02: Brutus, attacks with \w+/.test(head), `gear (${width} px): the context names the fight in the plan in effect and the style that hits`);
      expect(await page.locator('.gear-reco').count() === 1 && /Mithril scimitar/.test(reco) && /bank/i.test(reco), `gear (${width} px): one recommendation, to wear the scimitar from the bank`);
      expect(!/faster/.test(reco), `gear (${width} px): accuracy is not called speed`);
      expect(/Bronze scimitar/.test(await text(page, '.gear-now')), `gear (${width} px): what is worn now is shown`);
      expect(await page.locator('.gear-page .btn-primary').count() <= 1, `gear (${width} px): at most one primary button`);
      expect(await page.locator('details.gear-more[open]').count() === 0, `gear (${width} px): the other options, numbers and future unlocks are folded`);
      expect(await noOverflow(page), `gear (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `reco-${width}`);
      await page.context().close();
    }
    // Best wearable weapon/amulet and nothing to reserve on the planner's road (2.82.2: the guide's next steps no longer
    // add supplies): no change, the next real step up with its shortfall, no purchase button, no invented budget warning.
    // The warning for supplies that cannot be priced is checked in the case below.
    {
      const { page, errors } = await open(browser, width, live([RUNE, STRENGTH], { attack: 40, strength: 40, defence: 1, hitpoints: 40 }, 0), '#/gear');
      await settle(page);
      const reco = await text(page, '.gear-reco');
      expect(/No worthwhile change for this fight/.test(reco) && /Iron chainbody: 210 gp short/.test(reco) && await page.locator('.gear-reco .btn').count() === 0, `gear none (${width} px): no change, the next step up, no purchase button`);
      expect(!/not fully checked/.test(reco) && reco.split('No worthwhile change').length === 2, `gear none (${width} px): said once, no budget warning without a supply`);
      expect(await noOverflow(page), `gear none (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear none (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `none-${width}`);
      await page.context().close();
    }
    // Unknown supply costs cannot become a best-affordable-kit verdict.
    {
      const fixture = live([RUNE, STRENGTH], { attack: 40, strength: 40, defence: 1, hitpoints: 40 }, 5000);
      const { page } = await open(browser, width, { ...fixture, marketUnavailable: true }, '#/gear');
      await settle(page);
      const recommendation = await text(page, '.gear-reco');
      expect(recommendation.includes('Supply budget not fully checked') && !/best you can wear and afford/.test(recommendation), 'gear: unknown supplies do not produce an affordable-kit verdict');
      await page.context().close();
    }
    // Offline with a snapshot: keep the character and stale-state disclosure, without rendering its internal timestamp.
    {
      const at = Date.now() - 3 * 3600_000;
      const snap = { byPlayer: { 'gear test': { at, player: 'Gear Test', gear: { equipment: [RUNE, STRENGTH], inventory: [], coins: 120, bankCoins: 4000 } } } };
      const { page, errors } = await open(browser, width, { offline: true, progress: progressBefore('S4-02'), localStorage: { 'osrs-put:active-step': 'S4-02', 'osrs-put:last-gear': JSON.stringify(snap) } }, '#/gear');
      await settle(page);
      const now = await text(page, '.gear-now');
      expect(/Last known/.test(now) && /Gear Test/.test(now) && /Rune scimitar/.test(now) && /Amulet of strength/.test(now), `gear offline (${width} px): the last known gear is named`);
      expect(!/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(now), `gear offline (${width} px): the snapshot date is not rendered`);
      expect(await page.locator('.gear-worn-list.is-stale').count() === 1, `gear offline (${width} px): the snapshot looks like one`);
      expect(await page.locator('.gear-reco').count() === 0 && await page.locator('.gear-connect').count() === 0, `gear offline (${width} px): no recommendation from old data, no second notice`);
      expect(await noOverflow(page), `gear offline (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear offline (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `offline-${width}`);
      await page.context().close();
    }
    // Offline with nothing known: one short card, no empty slots or panels.
    {
      const { page, errors } = await open(browser, width, { offline: true, progress: progressBefore('S4-02'), localStorage: { 'osrs-put:active-step': 'S4-02' } }, '#/gear');
      await settle(page);
      expect(/RuneLite is not connected/.test(await text(page, '.gear-connect')), `gear connect (${width} px): the connection card`);
      expect(await page.locator('.gear-now').count() === 0 && await page.locator('.gear-reco').count() === 0 && await page.locator('details.gear-more').count() === 0, `gear connect (${width} px): no empty panels around it`);
      expect(await noOverflow(page), `gear connect (${width} px): no horizontal scroll`);
      expect(!errors.length, `gear connect (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `connect-${width}`);
      await page.context().close();
    }
  }
}

async function gearPage(browser: Browser) {
  const oldGear = { equipment: [{ id: 1329, name: 'Mithril scimitar', slot: 'weapon' }], inventory: [], coins: 100, bankCoins: 200 };
  const newGear = { ...oldGear, equipment: [{ id: 1331, name: 'Adamant scimitar', slot: 'weapon' }] };
  const { page, errors } = await open(browser, 1280, {
    progress: progressBefore('S4-01'),
    status: { protocol: 6, player: 'Session Test', stats: { attack: 22, strength: 20, defence: 1 }, ...oldGear },
    // The game shows the S4-01 fight: with no quest data the Decision waits, and no route order stands in for it (v14).
    localStorage: { 'osrs-put:active-step': 'S4-01' },
  }, '#/gear');
  await page.getByRole('region', { name: 'Worn now', exact: true }).waitFor();
  await page.evaluate((gear) => {
    const w = window as unknown as { __holdStatus: boolean; __emit: (e: unknown) => void };
    w.__holdStatus = true;
    w.__emit({ type: 'STATUS', inGame: true, player: 'Session Test' });
    w.__emit({ type: 'STATS', stats: { attack: 30, strength: 20, defence: 1 } });
    w.__emit({ type: 'GEAR', gear });
  }, newGear);
  await page.evaluate(() => (window as unknown as { __releaseStatus: () => void }).__releaseStatus());
  await settle(page);
  expect((await page.getByRole('region', { name: 'Worn now', exact: true }).innerText()).includes('Adamant scimitar') && (await page.locator('.gear-context').innerText()).includes('Attack 30'), 'session: a delayed status cannot overwrite newer gear or skill events');
  await page.evaluate(() => {
    const w = window as unknown as { __emit: (e: unknown) => void; __status: unknown; __releaseStatus: () => void; __releaseOldStatus: () => void };
    w.__emit({ type: 'STATUS', inGame: true, player: 'Session Test' });
    w.__releaseOldStatus = w.__releaseStatus;
    w.__status = { inGame: false, player: null };
    w.__emit({ type: 'STATUS', inGame: false, player: 'Session Test' });
    w.__emit({ type: 'GEAR', gear: { equipment: [{ id: 1331, name: 'Adamant scimitar', slot: 'weapon' }], inventory: [], coins: 999 } });
  });
  await settle(page);
  expect(await page.getByRole('region', { name: 'Worn now', exact: true }).count() === 0 && (await page.locator('.gear-page').innerText()).includes('Waiting for your character'), 'session: logout with SSE open clears live equipment and ignores post-logout gear');
  await page.evaluate(() => (window as unknown as { __releaseOldStatus: () => void }).__releaseOldStatus());
  await settle(page);
  expect(await page.getByRole('region', { name: 'Worn now', exact: true }).count() === 0, 'session: an old in-game reply cannot restore a logged-out character');
  await page.evaluate((gear) => {
    const w = window as unknown as { __emit: (e: unknown) => void };
    w.__emit({ type: 'STATUS', inGame: true, player: 'Other Hero' });
    w.__emit({ type: 'STATS', stats: { attack: 99, strength: 99, defence: 99 } });
    w.__emit({ type: 'GEAR', gear });
    w.__emit({ type: 'STEP_AUTO_COMPLETED', stepId: 'S4-01' });
  }, newGear);
  await settle(page);
  expect(await page.getByRole('region', { name: 'Worn now', exact: true }).count() === 0, 'session: another character is not presented as the active profile live loadout');
  expect(await page.evaluate(() => {
    const p = JSON.parse((window as unknown as { __saved: string }).__saved);
    return p.levels.attack !== 99 && p.steps['S4-01'] !== 'done';
  }), 'session: same-batch stats and auto-completion from a different character cannot overwrite this profile');
  expect(await noOverflow(page) && !errors.length, 'session: async changes do not crash or overflow the interface');
  await page.context().close();
}

// Gear: a Coif in the bank at 17 Ranged — "you have it but cannot wear it", not advice to wear it.
async function coifInBank(browser: Browser) {
  const width = 1100;
  const gear = { equipment: [{ id: 1325, name: 'Steel scimitar', slot: 'weapon' }], inventory: [], coins: 500, bankCoins: 3000 };
  const stats = { attack: 20, strength: 20, defence: 1, ranged: 17 };
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S4-02'),
    status: { ...gear, stats, activeStepId: 'S4-02' },
    // The game shows the fight step: with no quest data the Decision waits, and no route order stands in for it (v14).
    localStorage: { 'osrs-put:active-step': 'S4-02' },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Coif', carried: 0, noted: 0, bank: 1 }] }],
  }, '#/gear');
  // Future unlocks are folded since 2.68: opened, the lock is there.
  await page.locator('#gear-roadmap > summary').click();
  const t = await text(page, '.gear-locked');
  expect(t.includes('needs 20 Ranged') && t.includes('Coif') && t.includes('cannot be worn yet'), 'gear: 🔒 Coif — needs 20 Ranged, lies in the bank');
  if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/gear-${width}.png`, fullPage: true }).catch(() => {});
  expect(!(await text(page, '.gear-page')).includes('Wear Coif'), 'gear: it is not advised to wear the Coif');
  // No exchange prices here: an exchange upgrade is neither called beyond the money nor is the kit called the best the money buys.
  const more = page.locator('.gear-more', { hasText: 'Other options' });
  if (await more.count()) await more.locator('summary').click();
  const goals = await text(page, '.gear-page');
  const reco = await text(page, '.gear-reco');
  expect(goals.includes('The price is not known yet') && !goals.includes('Better than what your money allows') && !/best you can wear and afford/.test(reco), 'gear: without exchange prices nothing is called beyond or within your money');
  expect(!/faster/.test(reco), 'gear: the recommendation never says "faster" unless the attack interval changes');
  expect(await noOverflow(page), 'gear: no horizontal scrolling');
  expect(!errors.length, `gear: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'gear': gearScenarios,
  'gear-page': gearPage,
  'coif-in-bank': coifInBank,
};
