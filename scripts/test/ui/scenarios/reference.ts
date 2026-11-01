// The Reference and wiki dossier: scenarios of the browser suite (npm run test:ui -- --only reference).
import type { Browser } from 'playwright';
import { progressBefore, open, settle, expect, noOverflow, waitFor, text } from '../harness.ts';

async function dossierQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const quoteState of ['current', 'cached', 'missing']) {
    const unavailable = quoteState === 'missing';
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: unavailable, marketAgeMinutes: quoteState === 'cached' ? 120 : undefined, progress: progressBefore('S4-04'),
    }, '#/step/S4-04');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.locator('.search-input').fill('Lobster');
    const row = page.locator('.search-hit.is-item').filter({ has: page.getByText('Lobster', { exact: true }) }).first();
    await row.waitFor({ state: 'visible' });
    const searchQuote = await row.locator('.search-hit-price').innerText();
    expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `search quotes (${width}, ${quoteState}): labels fit inside the result row`);
    expect(unavailable ? searchQuote.includes('Price unavailable') : searchQuote.includes('GE estimate'), `search quotes (${width}, unavailable=${unavailable}): shared quote certainty`);
    if (quoteState === 'cached') expect(searchQuote.includes('Cached GE estimate'), `search quotes (${width}): old sides are explicitly cached`);
    await row.click();
    const drawer = page.locator('dialog.drawer[open]');
    await drawer.waitFor({ timeout: 6000 });
    await settle(page);
    const quote = await drawer.locator('.tile-ge').innerText();
    expect(unavailable ? quote.includes('Price unavailable') && !quote.includes(' gp') : quote.includes('GE estimate') && quote.includes('GE sell estimate'),
      `dossier quotes (${width}, unavailable=${unavailable}): current sides or quote absence, never a database fallback`);
    expect(!quote.includes('Not sold on the exchange'), `dossier quotes (${width}): no invented trade restriction`);
    if (quoteState === 'cached') expect(quote.includes('Cached GE estimate') && quote.includes('Cached GE sell estimate'), `dossier quotes (${width}): cached buy and sell labels`);
    if (unavailable) expect(await drawer.locator('.alch-margin').count() === 0, `dossier quotes (${width}): no alchemy margin without the input prices`);
    expect(await noOverflow(page) && !errors.length, `dossier quotes (${width}): no overflow or console errors`);
    await page.context().close();
  }
}

async function dossier(browser: Browser) {
  // The wiki dossier is on demand: no permanent column. A click on an NPC opens it as a drawer, "Pin to the side" makes it a column that is
  // remembered; pinned with nothing chosen it shows the current target, never an empty hint; "Unpin" returns the drawer behaviour.
  console.log('dossier');
  {
    const { page, errors } = await open(browser, 1280, {
      progress: progressBefore('S2-10'),
      status: { protocol: 5, pluginVersion: '2.37.3', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [],
        navTarget: { label: 'Lady Keli: use soft clay on the key for a print', x: 3127, y: 3244, plane: 0, stepId: 'S2-10' } },
    }, '#/step/S2-10');
    await waitFor(page, '.path-wide', 5000);
    expect(await page.locator('.la-dock .dock-panel').count() === 0, 'dossier: nothing pinned by default');
    await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Details/i }).click();
    await page.locator('.npc-name').first().click();
    await page.waitForSelector('dialog.drawer[open]', { timeout: 5000 });
    expect(await page.getByRole('button', { name: 'Pin to the side' }).count() === 1, 'dossier: the drawer offers to pin it');
    await page.getByRole('button', { name: 'Pin to the side' }).click();
    await page.waitForSelector('.la-dock .dock-panel', { timeout: 5000 });
    expect(await page.locator('dialog.drawer[open][aria-label="OSRS Wiki inspector"]').count() === 0, 'dossier: pinning closes the drawer and keeps the dossier on its ribbon');
    await page.reload();
    await settle(page);
    await page.getByRole('tablist', { name: 'Step views' }).getByRole('tab', { name: /Wiki/i }).click();
    const dock = await text(page, '.la-dock');
    expect(await page.locator('.la-dock .dock-panel').count() === 1, 'dossier: the pin is remembered after a reload');
    expect(/your current target/i.test(dock) && dock.includes('Keli') && !dock.includes('Click an item or NPC'), 'dossier: pinned with nothing chosen it shows the target NPC instead of an empty hint');
    if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/cockpit-1280.png` }).catch(() => {});
    await page.getByRole('button', { name: 'Unpin from the side' }).click();
    await settle(page);
    expect(await page.locator('.la-dock .dock-panel').count() === 0, 'dossier: unpinning returns the on-demand drawer');
    expect(errors.length === 0, `dossier: no console errors ${errors.join('; ')}`);
    await page.context().close();
  }
}

export const scenarios = {
  'dossier-quotes': dossierQuoteScenarios,
  'dossier': dossier,
};
