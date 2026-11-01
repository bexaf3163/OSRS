// Desktop-only QA: phone viewports retired by owner decision2026-10-28. Keep desktop sizes, themes and DPI coverage.
// npm run test:ui — a run of the interface in a real browser (Chromium through Playwright), as the player has it in the exe:
// the built page, a stub desktop app (window.osrsDesktop) and a stub RuneLite bridge. The network to the wiki
// is closed — it checks that everything works without it too. It needs a build (npm run build) and Chromium
// (npx playwright install chromium). These scenarios used to live outside the repository.
// Scenarios live per feature in scenarios/; --list names them, --only <feature or scenario>[,...] runs a part.
import { AsyncLocalStorage } from 'node:async_hooks';
import { chromium, type Browser } from 'playwright';
import { failures, settleTimeouts, startServer, stopServer } from './harness.ts';
import { scenarios as ledger } from './scenarios/ledger.ts';
import { scenarios as step } from './scenarios/step.ts';
import { scenarios as map } from './scenarios/map.ts';
import { scenarios as bridge } from './scenarios/bridge.ts';
import { scenarios as prep } from './scenarios/prep.ts';
import { scenarios as combat } from './scenarios/combat.ts';
import { scenarios as skills } from './scenarios/skills.ts';
import { scenarios as shopping } from './scenarios/shopping.ts';
import { scenarios as gear } from './scenarios/gear.ts';
import { scenarios as money } from './scenarios/money.ts';
import { scenarios as journal } from './scenarios/journal.ts';
import { scenarios as reference } from './scenarios/reference.ts';
import { scenarios as settings } from './scenarios/settings.ts';
import { scenarios as pages } from './scenarios/pages.ts';

const FEATURES = { ledger, step, map, bridge, prep, combat, skills, shopping, gear, money, journal, reference, settings, pages };
if (process.argv.includes('--list')) {
  for (const [feature, s] of Object.entries(FEATURES)) console.log(`${feature}: ${Object.keys(s).join(', ')}`);
  process.exit(0);
}
const at = process.argv.indexOf('--only');
const only = at < 0 ? null : (process.argv[at + 1] ?? '').split(',');
const chosen = Object.entries(FEATURES).flatMap(([feature, s]) => Object.entries(s).filter(([name]) => !only || only.includes(feature) || only.includes(name)));
if (!chosen.length) {
  console.error(`--only ${only?.join(',')} names no feature or scenario; npm run test:ui -- --list shows them`);
  process.exit(2);
}

// Two scenarios run at a time, each in its own browser contexts; a scenario's lines print together when it ends.
const own = new AsyncLocalStorage<string[]>();
const print = console.log;
console.log = (...args: unknown[]) => { const lines = own.getStore(); if (lines) lines.push(args.join(' ')); else print(...args); };
const queue = [...chosen];
async function work(browser: Browser) {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [, scenario] = next, lines: string[] = [];
    await own.run(lines, () => scenario(browser)).finally(() => print(lines.join('\n')));
  }
}

try {
  await startServer();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await Promise.all([work(browser), work(browser)]);
  } finally {
    await browser.close();
  }
} finally {
  stopServer();
}
if (settleTimeouts) console.log(`\nsettle() waited its full time ${settleTimeouts} times: a page kept short timers or requests going`);
console.log(failures.length ? `\nTotal: ${failures.length} failed` : '\nTotal: everything passed');
process.exit(failures.length ? 1 : 0);
