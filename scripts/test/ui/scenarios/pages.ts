// Every page: errors, overflow, CSP, scaling: scenarios of the browser suite (npm run test:ui -- --only pages).
import { readFileSync } from 'node:fs';
import type { Browser } from 'playwright';
import { steps, progressBefore, open, settle, expect, noOverflow } from '../harness.ts';

async function allPages(browser: Browser) {
  // All the pages: steps, skills, the reference — open without console errors, without a crash and horizontal scrolling.
  console.log('All the pages');
  const skillIds = [
    ...(JSON.parse(readFileSync(new URL('../../../../src/data/skills.json', import.meta.url), 'utf8')) as { id: string }[]).map((x) => x.id),
    ...(JSON.parse(readFileSync(new URL('../../../../src/data/members-skills.json', import.meta.url), 'utf8')) as { skills: { id: string }[] }).skills.map((x) => x.id),
  ];
  const routes = ['#/', '#/skills', '#/goals', '#/quests', '#/reference', '#/settings', '#/shopping', '#/gear',
    ...steps.map((x) => `#/step/${x.id}`), ...skillIds.map((id) => `#/skills/${id}`)];
  for (const width of [1280]) {
    const { page, errors } = await open(browser, width, { progress: progressBefore('S2-10') }, '#/');
    const bad: string[] = [];
    for (const r of routes) {
      const before = errors.length;
      await page.evaluate((h) => { location.hash = h; }, r);
      await settle(page);
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
}

async function csp(browser: Browser) {
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
}

async function header(browser: Browser) {
  // The header fits at any width when RuneLite is connected (it used to overflow by 11–193 px).
  console.log('Header');
  for (const scale of [1, 1.5]) for (const width of [900, 1280, 1920]) {
    const { page } = await open(browser, width, {progress:progressBefore('S3-03'),localStorage:{'osrs-put:text-scale':String(scale)}}, '#/');
    expect(await noOverflow(page), `the header at ${width} px and ${scale*100}% text without horizontal scrolling`);
    if (width >= 1000) expect(await page.locator('.la-spine').evaluate(el => el.scrollWidth <= el.clientWidth), `spine at ${width} px and ${scale*100}% text without internal horizontal scrolling`);
    if (width >= 1000) expect(await page.evaluate(() => [...document.querySelectorAll('.la-spine a')].length === 6
      && [...document.querySelectorAll('.la-spine a')].every((a) => a.getBoundingClientRect().bottom <= innerHeight + 1)), `spine at ${width} px and ${scale*100}% text: all six sections are on screen`);
    await page.context().close();
  }
}

async function sectionStrip(browser: Browser) {
  // The local strip of a section shows every link: the first one used to take the whole width and push the rest out of view.
  console.log('Section strip');
  // Shopping (2.67) and Gear (2.68) have no strip: one short page each.
  for (const [hash, least, links] of [['#/journal', 2, '.journal-views a'], ['#/reference', 3, '.reference-index .nav-list a']] as [string, number, string][]) {
    for (const width of [1000, 1440]) {
      const { page } = await open(browser, width, { progress: progressBefore('S3-03') }, hash);
      if (hash === '#/journal') {
        expect(await page.locator('.la-pg.journal').count() === 2 && await page.locator('.la-pg.la-l .journal-pane').count() === 1 && await page.getByRole('region', { name: 'Selected quest' }).count() === 1 && await page.locator('.journal-session:not([open])').count() === 1 && await page.locator('.journal-views').count() === 0, `Journal ${width}: quests and session remain without the retired stage navigation`);
        expect(await noOverflow(page), `Journal ${width}: no horizontal overflow`);
        await page.context().close();
        continue;
      }
      const seen = await page.evaluate((links) => {
        const nav = document.querySelector(links)?.closest('.la-pg');
        if (!nav) return -1;
        const box = nav.getBoundingClientRect();
        return [...nav.querySelectorAll(links)].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= box.left - 1 && r.right <= box.right + 1;
        }).length;
      }, links);
      expect(seen >= least, `section strip ${hash} at ${width} px: ${seen} links in view (at least ${least})`);
      await page.context().close();
    }
  }
}

async function visualReview(browser: Browser) {
  // The visual review at Windows display scaling (UI_SCALES=1): a 1920×1040 screen at 100, 125 and 150%, every main page with a linked game on the
  // Minotaur step. Screenshots go to UI_SHOTS as scale-<percent>-<page>.png for the eye; the checks are the ones a review needs every time.
  if (process.env.UI_SCALES) {
    const equipment = [[1329, 'Mithril scimitar', 'weapon'], [1153, 'Iron full helm', 'head'], [1115, 'Iron platebody', 'body'], [1081, 'Iron plateskirt', 'legs'], [1191, 'Iron kiteshield', 'shield']]
      .map(([id, name, slot]) => ({ id, name, slot }));
    const gear = { equipment, inventory: [{ id: 1759, name: 'Ball of wool', count: 23 }], coins: 500, bankCoins: 3000 };
    const stats = { attack: 22, strength: 16, defence: 1, hitpoints: 22 };
    const xp = { attack: 5624, strength: 2746, defence: 0, hitpoints: 2400 };
    const pages: [string, string][] = [['home', '#/'], ['step', '#/step/S3-08'], ['shopping', '#/shopping'], ['skills', '#/skills'], ['gear', '#/gear'], ['money', '#/money'], ['journal', '#/journal'], ['settings', '#/settings']];
    for (const scale of [1, 1.25, 1.5]) {
      for (const [name, hash] of pages) {
        const { page, errors } = await open(browser, Math.round(1920 / scale), {
          scale, progress: progressBefore('S3-08'), localStorage: { 'osrs-put:active-step': 'S3-08' },
          status: { protocol: 6, ...gear, stats, xp, activeStepId: 'S3-08', player: 'Scale Test' },
          events: [{ type: 'STATS', stats }, { type: 'XP', xp }, { type: 'GEAR', gear }, { type: 'OWNED', bankSeen: true, items: [{ name: 'Salmon', carried: 0, noted: 0, bank: 13 }] }],
        }, hash);
        await settle(page);
        const pct = Math.round(scale * 100);
        expect(await noOverflow(page), `scale ${pct}%: ${name} without horizontal scrolling`);
        const clipped = await page.evaluate(() => [...document.querySelectorAll('button, .btn')].filter((b) => {
          const el = b as HTMLElement;
          return el.offsetParent !== null && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible';
        }).length);
        expect(clipped === 0, `scale ${pct}%: ${name} has no clipped button text (${clipped})`);
        expect(errors.length === 0, `scale ${pct}%: ${name} no console errors ${errors.join('; ')}`);
        if (process.env.UI_SHOTS) await page.screenshot({ path: `${process.env.UI_SHOTS}/scale-${pct}-${name}.png`, fullPage: true }).catch(() => {});
        await page.context().close();
      }
    }
  }
}

export const scenarios = {
  'all-pages': allPages,
  'csp': csp,
  'header': header,
  'section-strip': sectionStrip,
  'visual-review': visualReview,
};
