// npm run test:ui — a run of the interface in a real browser (Chromium through Playwright), as the player has it in the exe:
// the built page, a stub desktop app (window.osrsDesktop) and a stub RuneLite bridge. The network to the wiki
// is closed — it checks that everything works without it too. It needs a build (npm run build) and Chromium
// (npx playwright install chromium). These scenarios used to live outside the repository.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/`;
const steps = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string }[];

interface Mock {
  progress?: unknown;
  status?: Record<string, unknown>;
  events?: unknown[];
  localStorage?: Record<string, string>;
  /** The "Zen" mode (by default the tests turn "Inspector" on: all the step blocks are expanded, as it was checked before). */
  zen?: boolean;
  /** The exchange prices by item ID: they stand in for the prices.runescape.wiki reply (without them the network to the wiki is closed). */
  prices?: Record<number, number>;
}

/** The progress: everything before the step is closed. */
function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const ids = steps.map((s) => s.id);
  const done = Object.fromEntries(ids.slice(0, ids.indexOf(id)).map((s) => [s, 'done']));
  return { version: 3, steps: done, levels: {}, notes: {}, updatedAt: '2026-09-27T10:00:00.000Z', gameMode: 'members', ...extra };
}

async function open(browser: Browser, width: number, mock: Mock, hash: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: width < 600 ? 'light' : 'dark' });
  await ctx.addInitScript((m: Mock) => {
    for (const [k, v] of Object.entries(m.localStorage ?? {})) localStorage.setItem(k, v);
    try {
      const f = JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as Record<string, unknown>;
      if (f.inspector === undefined) f.inspector = !m.zen;
      localStorage.setItem('osrs-put:features', JSON.stringify(f));
    } catch { /* no storage */ }
    const w = window as unknown as Record<string, unknown>;
    const posts: unknown[] = [];
    w.__posts = posts;
    let progress = m.progress ? JSON.stringify(m.progress) : null;
    w.osrsDesktop = {
      getZoom: async () => ({ zoom: 1, autoZoom: false, effective: 1, alwaysOnTop: false }),
      setZoom() {}, setAlwaysOnTop() {}, onZoom: () => () => {},
      loadProgressFile: () => progress,
      saveProgressFile: (j: string) => { progress = j; w.__saved = j; },
      dataDir: () => 'C:/OSRS', isPortable: () => true,
      runelite: { check: async () => ({ ok: true, problems: [], clientVersion: '1.12.39', credentials: true }), launch: async () => ({ ok: true, state: 'running' }) },
      bridge: {
        request: async (method: string, path: string, body: unknown) => {
          posts.push({ method, path, body });
          if (path === '/status') return { ok: true, status: 200, data: { status: 'ok', inGame: true, activeStepId: null, shortestPath: true, ...(m.status ?? {}) } };
          return { ok: true, status: 200, data: { ok: true } };
        },
        openEvents: (onEvent: (d: string) => void, onState: (s: string) => void) => {
          setTimeout(() => { onState('open'); for (const e of m.events ?? []) onEvent(JSON.stringify(e)); }, 50);
          return () => {};
        },
      },
    };
  }, mock);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource|net::/.test(msg.text())) errors.push(msg.text()); });
  await page.route(/runescape\.wiki/, (r) => r.abort());
  if (mock.prices) {
    const data = Object.fromEntries(Object.entries(mock.prices).map(([id, p]) => [id, { high: p, highTime: 1, low: p, lowTime: 1 }]));
    await page.route(/prices\.runescape\.wiki\/api\/v1\/osrs\/latest/, (r) => r.fulfill({ json: { data } }));
  }
  await page.goto(BASE + hash);
  await page.waitForTimeout(1200);
  return { page, errors };
}

const failures: string[] = [];
function expect(cond: boolean, what: string) {
  if (cond) console.log(`  ✓ ${what}`);
  else { console.log(`  ✗ ${what}`); failures.push(what); }
}
async function noOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0);
}
const text = (page: Page, sel: string) => page.locator(sel).allInnerTexts().then((t) => t.join('\n'));

async function run(browser: Browser) {
  for (const width of [390, 1100]) {
    console.log(`Width ${width}`);

    // Step readiness: a level is missing — the action "catch up"; an item is in the bank — "to the bank". The auto preparation is off —
    // the trip starts with a button (the auto queue is checked below).
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      }, '#/step/S9-01');
      const t = await text(page, '.readiness');
      expect(t.includes('A short preparation is needed') && t.includes('Catch up Crafting'), 'readiness: Crafting 31 is missing — "⚡ Catch up Crafting"');
      expect(t.includes('To the bank'), 'readiness: Knife is in the bank — "🧭 To the bank"');
      // The preparation route: one main thing, the start button, the return to the step; the trip survives a page reload.
      const prep = await text(page, '.prep-route');
      expect(prep.includes('Preparing for S9-01') && prep.includes('Start the preparation') && prep.includes('then we return to S9-01'), 'preparation: the main thing, the button and the return to the step');
      await page.getByRole('button', { name: /Start the preparation/ }).click();
      await page.waitForTimeout(300);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string }[] });
      expect(saved.stack?.length === 1 && saved.stack[0].sourceStepId === 'S9-01', 'preparation: the trip was remembered in the storage');
      await page.reload();
      await page.waitForTimeout(1200);
      expect((await text(page, '.prep-route')).includes('Preparation underway'), 'preparation: after a reload the trip is still going');
      expect(await noOverflow(page), 'step: no horizontal scrolling');
      expect(!errors.length, `step: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The auto queue of the preparation: it sets the arrow to the bank for a Knife by itself, remembers the trip, survives a reload;
    // the player cleared the arrow — the queue is paused, "Continue" brings it back.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 40, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/step/S9-01');
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      // The link with the game and the bank do not arrive at once — we wait until the queue starts a trip.
      await page.waitForFunction(() => (window as unknown as { __posts: Post[] }).__posts.some((p) => p.path === '/nav-target'), null, { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.itemName === 'Knife' && nav?.stepId === 'S9-01', 'auto queue: the arrow leads to the bank for a Knife by itself');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:prep') ?? '{}') as { stack?: { sourceStepId: string; detourId: string }[] });
      expect(saved.stack?.length === 1 && saved.stack[0].detourId === 'bank', 'auto queue: the trip started by itself and was remembered');
      expect((await text(page, '.prep-route')).includes('Preparation underway'), 'auto queue: the preparation block says "Preparation underway"');
      const navCount = (await posts()).filter((p) => p.path === '/nav-target').length;
      await page.waitForTimeout(800);
      expect((await posts()).filter((p) => p.path === '/nav-target').length === navCount, 'auto queue: the arrow is not jerked in circles');
      await page.reload();
      await page.waitForTimeout(1200);
      expect((await text(page, '.prep-route')).includes('Preparation underway'), 'auto queue: after a reload the trip is still going');
      expect(!errors.length, `auto queue: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The player cleared the arrow themselves — the queue is paused and does not set it any more.
    {
      const target = { label: 'Bank: take Knife', x: 3185, y: 3436, plane: 0, itemName: 'Knife', stepId: 'S9-01' };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S9-01'),
        status: { protocol: 5, stats: { crafting: 40, woodcutting: 40 }, navTarget: target },
        events: [{ type: 'STATS', stats: { crafting: 40, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:prep': JSON.stringify({ stack: [{ sourceStepId: 'S9-01', detourId: 'bank', reason: 'Take it from the bank', startedAt: 1, returnCondition: 'done' }], done: [] }) },
      }, '#/step/S9-01');
      await page.getByRole('button', { name: /Return to the step now/ }).click();
      await page.waitForTimeout(700);
      expect((await text(page, '.prep-route')).includes('Continue the preparation'), 'pause: after the arrow is cleared — "Continue the preparation"');
      type Post = { path: string };
      const navs = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
      await page.waitForTimeout(800);
      const after = (await page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts)).filter((p) => p.path === '/nav-target').length;
      expect(navs === after, 'pause: it does not set the arrow any more');
      expect(!errors.length, `pause: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The play style and "what to train with": calm by default; switching in settings; the method card on the skill page.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S1-08', { levels: { woodcutting: 32 } }),
        status: { stats: { woodcutting: 32 } },
        events: [{ type: 'STATS', stats: { woodcutting: 32 } }],
      }, '#/skills/WC');
      await page.waitForSelector('.training', { timeout: 5000 });
      const calm = await text(page, '.training');
      expect(calm.includes('What to train with') && calm.includes('Willow') && !calm.includes('by the wiki speed') && calm.includes('Style: 🌿 Calm'), 'what to train with: at level 32 — willows, the calm style without a time estimate');
      expect(await noOverflow(page), 'what to train with: no horizontal scrolling');
      await page.goto(`${BASE}#/settings`);
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /Efficient/ }).click();
      await page.waitForTimeout(200);
      const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { efficient?: boolean });
      expect(feat.efficient === true, 'style: "Efficient" was remembered in the settings');
      await page.goto(`${BASE}#/skills/WC`);
      await page.waitForSelector('.training', { timeout: 5000 });
      const fast = await text(page, '.training');
      expect(fast.includes('Style: ⚡ Efficient') && /wiki speed/.test(fast), 'what to train with: the efficient style shows the time and the speed "per the wiki"');
      expect(!errors.length, `what to train with: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // "Zen": instead of a stack of plaques — one status line; the details on a button, as tabs; ready — "Start the step".
    {
      const { page, errors } = await open(browser, width, {
        zen: true,
        progress: progressBefore('S9-01'),
        status: { stats: { crafting: 28, woodcutting: 40 } },
        events: [{ type: 'STATS', stats: { crafting: 28, woodcutting: 40 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Knife', carried: 0, noted: 0, bank: 1 }] }],
        localStorage: { 'osrs-put:features': JSON.stringify({ autoPrep: false }) },
      }, '#/step/S9-01');
      await page.waitForSelector('.step-status', { timeout: 8000 });
      const line = await text(page, '.status-line');
      expect(/Preparation required \(\d/.test(line) && line.includes('Fix') && line.includes('More'), `Zen: one status line with the preparation and the buttons (${line.replace(/\s+/g, ' ').slice(0, 90)})`);
      expect(!(await page.locator('.readiness').first().isVisible()), 'Zen: the readiness panel is folded, it is not on the screen');
      expect((await text(page, '.step-details')).includes('Done'), 'Zen: the "Done" button is in place');
      expect(await page.locator('.zen-more').count() === 1, 'Zen: the rest is in "More about the step"');
      await page.getByRole('button', { name: /More ▾/ }).click();
      await page.waitForTimeout(300);
      const open1 = await text(page, '.readiness');
      expect(open1.includes('Catch up Crafting') && open1.includes('To the bank'), 'Zen: "More" expands the whole earlier preparation panel');
      expect(await page.locator('.status-tab').count() >= 2, 'Zen: the detail tabs (preparation, route and game…)');
      expect(await noOverflow(page), 'Zen: no horizontal scrolling');
      expect(!errors.length, `Zen: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    {
      const { page, errors } = await open(browser, width, {
        zen: true,
        progress: progressBefore('S1-04'),
        status: { stats: {} },
      }, '#/step/S1-04');
      await page.waitForSelector('.step-status', { timeout: 8000 });
      const line = await text(page, '.status-line');
      expect(line.includes('Ready to set off') && line.includes('Start the step') && !line.includes('Fix'), `Zen: ready — "Ready to set off · Start the step" (${line.replace(/\s+/g, ' ').slice(0, 80)})`);
      expect(await noOverflow(page), 'Zen (ready): no horizontal scrolling');
      // The switch in the header: "Inspector" brings back all the blocks.
      // In a narrow window the header icon is hidden (like ⚔️ and 🛒) — the switch is always in Settings.
      if (width > 480) await page.getByRole('button', { name: /switch to "Inspector"/ }).click();
      else {
        await page.goto(`${BASE}#/settings`);
        await page.getByRole('button', { name: /^Inspector$/ }).click();
      }
      await page.waitForTimeout(300);
      const feat = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs-put:features') ?? '{}') as { inspector?: boolean });
      expect(feat.inspector === true && await page.locator('.step-status').count() === 0, 'Inspector: the header switch expands the blocks and hides the status line');
      expect(!errors.length, `Zen (ready): no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // Bulk shopping: "already have" changes "buy", is saved and goes into the exchange hint.
    {
      const { page, errors } = await open(browser, width, {
        events: [{ type: 'OWNED', bankSeen: true, items: [{ name: 'Feather', carried: 120, noted: 0, bank: 200 }] }],
      }, '#/shopping');
      const input = page.getByLabel('Energy potion(4): how many you already have').first();
      await input.fill('3');
      await input.press('Enter');
      await page.waitForTimeout(900);
      const tally = await text(page, '.shop-tally');
      expect(/partly \d/.test(tally), 'shopping: 3 of 5 marked — "partly"');
      const saved = await page.evaluate(() => JSON.parse(String((window as unknown as Record<string, unknown>).__saved ?? '{}')));
      expect(saved.ownedManual?.['id:3008']?.count === 3, 'shopping: the mark "already have 3" is saved in the progress');
      const plan = await page.evaluate(() => ((window as unknown as { __posts: { path: string; body: { items: { name: string; count: number }[] } }[] }).__posts)
        .filter((p) => p.path === '/shopping-plan').pop()?.body.items ?? []);
      expect(plan.find((i) => i.name === 'Energy potion(4)')?.count === 2, 'shopping: "buy 2" goes to the game, not 5');
      expect(plan.find((i) => i.name === 'Feather')?.count === 500, 'shopping: feathers — by the game data, the plugin subtracts 320 itself');
      expect(await noOverflow(page), 'shopping: no horizontal scrolling');
      expect(!errors.length, `shopping: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // Gear: a Coif in the bank at 17 Ranged — "you have it but cannot wear it", not advice to wear it.
    {
      const gear = { equipment: [{ id: 1325, name: 'Steel scimitar', slot: 'weapon' }], inventory: [], coins: 500, bankCoins: 3000 };
      const stats = { attack: 20, strength: 20, defence: 1, ranged: 17 };
      const { page, errors } = await open(browser, width, {
        status: { ...gear, stats },
        events: [{ type: 'STATS', stats }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Coif', carried: 0, noted: 0, bank: 1 }] }],
      }, '#/gear');
      const t = await text(page, '.gear-locked');
      expect(t.includes('needs 20 Ranged') && t.includes('Coif') && t.includes('cannot be worn yet'), 'gear: 🔒 Coif — needs 20 Ranged, lies in the bank');
      expect(!(await text(page, '.gear-list')).includes('Wear Coif'), 'gear: it is not advised to wear the Coif');
      expect(await noOverflow(page), 'gear: no horizontal scrolling');
      expect(!errors.length, `gear: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The big map: the arrow target (a quick variant) is visible as a separate marker.
    {
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:branch-choice': '{"S2-05":"varrock-teleport"}', 'osrs-put:active-step': 'S2-05' },
        progress: progressBefore('S2-05'),
        status: { activeStepId: 'S2-05' },
      }, '#/step/S2-05');
      await page.getByRole('button', { name: '🗺️ World map' }).first().click();
      await page.waitForTimeout(800);
      const t = await text(page, '.map-source');
      expect(t.includes('The in-game arrow leads') && t.includes('Varrock Teleport'), 'map: the marker "The in-game arrow leads to Varrock Teleport"');
      expect(await page.locator('.map-arrow-pin').count() === 1, 'map: the 🧭 marker on the map');
      expect(!errors.length, `map: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // A step point → the game: "Lead here in the game" sets a target with the point's NPC; "Show in the game" gives the RuneLite panel
    // "what you need / where to get it / the step points".
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-03') }, '#/step/S2-03');
      await page.getByRole('radio', { name: /Eye of newt — Betty/ }).click();
      await page.getByRole('button', { name: '🧭 Lead here in the game' }).click();
      await page.waitForTimeout(500);
      type Post = { path: string; body: Record<string, unknown> };
      const posts = () => page.evaluate(() => (window as unknown as { __posts: Post[] }).__posts);
      const nav = (await posts()).filter((p) => p.path === '/nav-target').pop()?.body;
      expect(nav?.x === 3014 && JSON.stringify(nav?.npcNames) === '["Betty"]' && nav?.stepId === 'S2-03',
        'step map: "Lead here in the game" — a target at Betty with the NPC highlighted');
      await page.getByRole('button', { name: '🧭 Show in the game' }).first().click();
      await page.waitForTimeout(500);
      const guide = (await posts()).filter((p) => p.path === '/active-step').pop()?.body.guide as
        { items: { name: string; where?: string }[]; places: { label: string; items?: string[] }[] } | undefined;
      expect(guide?.items.length === 4 && guide.items.every((i) => i.where) && guide.places.length === 5,
        'show in the game: 4 items with "where to get it" and 5 points go to the RuneLite panel');
      expect(await noOverflow(page), 'step map: no horizontal scrolling');
      expect(!errors.length, `step map: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // An earning step: coins against the goal.
    {
      const gear = { equipment: [], inventory: [], coins: 300, bankCoins: 12000, carriedValue: 4200, bankValue: 5000 };
      const { page } = await open(browser, width, { progress: progressBefore('S1-13'), status: gear, events: [{ type: 'GEAR', gear }] }, '#/step/S1-13');
      const t = await text(page, '.money-goal');
      expect(t.includes('12,300 / 20,000') && t.includes('7,700 missing'), 'earning: "Coins: 12,300 / 20,000 gp — 7,700 missing"');
      expect(t.includes('~9,200'), 'earning: the items — separately, with "~"');
      await page.context().close();
    }

    // An old plugin without the protocol field — a request to restart RuneLite.
    {
      const { page } = await open(browser, width, {}, '#/settings');
      await page.getByRole('tab', { name: 'RuneLite' }).click();
      const t = await text(page, '.plaque-warning');
      expect(t.includes('old plugin') && t.includes('restart RuneLite'), 'settings: a plugin without a handshake — "old plugin, restart RuneLite"');
      await page.context().close();
    }

    // Plugin 2.10 (protocol 3) with app 2.11: the step card says it is missing and what to do; with a new one — a hint about the list.
    {
      const { page } = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
        status: { activeStepId: 'S2-03', protocol: 3, pluginVersion: '2.10.0' },
      }, '#/step/S2-03');
      const t = await text(page, '.ingame');
      expect(t.includes('old plugin 2.10.0') && t.includes('"What you need" list on the game screen'), 'step: plugin 2.10 — "restart RuneLite", without the list in the game');
      await page.context().close();
      const fresh = await open(browser, width, {
        localStorage: { 'osrs-put:active-step': 'S2-03' }, progress: progressBefore('S2-03'),
        status: { activeStepId: 'S2-03', protocol: 6, pluginVersion: '2.22.0' },
      }, '#/step/S2-03');
      const f = await text(fresh.page, '.ingame');
      expect(f.includes('"What you need" list') && !f.includes('old plugin'), 'step: plugin 2.22 — a hint where the "What you need" list is in the game');
      expect(!fresh.errors.length, `step: no console errors ${fresh.errors.join('; ')}`);
      await fresh.page.context().close();
    }

    // 2.12: another character does not write into the active profile and gets an offer; XP from the game is visible on the skill page.
    {
      const profiles = JSON.stringify({ active: 'main', list: [{ id: 'main', name: 'Main', player: 'Alpha One' }] });
      const { page, errors } = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles },
        status: { protocol: 5, pluginVersion: '2.12.0', player: 'Beta Two', xp: { woodcutting: 10, strength: 0 } },
      }, '#/skills/WC');
      await page.waitForSelector('.plaque-warning', { timeout: 5000 });
      const t = await text(page, '.plaque-warning');
      expect(t.includes('new character') && t.includes('Beta Two'), 'profile: another character — an offer to create a profile');
      expect(!errors.length, `profile: no console errors ${errors.join('; ')}`);
      await page.context().close();

      const ok = await open(browser, width, {
        localStorage: { 'osrs-put:profiles': profiles },
        status: { protocol: 5, pluginVersion: '2.12.0', player: 'Alpha One', xp: { woodcutting: 10 } },
      }, '#/skills/WC');
      await ok.page.waitForSelector('.live-xp', { timeout: 5000 });
      const x = await text(ok.page, '.live-xp');
      expect(x.includes('to ') && x.includes('XP left'), 'skill: XP from the game — "N XP left to the level"');
      expect((await ok.page.locator('.plaque-warning').count()) === 0, 'profile: the own character — no warning');
      await ok.page.context().close();
    }

    // 2.19.2: the resource journal lives between sessions — the records of the earlier launch are in place, another character's is not visible, clearing works.
    {
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
      await page.waitForSelector('.ledger-block', { timeout: 5000 });
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

    // 2.12.1: Magic 25 is there but the runes are not — the quick Varrock Teleport is not passed off as ready, it says what is missing.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-05'),
        events: [{ type: 'STATS', stats: { magic: 25 } }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Law rune', carried: 0, noted: 0, bank: 0 }, { name: 'Air rune', carried: 0, noted: 0, bank: 0 }] }],
      }, '#/step/S2-05');
      await page.waitForSelector('.branch-missing', { timeout: 5000 });
      const t = await text(page, '.branch-missing');
      expect(t.includes('Missing') && t.includes('Law rune'), 'quick variant: no runes — "missing Law rune"');
      expect((await page.locator('.branch button:has-text("Lead in the game")').count()) === 0, 'quick variant: without runes it does not lead by teleport in the game');
      expect(!errors.length, `quick variant: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.13: S2-04 — the magic calculation by exchange prices and "how to make up the money" for the player's levels.
    {
      const prices = { 556: 6, 558: 3, 555: 6, 557: 6, 554: 6, 563: 120, 1381: 1542, 1383: 1500, 1385: 1500, 1387: 940, 1739: 125 };
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-04'), prices,
        events: [{ type: 'STATS', stats: { magic: 10, mining: 1, attack: 5, strength: 5, defence: 5 } }, { type: 'XP', xp: { magic: 1200 } }],
      }, '#/step/S2-04');
      await page.waitForSelector('.magic-plan table', { timeout: 6000 });
      const t = await text(page, '.magic-plan');
      expect(t.includes('Wind Strike only') && t.includes('staff of fire') && t.includes('Magic 25'), 'S2-04: the magic calculation — the options and the staff of fire');
      expect(t.includes('hides'), 'S2-04: how many hides pay back the runes');
      await page.locator('.money-plan summary').click();
      const m = await text(page, '.money-plan');
      expect(m.includes('How to make up the money') && m.includes('gp/h'), 'S2-04: "How to make up the money" — methods with revenue per hour');
      expect((await page.locator('.money-method').count()) > 0, 'S2-04: the money block has methods');
      await page.locator('.style-gear summary').click();
      await page.waitForSelector('.style-row', { timeout: 6000 });
      const sg = await text(page, '.style-gear');
      expect(sg.includes('What to wear for magic') && sg.includes('Weapon:') && sg.includes('OSRS Wiki recommendations'), 'S2-04: "What to wear for magic" — the slots and the source');
      expect(await noOverflow(page), 'S2-04: the gear without horizontal scrolling');
      expect(!errors.length, `S2-04: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // 2.15: the dragon fight (S5-08) — "Food for combat": Elvarg's hits per the wiki and the food advice.
    {
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

    // 2.14: "Where am I? How to get there" — the position from the game, the options to Varrock (S2-05) and their availability.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-05'),
        status: {
          protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: { magic: 25, woodcutting: 20 },
          coins: 500, equipment: [], inventory: [{ id: 563, name: 'Law rune', count: 1 }, { id: 556, name: 'Air rune', count: 3 }, { id: 554, name: 'Fire rune', count: 1 }],
        },
      }, '#/step/S2-05');
      await page.getByRole('button', { name: /Where am I/ }).click();
      await page.waitForSelector('.travel-option', { timeout: 5000 });
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
        document.body.appendChild(probe);
        const surface = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { appearance: cs.appearance, bg: cs.backgroundColor, surface };
      });
      expect(sel !== null && sel.appearance === 'none' && sel.bg === sel.surface, `how to get there: the select is in the app's style (${JSON.stringify(sel)})`);
      expect(!errors.length, `how to get there: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // "One trip": the bank is open, the items of the step and the nearest ones are missing — what to take now, meanwhile and later; the unknown — separately.
    {
      const route = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: { nameEn: string; amount: string | number; inStep?: boolean }[] }[];
      const at = route.findIndex((x) => x.id === 'S2-10');
      const names = route.slice(at, at + 4).flatMap((x) => (x.itemsRequired ?? []).filter((i) => !i.inStep).map((i) => i.nameEn));
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 100, bankCoins: 0, equipment: [], inventory: [] },
        events: [{ type: 'OWNED', bankSeen: true, items: [...new Set(names)].map((n) => ({ name: n, carried: 0, noted: 0, bank: 0 })) }],
      }, '#/step/S2-10');
      await page.waitForSelector('.one-trip', { timeout: 5000 });
      const trip = await text(page, '.one-trip');
      expect(trip.includes('What you need') && trip.includes('Needed now') && trip.includes('Open the shopping list'), 'what you need: the "Needed now" list and a link to shopping');
      expect(/ready \d+%/.test(trip) && trip.includes('critical'), 'what you need: the readiness in percent and the number of critical ones');
      expect(trip.includes('missing') && /Buy|Take|Obtain|Earn/.test(trip), 'what you need: for each thing — what to do with it');
      if (process.env.UI_SHOTS) await page.locator('.one-trip').screenshot({ path: `${process.env.UI_SHOTS}/prep-plan-${width}.png` }).catch(() => {});
      expect(await noOverflow(page), 'one trip: no horizontal scrolling');
      expect(!errors.length, `one trip: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The recovery mode: died in a dungeon and respawned in Lumbridge — instead of "kill zombies" a plan "collect the things, go back".
    {
      const { page, errors } = await open(browser, width, {
        zen: true, localStorage: { 'osrs-put:active-step': 'S2-07' }, progress: progressBefore('S2-07'),
        status: { activeStepId: 'S2-07', protocol: 5, pluginVersion: '2.20.0', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [] },
        events: [
          { type: 'MOVED', kind: 'DEATH', from: { x: 3049, y: 9566, plane: 0 }, to: null },
          { type: 'MOVED', kind: 'TELEPORT', from: { x: 3049, y: 9566, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } },
        ],
      }, '#/step/S2-07');
      await page.waitForSelector('.prep-recovery', { timeout: 5000 });
      const t = await text(page, '.prep-recovery');
      expect(t.includes('Recovery mode') && t.includes('died') && t.includes('Collect the things') && t.includes('Go back to step S2-07'), 'recovery: died — the things, the missing, the return');
      expect((await text(page, '.step-status')).includes('recovery mode'), 'recovery: the step status speaks of the mode');
      expect(await noOverflow(page), 'recovery: no horizontal scrolling');
      await page.getByRole('button', { name: 'This is not a derailment — continue' }).click();
      await page.waitForFunction(() => !document.querySelector('.prep-recovery'), null, { timeout: 5000 });
      expect(!errors.length, `recovery: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // Protocol 6: the step, shopping, the bank highlight, the advice and the plan go to the game in one /prep-plan snapshot — there are no separate requests.
    {
      const { page, errors } = await open(browser, width, {
        zen: true, localStorage: { 'osrs-put:active-step': 'S2-07', 'osrs-put:shopping-plan': '{"items":[{"name":"Iron bar","count":2}]}' }, progress: progressBefore('S2-07'),
        status: { protocol: 6, pluginVersion: '2.22.0', stats: {}, coins: 0, bankCoins: 0, equipment: [], inventory: [] },
      }, '#/step/S2-07');
      await page.waitForTimeout(1500);
      const sent = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: any }[] }).__posts);
      const snaps = sent.filter((p) => p.path === '/prep-plan');
      expect(snaps.length > 0, 'protocol 6: the /prep-plan snapshot was sent');
      const last = snaps[snaps.length - 1]?.body;
      expect(last?.v === 6 && last?.step?.stepId === 'S2-07', 'protocol 6: the snapshot has step S2-07');
      expect(last?.plan?.stepId === 'S2-07' && Array.isArray(last?.plan?.lines) && last.plan.lines.length > 0, 'protocol 6: the snapshot has the preparation plan with items');
      expect(last?.shopping?.items?.[0]?.name === 'Iron bar', 'protocol 6: shopping — in the same snapshot');
      expect(!sent.some((p) => ['/active-step', '/gear-hint', '/bank-tags', '/shopping-plan'].includes(p.path)), 'protocol 6: there are no five separate requests');
      expect(snaps.every((p, i) => i === 0 || p.body.seq > snaps[i - 1].body.seq), 'protocol 6: the snapshot numbers grow');
      expect(!errors.length, `protocol 6: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // The quest is handed in — the "Departure check" does not demand items that are no longer there.
    {
      const { page, errors } = await open(browser, width, {
        progress: progressBefore('S2-10'),
        status: { protocol: 5, questsDone: ['Prince Ali Rescue'], pluginVersion: '2.13.0', pos: { x: 3222, y: 3218, plane: 0 }, stats: {}, coins: 0, equipment: [], inventory: [] },
      }, '#/step/S2-10');
      await page.waitForTimeout(500);
      const t = await text(page, '.preflight-verdict');
      expect(t.includes('The step is done') && !/Not ready|missing/i.test(t), `a handed-in quest: the departure check does not complain about an empty bag (${t.slice(0, 80)})`);
      expect(!errors.length, `a handed-in quest: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }

    // A quest with an NPC: on the step map — the points of the NPC and where items come from, as in the list in the game.
    {
      const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/step/S2-10');
      const chips = await page.locator('.spot-chip').allInnerTexts();
      expect(chips.some((c) => c.includes('Ned')) && chips.some((c) => c.includes('Lady Keli')) && chips.some((c) => c.includes('Prince Ali')),
        `step map: the quest NPC as points (${chips.length})`);
      await page.getByRole('radio', { name: /Ned — a house in Draynor Village/ }).click();
      await page.getByRole('button', { name: '🧭 Lead here in the game' }).click();
      await page.waitForTimeout(500);
      const nav = await page.evaluate(() => (window as unknown as { __posts: { path: string; body: Record<string, unknown> }[] }).__posts
        .filter((p) => p.path === '/nav-target').pop()?.body);
      expect(JSON.stringify(nav?.npcNames) === '["Ned"]' && nav?.x === 3099, 'step map: "Lead here in the game" to Ned with a highlight');
      expect(await noOverflow(page), 'step map with an NPC: no horizontal scrolling');
      expect(!errors.length, `step map with an NPC: no console errors ${errors.join('; ')}`);
      await page.context().close();
    }
  }

  // All the pages: steps, skills, the reference — open without console errors, without a crash and horizontal scrolling.
  console.log('All the pages');
  const skillIds = [
    ...(JSON.parse(readFileSync(new URL('../src/data/skills.json', import.meta.url), 'utf8')) as { id: string }[]).map((x) => x.id),
    ...(JSON.parse(readFileSync(new URL('../src/data/members-skills.json', import.meta.url), 'utf8')) as { skills: { id: string }[] }).skills.map((x) => x.id),
  ];
  const routes = ['#/', '#/skills', '#/goals', '#/quests', '#/reference', '#/settings', '#/shopping', '#/gear',
    ...steps.map((x) => `#/step/${x.id}`), ...skillIds.map((id) => `#/skills/${id}`)];
  for (const width of [390, 1280]) {
    const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/');
    const bad: string[] = [];
    for (const r of routes) {
      const before = errors.length;
      await page.evaluate((h) => { location.hash = h; }, r);
      await page.waitForTimeout(120);
      const info = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        crashed: !!document.querySelector('.page-error'),
      }));
      if (info.overflow > 0) bad.push(`${r}: scroll ${info.overflow}px`);
      if (info.crashed) bad.push(`${r}: the page crashed`);
      if (errors.length > before) bad.push(`${r}: ${errors.slice(before).join('; ').slice(0, 200)}`);
    }
    expect(!bad.length, `${routes.length} pages at ${width} px — no errors and scrolling ${bad.slice(0, 5).join(' | ')}`);
    await page.context().close();
  }

  // The Content-Security-Policy of the built page: the meta tag is there, a foreign inline script does not run, and the page
  // with our theme script and the network only to the wiki works (there are no console errors).
  console.log('CSP');
  {
    const { page, errors } = await open(browser, 1280, {}, '#/');
    expect(await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes("default-src 'none'") ?? false), 'CSP: the policy is in the page');
    const blocked = await page.evaluate(() => new Promise<boolean>((res) => {
      const s = document.createElement('script');
      s.textContent = 'window.__injected = 1';
      document.head.appendChild(s);
      setTimeout(() => res(!(window as unknown as Record<string, unknown>).__injected), 100);
    }));
    expect(blocked, 'CSP: a foreign inline script is blocked');
    // One violation is our own trial above; there must be no others.
    const own = errors.filter((e) => /Content Security Policy|Refused/.test(e));
    expect(own.length === 1 && own[0].includes('inline script'), `CSP: our page does not violate its own policy ${own.join('; ')}`);
    await page.context().close();
  }

  // The header fits at any width when RuneLite is connected (it used to overflow by 11–193 px).
  console.log('Header');
  for (const width of [320, 390, 900, 1000, 1100, 1280, 1400, 1600, 1720, 1920]) {
    const { page } = await open(browser, width, {}, '#/');
    expect(await noOverflow(page), `the header at ${width} px without horizontal scrolling`);
    await page.context().close();
  }
}

// The address is set explicitly: without --host the server on some machines (GitHub CI) listens on IPv6 ::1 only, and 127.0.0.1 does not answer.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error(`The preview server did not come up on ${BASE} — run npm run build first`);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
console.log(failures.length ? `\nTotal: ${failures.length} failed` : '\nTotal: everything passed');
process.exit(failures.length ? 1 : 0);
