import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allSteps, items, plugins, reference, skills, stepsFor } from '../src/data';
import { blocksText, buildIndex, search } from '../src/lib/search';
import { parseHash } from '../src/lib/router';
import { Inline } from '../src/components/Inline';

const transport = reference.sections.find((s) => s.id === 'transport');
const transportText = blocksText(transport?.blocks ?? []);

/** Все строки, которые видит пользователь: шаги, справка, навыки. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const allTexts = strings([allSteps, reference, skills]);

describe('справка «Телепорты, каноэ и лодки»', () => {
  it('раздел есть и стоит после «Если не знаешь, что делать»', () => {
    const ids = reference.sections.map((s) => s.id);
    expect(ids.indexOf('transport')).toBe(ids.indexOf('stuck') + 1);
    expect(transport!.title).toBe('Телепорты, каноэ и лодки');
  });

  it('объясняет, как пользоваться каждым способом', () => {
    for (const fact of [
      'Lumbridge Home Teleport', '30 минут', 'Count Check', 'Where can I learn more about security?',
      'правый клик по книге → Teleport', 'Check charges', '1 Law rune, 3 Air rune и 1 Fire rune',
      'Chop-down', 'Shape-Canoe', 'Float Log', 'Paddle Log', 'Store-axe', 'Wilderness Pond',
      'Captain Tobias', 'Customs officer', 'Can I journey on this ship?', 'Luthas',
    ]) expect(transportText, fact).toContain(fact);
  });

  it('Home Teleport: что это, где, при каком условии и что делать, если он недоступен (§70)', () => {
    for (const fact of [
      'Standard spellbook', 'руны и уровень магии не нужны', 'первый значок', '14 секунд', 'раз в 30 минут',
      'В бою не работает', 'Глубже 20-го уровня Wilderness', 'Если значок серый', 'Lumbridge Teleport за руны',
      'Use Home Teleport spells',
    ]) expect(transportText, fact).toContain(fact);
    // У шага, где маршрут на него рассчитывает, есть запасной выход.
    const s109 = stepsFor('f2p').find((s) => s.id === 'S1-09')!;
    const exit = s109.quickSteps!.find((q) => q.includes('Lumbridge Home Teleport'))!;
    expect(exit).toContain('значок серый');
    expect(exit).toContain('Climb-up');
  });

  it('находится поиском', () => {
    const index = buildIndex({ steps: stepsFor('f2p'), skills, reference, plugins, items, typeLabel: {} });
    for (const q of ['Home Teleport', 'каноэ', 'Customs officer']) {
      expect(search(index, q).slice(0, 5).map((h) => h.item.href), q).toContain('#/reference/transport');
    }
  });

  it('таблица каноэ: уровень рубки и число остановок по вики', () => {
    const table = transport!.blocks.find((b) => b.t === 'table' && b.head[0] === 'Каноэ');
    expect(table && table.t === 'table' && table.rows.map((r) => [r[0], r[1], r[3]])).toEqual([
      ['Log', '12', '1'], ['Dugout', '27', '2'], ['Stable Dugout', '42', '3'], ['Waka', '57', 'Любая станция, в том числе в Wilderness'],
    ]);
  });
});

describe('названия действий совпадают с игрой', () => {
  // Кэш клиента: станция каноэ — Chop-down, Shape-Canoe, Float Log/Canoe, Paddle Log/Canoe;
  // книга Chronicle — Wield, Teleport, Check charges, Destroy. Бармен на Karamja — Zembo.
  it('у станции каноэ только настоящие пункты меню', () => {
    const quoted = allTexts.flatMap((t) => [...t.matchAll(/«((?:Chop|Shape|Float|Paddle)[^»]*)»/g)].map((m) => m[1]));
    expect(quoted.length).toBeGreaterThan(10);
    for (const q of quoted) expect(['Chop-down', 'Shape-Canoe', 'Float Log', 'Float Canoe', 'Paddle Log', 'Paddle Canoe']).toContain(q);
  });

  it('нет действия Rub у книги и бармена Zambo', () => {
    expect(allTexts.filter((t) => /\bRub\b|\bZambo\b/.test(t))).toEqual([]);
  });
});

describe('ссылки внутри программы', () => {
  it('каждая ссылка #/… из данных ведёт на существующую страницу', () => {
    const links = allTexts.flatMap((t) => [...t.matchAll(/\]\((#\/[^)]+)\)/g)].map((m) => m[1]));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      const route = parseHash(href);
      expect(route.page, href).toBe('reference');
      expect(reference.sections.some((s) => s.id === route.param), href).toBe(true);
    }
  });

  it('Inline делает из #/… ссылку в этой же вкладке, а внешние — в новой', () => {
    const html = (text: string) => renderToStaticMarkup(createElement(Inline, { text }));
    expect(html('См. [справку](#/reference/transport).')).toBe('См. <a href="#/reference/transport">справку</a>.');
    expect(html('[вики](https://oldschool.runescape.wiki/w/Canoe)')).toBe(
      '<a href="https://oldschool.runescape.wiki/w/Canoe" target="_blank" rel="noopener noreferrer">вики</a>');
    expect(html('[файл](docs/readme.md)')).toBe('<span>файл</span>');
  });
});
