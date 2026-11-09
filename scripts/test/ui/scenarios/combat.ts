// Quest fights and their kits: scenarios of the browser suite (npm run test:ui -- --only combat).
import type { Browser } from 'playwright';
import { progressBefore, open, expect, noOverflow, waitFor, text } from '../harness.ts';

// 2.12.1: Magic 25 is there but the runes are not — the quick Varrock Teleport is not passed off as ready, it says what is missing.
async function magic25Runes(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-05'),
    events: [{ type: 'STATS', stats: { magic: 25 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Law rune', carried: 0, noted: 0, bank: 0 }, { name: 'Air rune', carried: 0, noted: 0, bank: 0 }] }],
  }, '#/step/S2-05');
  await waitFor(page, '.branch-missing', 5000);
  const t = await text(page, '.branch-missing');
  expect(t.includes('Missing') && t.includes('Law rune'), 'quick variant: no runes — "missing Law rune"');
  expect((await page.locator('.branch button:has-text("Lead in the game")').count()) === 0, 'quick variant: without runes it does not lead by teleport in the game');
  expect(!errors.length, `quick variant: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// 2.15: the dragon fight (S5-08) — "Food for combat": Elvarg's hits per the wiki and the food advice.
async function dragonFightFood(browser: Browser) {
  const width = 1100;
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S5-08'),
    events: [{ type: 'STATS', stats: { hitpoints: 40 } }],
  }, '#/step/S5-08');
  const f = await text(page, '.food-advice');
  expect(f.includes('Food for combat') && f.includes('Elvarg') && f.includes('Eat when HP is below'), 'S5-08: "Food for combat" — Elvarg\'s hits and the food threshold');
  expect(await noOverflow(page), 'S5-08: no horizontal scrolling');
  expect(!errors.length, `S5-08: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

// 2.63.0: a quest fight with the real kit (S2-08 Count Draynor): how long, how much damage, the food, and how it is worked out.
async function questFightKit(browser: Browser) {
  const width = 1100;
  const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
    .map(([id, name, slot]) => ({ id, name, slot }));
  const gear = { equipment, inventory: [{ id: 333, name: 'Trout', count: 5 }], coins: 100, bankCoins: 0 };
  const stats = { attack: 20, strength: 20, defence: 1, hitpoints: 20 };
  const { page, errors } = await open(browser, width, {
    progress: progressBefore('S2-08'),
    status: { protocol: 5, ...gear, stats, activeStepId: 'S2-08' },
    events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }],
  }, '#/step/S2-08');
  await waitFor(page, '.fight-plan', 8000);
  const f = await text(page, '.fight-plan');
  expect(/Count Draynor: about \d+ s on (Accurate|Aggressive|Defensive); you take about \d+ damage/.test(f), `S2-08: the fight with your kit (${f.replace(/\s+/g, ' ').slice(0, 160)})`);
  await page.locator('.fight-plan summary').click();
  const d = await text(page, '.fight-plan');
  expect(d.includes('you hit') && d.includes('No kit guarantees survival'), 'S2-08: how the fight estimate is worked out');
  if (process.env.UI_SHOTS) await page.locator('.food-advice').screenshot({ path: `${process.env.UI_SHOTS}/fight-s208-${width}.png` }).catch(() => {});
  expect(await noOverflow(page), 'S2-08: no horizontal scrolling');
  expect(!errors.length, `S2-08: no console errors ${errors.join('; ')}`);
  await page.context().close();
}

export const scenarios = {
  'magic-25-runes': magic25Runes,
  'dragon-fight-food': dragonFightFood,
  'quest-fight-kit': questFightKit,
};
