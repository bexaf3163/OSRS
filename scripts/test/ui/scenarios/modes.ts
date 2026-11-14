// Both game modes on every page (owner 2026-11-14: the launcher's F2P/Members switch changes every tab): a free account's
// pages name no Members quest; a Members account's route shows them.
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { progressBefore, open, settle, expect } from '../harness.ts';

const ROUTES = ['#/', '#/quests', '#/goals', '#/skills', '#/shopping', '#/gear', '#/journal', '#/money', '#/reference', '#/settings'];

async function gameModes(browser: Browser) {
  console.log('Game modes on every page');
  const members = (JSON.parse(readFileSync(new URL('../../../../src/data/authored/steps.json', import.meta.url), 'utf8')) as { title: string; membersOnly?: boolean }[])
    .filter((s) => s.membersOnly).map((s) => s.title);
  const pages = async (gameMode: 'f2p' | 'members') => {
    const { page } = await open(browser, 1280, { progress: progressBefore('S2-10', { gameMode }) }, '#/');
    const text: Record<string, string> = {};
    for (const route of ROUTES) {
      await page.evaluate((h) => { location.hash = h; }, route);
      await settle(page);
      text[route] = await page.evaluate(() => document.body.innerText);
    }
    await page.context().close();
    return text;
  };
  const free = await pages('f2p');
  const leaks = Object.entries(free).flatMap(([route, text]) => members.filter((title) => text.includes(title)).map((title) => `${route} ${title}`));
  expect(!leaks.length, `F2P pages name no Members quest${leaks.length ? `: ${leaks.join('; ')}` : ''}`);
  const paid = await pages('members');
  const shown = members.filter((title) => Object.values(paid).some((text) => text.includes(title)));
  expect(shown.length > 0, `Members pages show the Members quests (${shown.length} of ${members.length} named)`);
}

export const scenarios = { 'game-modes': gameModes };
