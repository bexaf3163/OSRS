// Screenshots for a review package: every work area of the guide in the built page with a stub desktop app and a stub RuneLite bridge (the same
// mock as scripts/ui-smoke.ts). These are FIXTURE screenshots: the player state is written here, not read from a game. They are labelled so in the
// manifest. Usage: npm run build, then REVIEW_OUT=<folder> node scripts/review-shots.ts [filter]. Writes <folder>/<nn>-<name>.png and manifest.json.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = process.env.REVIEW_OUT ?? 'review-shots';
const FILTER = process.argv[2] ?? '';
type ShotItem = { nameEn: string; anyOf?: string[] };
const steps = JSON.parse(readFileSync(new URL('../src/data/steps.json', import.meta.url), 'utf8')) as { id: string; itemsRequired?: ShotItem[]; itemsRecommended?: ShotItem[] }[];
/** The game reports every size of a potion once one is asked about (ItemCounts.report, 2.73.0). */
const sizesOf = (name: string) => {
  const m = /^(.*\S)\((\d)\)$/.exec(name);
  return m && /potion$/i.test(m[1]) ? [1, 2, 3, 4].map((d) => `${m[1]}(${d})`) : [name];
};

interface Mock {
  progress?: unknown;
  status?: Record<string, unknown>;
  events?: unknown[];
  localStorage?: Record<string, string>;
  market?: boolean;
  offline?: boolean;
  scale?: number;
}

function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const ids = steps.map((s) => s.id);
  const done = Object.fromEntries(ids.slice(0, ids.indexOf(id)).map((s) => [s, 'done']));
  // The one-time "the guide updated" banner is not part of any work area: its steps count as checked.
  return { version: 3, steps: done, levels: {}, notes: {}, updatedAt: '2026-10-19T10:00:00.000Z', gameMode: 'f2p', reviewedV2Steps: Object.keys(done), ...extra };
}

async function open(browser: Browser, width: number, mock: Mock, hash: string, height = 900): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height: mock.scale ? Math.round(1040 / mock.scale) : height }, colorScheme: 'dark',
    ...(mock.scale ? { deviceScaleFactor: mock.scale } : {}),
  });
  await ctx.addInitScript((m: Mock) => {
    // No RuneLite start-up toast over the screenshots: the stub app has no RuneLite to start.
    localStorage.setItem('osrs-put:runelite-autolaunch', '0');
    for (const [k, v] of Object.entries(m.localStorage ?? {})) localStorage.setItem(k, v);
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
      runelite: { check: async () => ({ ok: true, problems: [], clientVersion: '1.12.39', credentials: true }), launch: async () => ({ ok: true, state: 'started' }) },
      bridge: {
        request: async (method: string, path: string, body: unknown) => {
          posts.push({ method, path, body });
          if (m.offline) return { ok: false, status: 0, data: null };
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
  await page.route(/runescape\.wiki\/(?!api)/, (r) => r.abort());
  if (mock.market) {
    type Row = { id: number; limit: number | null; high: number | null; low: number | null; avgHigh: number | null; avgLow: number | null; highVolume: number; lowVolume: number };
    const rows = (JSON.parse(readFileSync(new URL('../tests/funding/fixtures/market-2026-10-18.json', import.meta.url), 'utf8')) as { items: Record<string, Row> }).items;
    await page.route(/prices\.runescape\.wiki\/api\/v[12]\/osrs\/(latest|1h|mapping)/, (r) => {
      const kind = /\/osrs\/(latest|1h|mapping)/.exec(r.request().url())![1];
      const now = Math.floor(Date.now() / 1000);
      if (kind === 'mapping') return r.fulfill({ json: Object.entries(rows).map(([name, x]) => ({ id: x.id, name, limit: x.limit ?? undefined, members: false })) });
      if (kind === 'latest') return r.fulfill({ json: { data: Object.fromEntries(Object.values(rows).map((x) => [x.id, { high: x.high, highTime: x.high === null ? null : now - 90, low: x.low, lowTime: x.low === null ? null : now - 120 }])) } });
      return r.fulfill({ json: { timestamp: now, data: Object.fromEntries(Object.values(rows).map((x) => [x.id, { avgHighPrice: x.avgHigh, highPriceVolume: x.highVolume, avgLowPrice: x.avgLow, lowPriceVolume: x.lowVolume }])) } });
    });
  } else {
    await page.route(/prices\.runescape\.wiki/, (r) => r.abort());
  }
  await page.goto(BASE + hash);
  await page.waitForTimeout(1600);
  return page;
}

// --- The characters

/** The reported Hill Giants character: Attack 30, Strength 21, Defence 1, 24 HP, Adamant scimitar and iron armour, little money. */
function hillGiants(opts: { coins?: number; bankSeen?: boolean; storage?: Record<string, string>; carriedFood?: number; items?: Record<string, [number, number]> } = {}): Mock {
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const inventory = opts.carriedFood ? [{ id: 329, name: 'Salmon', count: opts.carriedFood }] : [];
  const gear = { equipment, inventory, coins: opts.coins ?? 400, bankCoins: opts.bankSeen === false ? null : 0 };
  const from = steps.findIndex((x) => x.id === 'S4-03');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(steps.slice(from, from + 8).flatMap((x) => [...(x.itemsRequired ?? []), ...(x.itemsRecommended ?? [])])
    .flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])]).flatMap(sizesOf))];
  const owned = asked.map((name) => {
    const [carried, bank] = opts.items?.[name] ?? [worn.has(name) ? 1 : name === 'Salmon' ? opts.carriedFood ?? 0 : 0, 0];
    return { name, carried, noted: 0, bank };
  });
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  return {
    progress: progressBefore('S4-03'),
    localStorage: { 'osrs-put:active-step': 'S4-03', ...(opts.storage ?? {}) },
    status: { protocol: 6, inGame: true, player: 'Review Hero', activeStepId: 'S4-03', questPoints: 30, totalLevel: 150, stats, pos: { x: 3093, y: 3495, plane: 0 }, ...gear },
    events: [
      { type: 'OWNED', bankSeen: opts.bankSeen !== false, items: owned }, { type: 'GEAR', gear }, { type: 'QUESTS', done: [] },
      { type: 'STATS', stats }, { type: 'XP', xp: { attack: 13363, strength: 2000, defence: 0, hitpoints: 3500 } },
    ],
    market: true,
  };
}

/** A skiller between quests: real levels for the gathering skills, a free account, the bank read. */
function skiller(levels: Record<string, number>, storage: Record<string, string> = {}): Mock {
  return {
    progress: progressBefore('S4-03', { levels }),
    localStorage: { 'osrs-put:active-step': 'S4-03', ...storage },
    status: { protocol: 6, inGame: true, player: 'Review Hero', stats: levels, coins: 2500, bankCoins: 12000, equipment: [], inventory: [] },
    events: [{ type: 'STATS', stats: levels }, { type: 'OWNED', bankSeen: true, items: [] }],
    market: true,
  };
}

const SKILLER = { woodcutting: 32, firemaking: 30, fishing: 24, cooking: 30, mining: 31, smithing: 20, crafting: 12, magic: 33, prayer: 20, runecraft: 1, attack: 30, strength: 21, defence: 1, hitpoints: 24, ranged: 15 };

interface Shot {
  name: string;
  area: string;
  caption: string;
  width: number;
  hash: string;
  mock: Mock;
  /** Run before the capture: open folds, switch views. */
  act?: (page: Page) => Promise<void>;
  /** The element to capture; the full page when absent. */
  sel?: string;
  /** Keep the toasts (the preparation announcement) in the picture; by default they are hidden so they do not cover the area under review. */
  toasts?: boolean;
}

/** Opens the step's Preparation view (the coin card and the food plan live there). */
const prepView = async (p: Page) => {
  const tab = p.getByRole('tab', { name: 'Preparation' }).or(p.getByRole('link', { name: 'Preparation' })).or(p.getByRole('button', { name: 'Preparation' }));
  if (await tab.count()) await tab.first().click();
  await p.waitForTimeout(400);
};

const SHOTS: Shot[] = [
  { name: 'hill-giants-step', area: 'T4', caption: 'S4-03 step as the guide opens it for the reported character', width: 1440, hash: '#/step/S4-03', mock: hillGiants() },
  { name: 'quest-step-elvarg', area: 'T4', caption: 'S5-08, a quest step with stages, as the guide opens it', width: 1440, hash: '#/step/S5-08', mock: hillGiants() },
  { name: 'hill-giants-step-390', area: 'T4', caption: 'S4-03 step at phone width', width: 390, hash: '#/step/S4-03', mock: hillGiants() },
  { name: 'shopping', area: 'T7', caption: 'Shopping for the next trip', width: 1440, hash: '#/shopping', mock: hillGiants() },
  {
    name: 'shopping-ahead', area: 'T7', caption: 'Shopping, next trip: S4-03 needs nothing; the purchases for S4-04 and S4-05 are folded apart, the sum adds up', width: 1440,
    hash: '#/shopping', mock: hillGiants({ carriedFood: 25, coins: 1827 }),
    act: async (p) => { await p.locator('.shop-group-v2.is-ahead > summary').click(); await p.waitForTimeout(300); },
  },
  {
    name: 'shopping-doses', area: 'T7', caption: 'Shopping: 3 Strength potion doses owned for a 16-dose plan; the shortfall bought as a package of sizes', width: 1440,
    hash: '#/shopping', mock: hillGiants({ carriedFood: 25, coins: 1827, items: { 'Strength potion(3)': [0, 1] } }),
    act: async (p) => { await p.locator('.shop-group-v2.is-optional > summary').click(); await p.waitForTimeout(300); },
  },
  { name: 'gear', area: 'T6', caption: 'Gear for the fight ahead', width: 1440, hash: '#/gear', mock: hillGiants() },
  { name: 'skills', area: 'T5', caption: 'Skills overview', width: 1440, hash: '#/skills', mock: skiller(SKILLER) },
  { name: 'skill-woodcutting', area: 'T5', caption: 'Woodcutting: the near-term goal and one recommended method', width: 1440, hash: '#/skills/WC', mock: skiller(SKILLER) },
  {
    name: 'skill-roadmap', area: 'T5', caption: 'Mining roadmap: priority and members preview as separate controls, groups labelled by the levels they cover', width: 1440,
    hash: '#/skills/MI', mock: skiller(SKILLER),
    act: async (p) => { await p.getByRole('tab', { name: 'Roadmap' }).click(); await p.waitForTimeout(300); },
  },
  { name: 'skill-magic', area: 'T4', caption: 'Magic 33: the balanced default picks a method that is not the slowest AFK one', width: 1440, hash: '#/skills/MA', mock: skiller(SKILLER) },
  { name: 'settings', area: 'T8', caption: 'Settings', width: 1440, hash: '#/settings', mock: hillGiants() },
  { name: 'funding-card', area: 'T1', caption: 'The coin card on S4-03: the shortfall, one way to raise it, Start, and the link to the Money section', width: 1440, hash: '#/step/S4-03', mock: hillGiants(), act: prepView, sel: '.funding-card' },
  {
    name: 'funding-running', area: 'T1', caption: 'The coin plan running: the step in hand, its count, Pause and Cancel', width: 1440, hash: '#/step/S4-03', mock: hillGiants(),
    act: async (p) => { await prepView(p); await p.locator('.funding-card .btn-primary').click(); await p.waitForTimeout(800); }, sel: '.funding-card',
  },
  {
    name: 'combat-why', area: 'T3', caption: 'S4-03: "Why this plan?" from the status line opens the comparison of plans', width: 1440, hash: '#/step/S4-03', mock: hillGiants(),
    act: async (p) => { await p.locator('.status-combat-route').getByRole('button', { name: 'Why this plan?' }).first().click(); await p.waitForTimeout(600); }, sel: '.combat-route',
  },
  { name: 'money', area: 'T2', caption: 'Money: the reported character, 400 gp, S4-03 short of coins: ranked for the shortfall', width: 1440, hash: '#/money', mock: hillGiants() },
  {
    name: 'money-details', area: 'T2', caption: 'Money: the recommendation\'s details (requirements, where and how, the money, sources folded)', width: 1440, hash: '#/money', mock: hillGiants(),
    act: async (p) => { await p.locator('.money-reco').getByRole('button', { name: 'Details' }).click(); await p.waitForTimeout(300); },
  },
  {
    name: 'money-start', area: 'T2', caption: 'Money: Start asks for the goal (more coins, the step\'s shortfall, an open session)', width: 1440, hash: '#/money', mock: hillGiants(),
    act: async (p) => { await p.locator('.money-reco').getByRole('button', { name: 'Start…' }).click(); await p.waitForTimeout(300); },
  },
  { name: 'money-skiller', area: 'T2', caption: 'Money: a skiller with 14,500 gp and the bank read, no shortfall: ranked for 10,000 more', width: 1440, hash: '#/money', mock: skiller(SKILLER) },
  {
    name: 'money-locked', area: 'T2', caption: 'Money: "Show locked methods" lists what is missing for each', width: 1440, hash: '#/money', mock: skiller(SKILLER),
    act: async (p) => { await p.locator('.money-filters-toggle').click(); await p.getByLabel('Show locked methods').check(); await p.waitForTimeout(300); },
  },
  { name: 'money-offline', area: 'T2', caption: 'Money: RuneLite not connected: published figures, nothing confirmed', width: 1440, hash: '#/money', mock: { ...hillGiants(), offline: true } },
  { name: 'money-390', area: 'T2', caption: 'Money at phone width', width: 390, hash: '#/money', mock: hillGiants() },
];

async function main(browser: Browser) {
  mkdirSync(OUT, { recursive: true });
  const manifest: { file: string; area: string; caption: string; data: 'fixture' }[] = [];
  let n = 0;
  for (const s of SHOTS) {
    n++;
    if (FILTER && !s.name.includes(FILTER)) continue;
    const page = await open(browser, s.width, s.mock, s.hash);
    if (!s.toasts) await page.addStyleTag({ content: '.toast-region { display: none !important; }' });
    if (s.act) await s.act(page);
    await page.waitForTimeout(400);
    // A full-page capture of a scrolled page draws the fixed sidebar where the scroll left it.
    if (!s.sel) await page.evaluate(() => window.scrollTo(0, 0));
    const file = `${String(n).padStart(2, '0')}-${s.name}.png`;
    if (s.sel) await page.locator(s.sel).first().screenshot({ path: `${OUT}/${file}` });
    else await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
    manifest.push({ file, area: s.area, caption: `${s.caption} (fixture data)`, data: 'fixture' });
    console.log(`  ${file}`);
    await page.context().close();
  }
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error(`The preview server did not come up on ${BASE}: run npm run build first`);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await main(browser);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
