// Shopping: scenarios of the browser suite (npm run test:ui -- --only shopping).
import { readFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright';
import { progressBefore, open, settle, expect, noOverflow, text } from '../harness.ts';

// Another way to do the Hill Giants step: the character with 24 hitpoints and Defence 1 is offered a split (cows for Attack, then the giants for the bones).
// Adopting it moves the arrow, the pace line and the food to the cows for the app and the game alike, and leaves the route's own step open; going back undoes it.
// Shopping 2.67: one list for the step in progress, grouped by what to do; each state said as what it is (lib/shoppingView.ts).
async function shoppingScenarios(browser: Browser) {
  console.log('shopping');
  const scim = { id: 1329, name: 'Mithril scimitar', slot: 'weapon' };
  const requirements = (JSON.parse(readFileSync(new URL('../../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { anyOf?: string[] }[] }[])
    .find(step => step.id === 'S3-08')!.itemsRequired ?? [];
  const absentAlternatives = [...new Set(requirements.flatMap(item => item.anyOf ?? []))].map(name => ({ name, carried: 0, noted: 0, bank: 0 }));
  const base = (o: { worn?: boolean; coins?: number; bankSeen?: boolean; items?: { name: string; carried: number; noted: number; bank?: number }[]; offline?: boolean }) => {
    const gear = { equipment: o.worn ? [scim] : [], inventory: [], coins: o.coins ?? 100, bankCoins: o.bankSeen === false ? null : 0 };
    return {
      progress: progressBefore('S3-08'),
      localStorage: { 'osrs-put:active-step': 'S3-08', 'osrs-put:shopping-scope': 'step' },
      market: true,
      ...(o.offline ? { offline: true } : {
        status: { protocol: 6, inGame: true, player: 'Shop Test', activeStepId: 'S3-08', questPoints: 20, totalLevel: 120, ...gear },
        events: [{ type: 'OWNED', bankSeen: o.bankSeen !== false, items: o.items ?? [] }, { type: 'GEAR', gear }],
      }),
    };
  };
  const shot = async (page: Page, name: string) => {
    if (process.env.UI_SHOTS) await page.locator('.shop-page').screenshot({ path: `${process.env.UI_SHOTS}/shopping-${name}.png` }).catch(() => {});
  };
  for (const width of [1440]) {
    // Real shortages: the purchases, the money short, the way to the coin plan, the exchange list.
    {
      const { page, errors } = await open(browser, width, base({ items: [...absentAlternatives, { name: 'Mithril scimitar', carried: 0, noted: 0, bank: 0 }, { name: 'Salmon', carried: 0, noted: 0, bank: 5 }] }), '#/shopping');
      await settle(page);
      const body = await text(page, '.shop-page');
      expect(/Buy (at the Grand Exchange|in shops) · [12]/.test(body) && /Salmon[^]*×15/.test(body) && /5 more in the bank/.test(body), `shopping (${width} px): the buy list with the bank stock named`);
      expect(/Shortfall[^]*[\d,]+ gp/.test(body) && await page.getByRole('link', { name: 'Prepare funding', exact: true }).count() === 1 && await page.locator('.shop-page .btn-primary').count() === 1, `shopping (${width} px): the shortfall links to the coin plan`);
      expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 1, `shopping (${width} px): one copy button for the exchange purchases`);
      expect(!/Still open|Partly owned|Unverified/.test(body), `shopping (${width} px): no status filter bar`);
      expect(/Bag and bank checked in this session/.test(body), `shopping (${width} px): the sync line says what was read`);
      expect(await noOverflow(page), `shopping (${width} px): no horizontal scroll`);
      expect(!errors.length, `shopping (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `missing-${width}`);
      await page.context().close();
    }
    // Everything owned: worn and in the bag. The way back to the step, no copy button, no budget.
    {
      const { page, errors } = await open(browser, width, base({ worn: true, items: [{ name: 'Mithril scimitar', carried: 1, noted: 0, bank: 0 }, { name: 'Salmon', carried: 20, noted: 0, bank: 0 }] }), '#/shopping');
      await settle(page);
      const body = await text(page, '.shop-page');
      expect(/Everything for this step is with you/.test(body) && await page.getByRole('link', { name: 'Review preparation', exact: true }).count() === 1 && await page.locator('.shop-page .btn-primary').count() === 1, `shopping all owned (${width} px): said, with the way back`);
      expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 0 && !/Purchases/.test(body), `shopping all owned (${width} px): no copy button, no budget`);
      expect(!errors.length, `shopping all owned (${width} px): no console errors ${errors.join('; ')}`);
      await shot(page, `owned-${width}`);
      await page.context().close();
    }
    // In the bank, not with you: take, not buy.
    {
      const { page } = await open(browser, width, base({ worn: true, items: [{ name: 'Mithril scimitar', carried: 1, noted: 0, bank: 0 }, { name: 'Salmon', carried: 0, noted: 0, bank: 30 }] }), '#/shopping');
      await settle(page);
      const body = await text(page, '.shop-page');
      expect(/Take from the bank · 1/.test(body) && /Take 20 from the bank/.test(body) && !/Buy (at the Grand Exchange|in shops) · /.test(body), `shopping bank (${width} px): a withdrawal, not a purchase`);
      expect(await page.getByRole('button', { name: /Copy the exchange list/ }).count() === 0, `shopping bank (${width} px): a withdrawal is not in the exchange list`);
      await page.context().close();
    }
    // The bank not opened: not confirmed, never "missing" or "owned".
    {
      const { page } = await open(browser, width, base({ bankSeen: false, items: [{ name: 'Salmon', carried: 3, noted: 0 }] }), '#/shopping');
      await settle(page);
      const body = await text(page, '.shop-page');
      expect(/Not confirmed · \d/.test(body) && /Open your bank in RuneLite to refresh/.test(body), `shopping unknown bank (${width} px): not confirmed, with the honest way to refresh`);
      expect((await page.getByRole('region', { name: 'Checkout', exact: true }).innerText()).includes('Not fully checked'), 'checkout: unread bank cash is not zero');
      expect(!/Everything for/.test(body), `shopping unknown bank (${width} px): no success message`);
      await shot(page, `unknown-${width}`);
      await page.context().close();
    }
    // Offline: said as offline, the steps' needs listed as not confirmed.
    {
      const { page } = await open(browser, width, base({ offline: true }), '#/shopping');
      await settle(page);
      const body = await text(page, '.shop-page');
      expect(/Offline — ownership not confirmed/.test(body) && !/Nothing to/.test(body), `shopping offline (${width} px): offline is said, not "nothing to buy"`);
      await shot(page, `offline-${width}`);
      await page.context().close();
    }
  }
}

async function shoppingQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const state of ['current', 'cached', 'missing']) {
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: state === 'missing', marketAgeMinutes: state === 'cached' ? 120 : undefined,
      progress: progressBefore('S4-04'), localStorage: { 'osrs-put:active-step': 'S4-04', 'osrs-put:shopping-scope': 'step' },
      status: { protocol: 6, inGame: true, player: 'Shopping Quotes', activeStepId: 'S4-04', coins: 100000, bankCoins: 0, equipment: [], inventory: [] },
      events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Lobster', carried: 0, noted: 0, bank: 0 }] }],
    }, '#/shopping');
    const row = page.locator('.shop-item-row').filter({ has: page.getByText('Lobster', { exact: true }) }).first();
    await row.waitFor({ state: 'visible' });
    await settle(page);
    const quote = await row.locator('.shop-cost').innerText();
    expect(state === 'missing' ? quote === 'Price unavailable' : quote.includes(state === 'cached' ? 'Cached GE estimate' : 'GE estimate'), `shopping quotes (${width}, ${state}): quantities use labelled market costs`);
    if (state === 'missing') expect((await text(page, '.shop-page')).includes('without a price'), `shopping quotes (${width}): excluded costs are disclosed`);
    expect(await noOverflow(page) && !errors.length, `shopping quotes (${width}, ${state}): no overflow or console errors`);
    await page.context().close();
  }
}

async function shoppingPage(browser: Browser) {
  const p = progressBefore('S2-07');
  p.steps['S2-06'] = 'skipped';
  const gear = { equipment: [], inventory: [{ id: 290, name: 'Research package', count: 1 }], coins: 100, bankCoins: 0 };
  const { page, errors } = await open(browser, 1280, {
    progress: p, status: { protocol: 6, player: 'Reserve Test', questsDone: [], accountType: 'normal', ...gear },
    events: [{ type: 'GEAR', gear }, { type: 'QUESTS', done: [] }], market: true,
  }, '#/shopping');
  await page.locator('.shop-cleanup > summary').click();
  const row = page.locator('.cleanup-row').filter({ hasText: 'Research package' });
  await row.waitFor();
  expect(await row.locator('.act-review').count() === 1 && await row.locator('.act-drop').count() === 0, 'cleanup: skipping a quest cannot authorize destruction of its quest item');
  await page.evaluate(() => (window as unknown as { __emit: (e: unknown) => void }).__emit({ type: 'QUESTS', done: ['Rune Mysteries'] }));
  await settle(page);
  expect(await row.locator('.act-drop').count() === 1 && (await row.innerText()).includes('Destroy'), 'cleanup: verified game completion can release the obsolete item');
  expect(await noOverflow(page) && !errors.length, 'cleanup reserves: no overflow or console errors');
  await page.context().close();
}

// Bulk shopping: "already have" changes "buy", is saved and goes into the exchange hint.
async function bulkShopping(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Clay', carried: 3, noted: 0, bank: 2 }] }],
  }, '#/shopping');
  // The stages the old page opened on: the next trip is the default now, a range is chosen.
  await page.getByRole('button', { name: 'Stages', exact: true }).click();
  await settle(page);
  const potion = page.locator('.shop-item-row', { hasText: 'Energy potion(4)' }).first();
  await potion.locator('.shop-why > summary').click();
  // Potions are marked in doses (2.73.0): 12 doses are three Energy potion(4) of the five, so 8 doses are left, bought as 2 potions.
  const input = potion.getByLabel('Energy potion(4): how many doses you already have');
  await input.fill('12');
  await input.press('Enter');
  await settle(page);
  const row = await page.locator('.shop-item-row', { hasText: 'Energy potion(4)' }).first().innerText();
  expect(/8 doses short/.test(row) && /Buy 2 × Energy potion\(4\)/.test(row), `shopping: 12 of 20 doses marked — 8 left, bought as 2 potions (${row.replace(/\s+/g, ' ').slice(0, 120)})`);
  const saved = await page.evaluate(() => JSON.parse(String((window as unknown as Record<string, unknown>).__saved ?? '{}')));
  expect(saved.ownedManual?.['dose:energy potion']?.count === 12, 'shopping: the mark "already have 12 doses" is saved in the progress');
  const plan = await page.evaluate(() => ((window as unknown as { __posts: { path: string; body: { items: { name: string; count: number }[] } }[] }).__posts)
    .filter((p) => p.path === '/shopping-plan').pop()?.body.items ?? []);
  expect(plan.find((i) => i.name === 'Energy potion(4)')?.count === 2, 'shopping: "buy 2" goes to the game, not 5');
  expect(plan.find((i) => i.name === 'Clay')?.count === 7, 'shopping: clay — by the game data, the plugin subtracts the 5 you own itself');
  expect(await noOverflow(page), 'shopping: no horizontal scrolling');
  expect(!errors.length, `shopping: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'shopping': shoppingScenarios,
  'shopping-quotes': shoppingQuoteScenarios,
  'shopping-page': shoppingPage,
  'bulk-shopping': bulkShopping,
};
