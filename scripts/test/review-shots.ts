// Screenshots for a review package: every work area of the guide in the built page with the browser suite's stub desktop app and RuneLite
// bridge (scripts/test/ui/harness.ts). These are FIXTURE screenshots: the player state is written here, not read from a game. They are labelled so in the
// manifest. Usage: npm run build, then REVIEW_OUT=<folder> node scripts/test/review-shots.ts [filter]. Writes <folder>/<nn>-<name>.png and manifest.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { open as openPage, progressBefore as before, reveal, settle, startServer, steps as allSteps, stopServer, type Mock } from './ui/harness.ts';

const OUT = process.env.REVIEW_OUT ?? 'review-shots';
const FILTER = process.argv[2] ?? '';
type ShotItem = { nameEn: string; anyOf?: string[] };
const steps = allSteps as { id: string; itemsRequired?: ShotItem[]; itemsRecommended?: ShotItem[] }[];
/** The game reports every size of a potion once one is asked about (ItemCounts.report, 2.73.0). */
const sizesOf = (name: string) => {
  const m = /^(.*\S)\((\d)\)$/.exec(name);
  return m && /potion$/i.test(m[1]) ? [1, 2, 3, 4].map((d) => `${m[1]}(${d})`) : [name];
};

function progressBefore(id: string, extra: Record<string, unknown> = {}) {
  const p = before(id, { updatedAt: '2026-10-19T10:00:00.000Z', gameMode: 'f2p' });
  // The one-time "the guide updated" banner is not part of any work area: its steps count as checked.
  return { ...p, ...extra };
}

/** The suite's page with the review's look: no RuneLite start-up toast (the stub app has no RuneLite to start) and no
 * transitions, so a capture never lands mid-animation. */
async function open(browser: Browser, width: number, mock: Mock, hash: string): Promise<Page> {
  const { page } = await openPage(browser, width, { ...mock, localStorage: { 'osrs-put:runelite-autolaunch': '0', ...mock.localStorage } }, hash);
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  await settle(page);
  return page;
}

// --- The characters

/** The reported Hill Giants character: Attack 30, Strength 21, Defence 1, 24 HP, Adamant scimitar and iron armour, little money. */
function hillGiants(opts: { coins?: number; bankSeen?: boolean; storage?: Record<string, string>; carriedFood?: number; items?: Record<string, [number, number]> } = {}): Mock {
  const equipment = ([[1331, 'Adamant scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']] as [number, string, string][])
    .map(([id, name, slot]) => ({ id, name, slot }));
  const inventory = opts.carriedFood ? [{ id: 329, name: 'Salmon', count: opts.carriedFood }] : [];
  const gear = { equipment, inventory, coins: opts.coins ?? 400, bankCoins: opts.bankSeen === false ? null : 0 };
  const from = steps.findIndex((x) => x.id === 'S5-06');
  const worn = new Set(equipment.map((e) => e.name));
  const asked = [...new Set(steps.slice(from, from + 8).flatMap((x) => [...(x.itemsRequired ?? []), ...(x.itemsRecommended ?? [])])
    .flatMap((i) => [i.nameEn, ...(i.anyOf ?? [])]).flatMap(sizesOf))];
  const owned = asked.map((name) => {
    const [carried, bank] = opts.items?.[name] ?? [worn.has(name) ? 1 : name === 'Salmon' ? opts.carriedFood ?? 0 : 0, 0];
    return { name, carried, noted: 0, bank };
  });
  const stats = { attack: 30, strength: 21, defence: 1, hitpoints: 24 };
  return {
    progress: progressBefore('S5-06'),
    localStorage: { 'osrs-put:active-step': 'S5-06', ...(opts.storage ?? {}) },
    status: { protocol: 6, inGame: true, player: 'Review Hero', activeStepId: 'S5-06', questPoints: 30, totalLevel: 150, stats, pos: { x: 3093, y: 3495, plane: 0 }, ...gear },
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
    progress: progressBefore('S5-06', { levels }),
    localStorage: { 'osrs-put:active-step': 'S5-06', ...storage },
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


const SHOTS: Shot[] = [
  { name: 'hill-giants-step', area: 'T4', caption: 'S5-06 step as the guide opens it for the reported character', width: 1440, hash: '#/step/S5-06', mock: hillGiants() },
  { name: 'quest-step-elvarg', area: 'T4', caption: 'S5-08, a quest step with stages, as the guide opens it', width: 1440, hash: '#/step/S5-08', mock: hillGiants() },
  { name: 'hill-giants-step-390', area: 'T4', caption: 'S5-06 step at phone width', width: 390, hash: '#/step/S5-06', mock: hillGiants() },
  { name: 'shopping', area: 'T7', caption: 'Shopping for the next trip', width: 1440, hash: '#/shopping', mock: hillGiants() },
  {
    name: 'shopping-ahead', area: 'T7', caption: 'Shopping, next trip: what S5-06 needs now; later purchases are folded apart, the sum adds up', width: 1440,
    hash: '#/shopping', mock: hillGiants({ carriedFood: 25, coins: 1827 }),
    act: async (p) => { await p.locator('.shop-group-v2.is-ahead > summary').click(); await settle(p); },
  },
  {
    name: 'shopping-doses', area: 'T7', caption: 'Shopping: 3 Strength potion doses owned for a 16-dose plan; the shortfall bought as a package of sizes', width: 1440,
    hash: '#/shopping', mock: hillGiants({ carriedFood: 25, coins: 1827, items: { 'Strength potion(3)': [0, 1] } }),
    act: async (p) => { await p.locator('.shop-group-v2.is-optional > summary').click(); await settle(p); },
  },
  { name: 'gear', area: 'T6', caption: 'Gear for the fight ahead', width: 1440, hash: '#/gear', mock: hillGiants() },
  { name: 'skills', area: 'T5', caption: 'Skills overview', width: 1440, hash: '#/skills', mock: skiller(SKILLER) },
  { name: 'skill-woodcutting', area: 'T5', caption: 'Woodcutting: the near-term goal and one recommended method', width: 1440, hash: '#/skills/WC', mock: skiller(SKILLER) },
  {
    name: 'skill-plan', area: 'T5', caption: 'Mining, the Plan tab: iron dropped toward the goal 45, the plan details and the other methods', width: 1440,
    hash: '#/skills/MI', mock: skiller(SKILLER),
    act: async (p) => { await p.getByRole('tab', { name: 'Plan', exact: true }).click(); await settle(p); },
  },
  {
    name: 'skill-melee', area: 'T5', caption: 'Melee reference: giant frogs from 20, the other options under the plan', width: 1440, hash: '#/skills/ME', mock: skiller(SKILLER),
    act: async (p) => { await p.getByRole('tab', { name: 'Reference' }).or(p.getByRole('button', { name: 'Reference' })).first().click(); await settle(p); },
  },
  {
    name: 'skill-melee-plan', area: 'T5', caption: 'Melee, the Plan tab: giant frogs toward Attack 40 and the other methods', width: 1440, hash: '#/skills/ME', mock: skiller(SKILLER),
    act: async (p) => { await p.getByRole('tab', { name: 'Plan', exact: true }).click(); await settle(p); },
  },
  { name: 'skill-melee-guide', area: 'T10', caption: 'Melee training guide for the reported character: the method ranked by the combat model (XP an hour for this gear)', width: 1440, hash: '#/skills/ME', mock: hillGiants() },
  { name: 'skill-ranged', area: 'T11', caption: 'Ranged: the training card with the arrows for the whole goal', width: 1440, hash: '#/skills/RA', mock: skiller(SKILLER) },
  { name: 'skill-magic', area: 'T4', caption: 'Magic 33: the balanced default picks a method that is not the slowest AFK one', width: 1440, hash: '#/skills/MA', mock: skiller(SKILLER) },
  { name: 'settings', area: 'T8', caption: 'Settings', width: 1440, hash: '#/settings', mock: hillGiants() },
  { name: 'funding-card', area: 'T1', caption: 'The coin card on S5-06 with no coins: the shortfall, one way to raise it, Start, and the link to the Money section', width: 1440, hash: '#/step/S5-06', mock: hillGiants({ coins: 0 }), act: (p) => reveal(p, '.funding-card'), sel: '.funding-card' },
  {
    name: 'funding-running', area: 'T1', caption: 'The coin plan running: the step in hand, its count, Pause and Cancel', width: 1440, hash: '#/step/S5-06', mock: hillGiants({ coins: 0 }),
    act: async (p) => { await reveal(p, '.funding-card'); await p.locator('.funding-card .btn-primary').click(); await settle(p); }, sel: '.funding-card',
  },
  { name: 'money', area: 'T2', caption: 'Money: the reported character, 400 gp, S5-06 short of coins: ranked for the shortfall', width: 1440, hash: '#/money', mock: hillGiants() },
  {
    name: 'money-details', area: 'T2', caption: 'Money: the recommendation\'s details (requirements, where and how, the money, sources folded)', width: 1440, hash: '#/money', mock: hillGiants(),
    act: async (p) => { await p.locator('.money-reco').getByRole('button', { name: 'Details' }).click(); await settle(p); },
  },
  {
    name: 'money-start', area: 'T2', caption: 'Money: Start asks for the goal (more coins, the step\'s shortfall, an open session)', width: 1440, hash: '#/money', mock: hillGiants(),
    act: async (p) => { await p.locator('.money-reco').getByRole('button', { name: 'Start…' }).click(); await settle(p); },
  },
  { name: 'money-skiller', area: 'T2', caption: 'Money: a skiller with 14,500 gp and the bank read, no shortfall: ranked for 10,000 more', width: 1440, hash: '#/money', mock: skiller(SKILLER) },
  {
    name: 'money-locked', area: 'T2', caption: 'Money: "Show locked methods" lists what is missing for each', width: 1440, hash: '#/money', mock: skiller(SKILLER),
    act: async (p) => { await p.locator('.money-filters-toggle').click(); await p.getByLabel('Show locked methods').check(); await settle(p); },
  },
  { name: 'money-offline', area: 'T2', caption: 'Money: RuneLite not connected: published figures, nothing confirmed', width: 1440, hash: '#/money', mock: { ...hillGiants(), offline: true } },
  { name: 'money-390', area: 'T2', caption: 'Money at phone width', width: 390, hash: '#/money', mock: hillGiants() },
  { name: 'narrow', area: 'T14', caption: 'The Path page in a narrow window beside the game (560 px)', width: 560, hash: '#/', mock: hillGiants() },
  { name: 'journal', area: 'T14', caption: 'Journal as it opens for the reported character', width: 1440, hash: '#/journal', mock: hillGiants() },
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
    await settle(page);
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

await startServer();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await main(browser);
} finally {
  await browser.close();
  stopServer();
}
