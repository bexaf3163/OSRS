import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allSteps, items, plugins, reference, skills, stepsFor } from '../src/data';
import { blocksText, buildIndex, search } from '../src/lib/search';
import { parseHash } from '../src/lib/router';
import { Inline } from '../src/components/Inline';

const transport = reference.sections.find((s) => s.id === 'transport');
const transportText = blocksText(transport?.blocks ?? []);

/** All the strings the user sees: steps, the reference, skills. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const allTexts = strings([allSteps, reference, skills]);

describe('the "Teleports, canoes and boats" reference', () => {
  it('the section exists and comes after "If you do not know what to do"', () => {
    const ids = reference.sections.map((s) => s.id);
    expect(ids.indexOf('transport')).toBe(ids.indexOf('stuck') + 1);
    expect(transport!.title).toBe('Teleports, canoes and boats');
  });

  it('explains how to use each method', () => {
    for (const fact of [
      'Lumbridge Home Teleport', '30 minutes', 'Count Check', 'Where can I learn more about security?',
      'right-click the book, Teleport', 'Check charges', '1 Law rune, 3 Air rune and 1 Fire rune',
      'Chop-down', 'Shape-Canoe', 'Float Log', 'Paddle Log', 'Store-axe', 'Wilderness Pond',
      'Captain Tobias', 'Customs officer', 'Can I journey on this ship?', 'Luthas',
    ]) expect(transportText, fact).toContain(fact);
  });

  it('Home Teleport: what it is, where, under what condition and what to do if it is unavailable (§70)', () => {
    for (const fact of [
      'Standard spellbook', 'needs no runes or Magic level', 'the first icon', '14 seconds', 'once every 30 minutes',
      'It does not work in combat', 'deeper than Wilderness level 20', 'If the icon is grey', 'Lumbridge Teleport for runes',
      'Use Home Teleport spells',
    ]) expect(transportText, fact).toContain(fact);
    // The step where the route counts on it has a fallback.
    const s109 = stepsFor('f2p').find((s) => s.id === 'S1-09')!;
    const exit = s109.quickSteps!.find((q) => q.includes('Lumbridge Home Teleport'))!;
    expect(exit).toContain('icon is grey');
    expect(exit).toContain('Climb-up');
  });

  it('is found by search', () => {
    const index = buildIndex({ steps: stepsFor('f2p'), skills, reference, plugins, items, typeLabel: {} });
    for (const q of ['Home Teleport', 'canoe', 'Customs officer']) {
      expect(search(index, q).slice(0, 5).map((h) => h.item.href), q).toContain('#/reference/transport');
    }
  });

  it('the canoe table: the woodcutting level and the number of stops from the wiki', () => {
    const table = transport!.blocks.find((b) => b.t === 'table' && b.head[0] === 'Canoe');
    expect(table && table.t === 'table' && table.rows.map((r) => [r[0], r[1], r[3]])).toEqual([
      ['Log', '12', '1'], ['Dugout', '27', '2'], ['Stable Dugout', '42', '3'], ['Waka', '57', 'Any station, including the one in the Wilderness'],
    ]);
  });
});

describe('action names match the game', () => {
  // The client cache: the canoe station — Chop-down, Shape-Canoe, Float Log/Canoe, Paddle Log/Canoe;
  // the Chronicle book — Wield, Teleport, Check charges, Destroy. The bartender on Karamja — Zembo.
  it('the canoe station has only real menu items', () => {
    const quoted = allTexts.flatMap((t) => [...t.matchAll(/"((?:Chop|Shape|Float|Paddle)[^"]*)"/g)].map((m) => m[1]));
    expect(quoted.length).toBeGreaterThan(10);
    for (const q of quoted) expect(['Chop-down', 'Shape-Canoe', 'Float Log', 'Float Canoe', 'Paddle Log', 'Paddle Canoe']).toContain(q);
  });

  it('there is no Rub action on the book and no bartender Zambo', () => {
    expect(allTexts.filter((t) => /\bRub\b|\bZambo\b/.test(t))).toEqual([]);
  });
});

describe('links inside the app', () => {
  it('every #/… link from the data leads to an existing page', () => {
    const links = allTexts.flatMap((t) => [...t.matchAll(/\]\((#\/[^)]+)\)/g)].map((m) => m[1]));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      const route = parseHash(href);
      expect(route.page, href).toBe('reference');
      expect(reference.sections.some((s) => s.id === route.param), href).toBe(true);
    }
  });

  it('Inline turns #/… into a link in the same tab, and external ones into a new one', () => {
    const html = (text: string) => renderToStaticMarkup(createElement(Inline, { text }));
    expect(html('See [the reference](#/reference/transport).')).toBe('See <a href="#/reference/transport">the reference</a>.');
    expect(html('[wiki](https://oldschool.runescape.wiki/w/Canoe)')).toBe(
      '<a href="https://oldschool.runescape.wiki/w/Canoe" target="_blank" rel="noopener noreferrer">wiki</a>');
    expect(html('[file](docs/readme.md)')).toBe('<span>file</span>');
  });
});
