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

// ---------- The recommended transport on its way to the game ----------
import { stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { planPayload, buildEnvelope, EMPTY_PARTS } from '../src/lib/prepEnvelope';
import { recommendedTransport, type RecommendedTransport } from '../src/lib/transport';
import { travelOptions, type TravelInput } from '../src/lib/travel';
import type { GearItem } from '../src/services/runeliteBridge';

describe('bridge serialization: the transport carries its kind, its stop, its interaction and a short chip', () => {
  const at = (x: number, y: number, plane = 0) => ({ x, y, plane });
  const bag = (...rows: [string, number][]): GearItem[] => rows.map(([name, count], i) => ({ id: i + 1, name, count }));
  const plan = () => {
    const state = buildPlayerState({
      mode: 'f2p', stats: null, progress: { levels: {} }, owned: { bankSeen: true, items: new Map() }, gear: { equipment: [], inventory: [], coins: 600, bankCoins: 0 }, questsDone: null, connected: true,
    });
    return createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: 0, mode: 'f2p', state }).plan(stepById.get('S2-12')!);
  };
  const best = (over: Partial<TravelInput>): RecommendedTransport => {
    const t = recommendedTransport(travelOptions({ from: at(3093, 3244), to: at(3213, 3428), levels: {}, carried: null, bankSeen: true, ...over }));
    expect(t).not.toBeNull();
    return t!;
  };

  const cases: [string, Partial<TravelInput>, string][] = [
    ['item_teleport', { carried: bag(['Chronicle', 1]) }, '⚡ Use Chronicle → Champions\' Guild'],
    ['tablet', { carried: bag(['Varrock teleport', 1]) }, '⚡ Break Varrock teleport tablet → Varrock Square'],
    ['spell_teleport', { levels: { magic: 25 }, carried: bag(['Law rune', 1], ['Air rune', 3], ['Fire rune', 1]) }, '⚡ Cast Varrock Teleport → Varrock Square'],
    ['canoe', { from: at(3241, 3237), to: at(3110, 3409), levels: { woodcutting: 27 }, carried: bag(['Bronze axe', 1]) }, '⚡ Canoe: Lumbridge → Barbarian Village'],
    ['ferry', { from: at(2915, 3226), to: at(2558, 2858), carried: bag(['Coins', 0]) }, '⚡ Ferry: talk to Captain Tock → Corsair Cove'],
  ];

  it.each(cases)('%s: the chip says what to click, the record is complete, and nothing is activated by the app', (type, over, chip) => {
    const t = best(over);
    expect(t.type).toBe(type);
    expect(t.chip).toBe(chip);
    expect(t.chip.length).toBeLessThanOrEqual(60);
    expect(t.chip.startsWith('⚡ ')).toBe(true);
    expect(Number.isInteger(t.interactionId) && t.interactionId >= 0).toBe(true);
    expect(t.text.length).toBeGreaterThan(10);
    if (type === 'canoe' || type === 'ferry') {
      expect(t.tile, 'a canoe or a ferry has a first stop for the arrow').toBeDefined();
      expect(t.interactionName).toBeTruthy();
    }
    if (type === 'item_teleport' || type === 'tablet') expect(t.item).toBeTruthy();
  });

  it('the plan payload carries all of it to the plugin, and the envelope keeps it for the step it was made for', () => {
    const t = best({ carried: bag(['Chronicle', 1]) });
    const payload = planPayload(plan(), { transport: t });
    expect(payload.recommendedTransport).toMatchObject({ type: 'item_teleport', item: 'Chronicle', interactionId: 0, chip: t.chip });
    const env = buildEnvelope({ ...EMPTY_PARTS, plan: payload }, 7);
    expect(env.plan?.recommendedTransport?.chip).toBe(t.chip);
    const ferry = planPayload(plan(), { transport: best({ from: at(2915, 3226), to: at(2558, 2858), carried: bag(['Coins', 0]) }) });
    expect(ferry.recommendedTransport).toMatchObject({ type: 'ferry', interactionName: 'Captain Tock', tile: { x: 2910, y: 3226, plane: 0 } });
  });

  it('a transport with no chip (an older record) still serializes without one', () => {
    const t = { ...best({ carried: bag(['Chronicle', 1]) }), chip: '' };
    expect(planPayload(plan(), { transport: t }).recommendedTransport).not.toHaveProperty('chip');
  });

  it('a chip longer than the limit is cut, not refused', () => {
    const t = { ...best({ carried: bag(['Chronicle', 1]) }), chip: `⚡ ${'x'.repeat(200)}` };
    expect(planPayload(plan(), { transport: t }).recommendedTransport!.chip!.length).toBeLessThanOrEqual(60);
  });
});
