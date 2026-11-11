// The maps: scenarios of the browser suite (npm run test:ui -- --only map).
import type { Browser, Page } from 'playwright';
import { progressBefore, open, settle, expect, noOverflow, reveal, waitFor, stepButton, text } from '../harness.ts';

/** The Ledger frame (2.81.1): every spine link, HUD control, road control, ribbon and hotbar slot does what its label says. */
async function pickStepMapPoint(page: Page, name: RegExp) {
  await (await stepButton(page, /World map/)).click();
  await page.locator('dialog.map-modal[open]').waitFor();
  await page.getByRole('radio', { name }).click();
  await page.keyboard.press('Escape');
}

async function mapNavigationScenario(browser: Browser, width = 1000) {
    // A step point → the game: "Lead here in the game" sets a target with the point's NPC; "Show in the game" gives the RuneLite panel
    // "what you need / where to get it / the step points".
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-03') }, '#/step/S2-03');
      await pickStepMapPoint(page, /Eye of newt — Betty/);
      await (await stepButton(page, 'Lead here in the game')).click();
      await settle(page);
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.x === 3014 && JSON.stringify(nav?.npcNames) === '["Betty"]' && nav?.stepId === 'S2-03',
        'step map: "Lead here in the game" — a target at Betty with the NPC highlighted');
      await (await stepButton(page, '🧭 Show in the game')).first().click();
      await settle(page);
      const guide = (await posts()).filter((p) => p.path === '/active-step').pop()?.body.guide as
        { items: { name: string; where?: string }[]; places: { label: string; items?: string[] }[] } | undefined;
      expect(guide?.items.length === 4 && guide.items.every((i) => i.where) && guide.places.length === 5,
        'show in the game: 4 items with "where to get it" and 5 points go to the RuneLite panel');
      expect(await noOverflow(page), 'step map: no horizontal scrolling');
      expect(!errors.length, `step map: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

}

// The big map: the arrow target (a quick variant) is visible as a separate marker.
async function bigMapArrow(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    localStorage: { 'osrs-put:branch-choice': '{"S2-05":"varrock-teleport"}', 'osrs-put:active-step': 'S2-05' },
    progress: progressBefore('S2-05'),
    status: { activeStepId: 'S2-05' },
  }, '#/step/S2-05');
  await (await stepButton(page, 'World map')).first().click();
  await settle(page);
  const t = await text(page, '.map-source');
  expect(t.includes('The in-game arrow leads') && t.includes('Varrock Teleport'), 'map: the marker "The in-game arrow leads to Varrock Teleport"');
  expect(await page.locator('.map-arrow-pin').count() === 1, 'map: the 🧭 marker on the map');
  expect(!errors.length, `map: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// 2.14: "Where am I? How to get there" — the position from the game, the options to Varrock (S2-05) and their availability.
async function whereAmI(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-05'),
    status: {
      protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: { magic: 25, woodcutting: 20 },
      coins: 500, equipment: [], inventory: [{ id: 563, name: 'Law rune', count: 1 }, { id: 556, name: 'Air rune', count: 3 }, { id: 554, name: 'Fire rune', count: 1 }],
    },
  }, '#/step/S2-05');
  await (await stepButton(page, /Where am I/)).click();
  await waitFor(page, '.travel-option', 5000);
  const t = await text(page, '.travel-plan');
  expect(t.includes('Varrock Teleport') && t.includes('available now'), 'how to get there: Varrock Teleport with runes — "available now"');
  expect(t.includes('3222, 3218'), 'how to get there: the position from the game is shown');
  // The text does not overlap the status plate: in every option the name and the plate do not intersect.
  const overlaps = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll('.travel-option').forEach((o) => {
      const a = o.querySelector('.travel-title')?.getBoundingClientRect();
      const b = o.querySelector('.travel-badge')?.getBoundingClientRect();
      if (a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(o.textContent?.slice(0, 40) ?? '');
    });
    return bad;
  });
  expect(overlaps.length === 0, `how to get there: the name does not overlap the plate (${overlaps.join(' | ')})`);
  // A drop-down list in the app's style, not the system white one.
  const sel = await page.evaluate(() => {
    const el = document.querySelector('.travel-plan select') as HTMLSelectElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--surface)';
    // The surface token where the select stands: the Ledger's pages define their own (parchment).
    el.parentElement!.appendChild(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { appearance: cs.appearance, bg: cs.backgroundColor, surface };
  });
  expect(sel !== null && sel.appearance === 'none' && sel.bg === sel.surface, `how to get there: the select is in the app's style (${JSON.stringify(sel)})`);
  expect(!errors.length, `how to get there: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// A quest with an NPC: on the step map — the points of the NPC and where items come from, as in the list in the game.
async function npcMapPoints(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/step/S2-10');
  await reveal(page, '.spot-chip');
  const chips = await page.locator('.spot-chip').allInnerTexts();
  expect(chips.some((c) => c.includes('Ned')) && chips.some((c) => c.includes('Lady Keli')) && chips.some((c) => c.includes('Prince Ali')),
    `step map: the quest NPC as points (${chips.length})`);
  await pickStepMapPoint(page, /Ned — a house in Draynor Village/);
  await (await stepButton(page, 'Lead here in the game')).click();
  await settle(page);
  const nav = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: Record<string, unknown> }[] }).__posts
    .filter((p) => p.path === '/nav-target').pop()?.body);
  expect(JSON.stringify(nav?.npcNames) === '["Ned"]' && nav?.x === 3099, 'step map: "Lead here in the game" to Ned with a highlight');
  expect(await noOverflow(page), 'step map with an NPC: no horizontal scrolling');
  expect(!errors.length, `step map with an NPC: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'map-navigation': (browser: Browser) => mapNavigationScenario(browser, 1100),
  'big-map-arrow': bigMapArrow,
  'where-am-i': whereAmI,
  'npc-map-points': npcMapPoints,
};
