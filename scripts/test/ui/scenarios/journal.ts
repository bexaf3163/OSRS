// The Journal: scenarios of the browser suite (npm run test:ui -- --only journal).
import type { Browser } from 'playwright';
import { open, settle, expect, noOverflow, text } from '../harness.ts';

async function journalQuoteScenarios(browser: Browser) {
  for (const width of [1280]) for (const state of ['current', 'cached', 'missing']) {
    const stamp = Date.now() - 60_000;
    const rows = [{ name: 'Cowhide', quantityDelta: 10, reason: 'LOOT', timestamp: stamp, estimatedGpValue: 99999 }];
    const { page, errors } = await open(browser, width, {
      market: true, marketUnavailable: state === 'missing', marketAgeMinutes: state === 'cached' ? 120 : undefined,
      localStorage: { 'osrs-put:profiles': JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] }),
        'osrs-put:ledger:main:alpha one': JSON.stringify(rows) },
      status: { protocol: 6, inGame: true, player: 'Alpha One' },
    }, '#/journal/session');
    await page.locator('.ledger-block').waitFor();
    await settle(page);
    const body = await text(page, '.ledger-block');
    expect(state === 'missing' ? body.includes('Price unavailable') && !body.includes('loot ≈') : body.includes('loot ≈') && body.includes('GE sell estimates'), `journal quotes (${width}, ${state}): quote certainty and no saved-value fallback`);
    if (state === 'cached') expect(body.includes('cached'), `journal quotes (${width}): old side certainty is visible`);
    expect(!/\d{2}:\d{2}|99,999/.test(body), `journal quotes (${width}, ${state}): no quote clock or stale recorded value`);
    expect(await noOverflow(page) && !errors.length, `journal quotes (${width}, ${state}): no overflow or console errors`);
    await page.context().close();
  }
}

export const scenarios = {
  'journal-quotes': journalQuoteScenarios,
};
