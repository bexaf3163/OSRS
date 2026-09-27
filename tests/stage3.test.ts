import { describe, expect, it } from 'vitest';
import { allSteps, itemById, known, stepsFor } from '../src/data';
import type { Step } from '../src/types';
import { emptyProgress, normalizeProgress, withUpgradeDismissed } from '../src/lib/progress';
import { bankTagName, generateBankTag, generateStageBankTag, stageBankItemIds, stepBankItemIds, uniqueIds } from '../src/lib/bankTags';
import { DEFAULT_FEATURES, parseFeatures } from '../src/lib/features';
import {
  checkStatus, clearNavTarget, parseGear, parsePacing, setGearHint, setNavTarget, syncBankTags, toInGameTarget, type BridgeTransport, type GearState,
} from '../src/services/runeliteBridge';
import {
  recommendFor, recommendUpgrade, showsPrompt, stepUpgradeCategories, toolProgression, upgradeNav, type RouterInput, type ToolProgression,
} from '../src/services/gearUpgradeRouter';
import { matchStrict } from '../src/services/locationResolver';
import { actionForm, etaText, pacingText } from '../src/lib/pacing';
import { mapTarget, navPayload, pageFromUrl, sourceBadge } from '../src/lib/places';

import dangerZones from '../src/data/dangerZones.json';

const step = (id: string) => allSteps.find((s) => s.id === id)!;

/** Транспорт-заглушка с настраиваемым ответом. */
function transport(reply: { ok: boolean; status: number; data?: unknown }) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const t: BridgeTransport = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      return reply;
    },
    openEvents: () => () => {},
  };
  return { t, calls };
}

describe('Bank Tags', () => {
  it('формат импорта RuneLite: banktags, версия, имя, значок, предметы', () => {
    expect(generateBankTag('osrspath_stage1', [995, 315, 1351, 1265, 590])).toBe('banktags,1,osrspath_stage1,995,995,315,1351,1265,590');
  });

  it('повторы и мусор убираются, порядок сохраняется', () => {
    expect(uniqueIds([1351, 590, 1351, 0, -4, 2.5, 590, 995])).toEqual([1351, 590, 995]);
    expect(generateBankTag('x', [1351, 1351, 590])).toBe('banktags,1,x,1351,1351,590');
  });

  it('пустой список или имя — пустая строка, а не строка, которую плагин отвергнет', () => {
    expect(generateBankTag('stage', [])).toBe('');
    expect(generateBankTag('<:>', [995])).toBe('');
  });

  it('из имени убираются символы, которые плагин выкидывает или принимает за разделитель', () => {
    expect(bankTagName('a<b>c:d,e')).toBe('abcde');
  });

  it('этап 1 в F2P: предметы из банка, без выдаваемых по ходу шага', () => {
    const ids = stageBankItemIds(1, 'f2p');
    expect(ids).toContain(1351); // Bronze axe
    expect(ids).toContain(1265); // Bronze pickaxe
    expect(new Set(ids).size).toBe(ids.length);
    const inStep = stepsFor('f2p').filter((s) => s.stage === 1)
      .flatMap((s) => (s.itemsRequired ?? []).filter((i) => i.inStep && i.wikiItemId).map((i) => i.wikiItemId!));
    const alsoFromBank = new Set(stepsFor('f2p').filter((s) => s.stage === 1).flatMap(stepBankItemIds));
    for (const id of inStep) if (!alsoFromBank.has(id)) expect(ids).not.toContain(id);
    const tag = generateStageBankTag(1, 'f2p');
    expect(tag.startsWith('banktags,1,osrspath_stage1,')).toBe(true);
    expect(tag.split(',').slice(4).map(Number)).toEqual(ids);
  });

  it('F2P без предметов Members, Members — со всеми', () => {
    for (const stage of [1, 2, 3, 4, 5, 6]) {
      for (const id of stageBankItemIds(stage, 'f2p')) expect(itemById.get(id)?.members).not.toBe(true);
    }
    // Этапы Members в F2P пусты: их шагов в режиме F2P нет.
    expect(stageBankItemIds(8, 'f2p')).toEqual([]);
    expect(stageBankItemIds(1, 'members').length).toBeGreaterThanOrEqual(stageBankItemIds(1, 'f2p').length);
  });
});

// ---------- Роутер апгрейда ----------

const bronzeAxe = { id: 1351, name: 'Bronze axe' };
const gear = (over: Partial<GearState> = {}): GearState => ({ equipment: [bronzeAxe], inventory: [], coins: 1000, bankCoins: null, ...over });
const wc = step('S1-08');
const input = (over: Partial<RouterInput> = {}): RouterInput => ({ step: wc, mode: 'f2p', levels: { woodcutting: 6 }, gear: gear(), ...over });

describe('Smart Tool & Gear Upgrade Router', () => {
  it('категории шага: рубка и добыча; квест и бой — без этой подсказки', () => {
    expect(stepUpgradeCategories(step('S1-08'))).toEqual(['woodcutting']);
    expect(stepUpgradeCategories(step('S1-12'))).toEqual(['mining']);
    // Оружие на шагах с боем сравнивает разбор снаряжения (tests/gear.test.ts), а не ступени инструментов.
    expect(stepUpgradeCategories(step('S3-08'))).toEqual([]);
    expect(stepUpgradeCategories(step('S1-03'))).toEqual([]);
  });

  it('1. Bronze axe и Woodcutting 6 → Steel axe у Bob в Lumbridge', () => {
    const r = recommendUpgrade(input())!;
    expect(r.status).toBe('UPGRADE_AVAILABLE');
    expect(r).toMatchObject({ currentItem: 'Bronze axe', recommendedItem: 'Steel axe', recommendedItemId: 1353, npc: 'Bob', shopPrice: 200, approxCost: 200 });
    // Точка магазина — из словаря мест, не отдельная.
    expect(r.coords).toEqual({ x: matchStrict("Bob's Brilliant Axes")!.x, y: matchStrict("Bob's Brilliant Axes")!.y, plane: 0 });
    expect(showsPrompt(r)).toBe(true);
  });

  it('2. Woodcutting 5 → Steel axe не предлагается', () => {
    const r = recommendUpgrade(input({ levels: { woodcutting: 5 } }))!;
    expect(r.recommendedItem).not.toBe('Steel axe');
    expect(showsPrompt(r)).toBe(false);
  });

  it('3. Steel axe уже в руке или в сумке — подсказки нет', () => {
    expect(recommendUpgrade(input({ gear: gear({ equipment: [{ id: 1353, name: 'Steel axe' }] }) }))!.status).toBe('NO_UPGRADE');
    const inBag = recommendUpgrade(input({ gear: gear({ equipment: [], inventory: [{ id: 1353, name: 'Steel axe' }] }) }))!;
    expect(inBag.status).toBe('NO_UPGRADE');
    expect(showsPrompt(inBag)).toBe(false);
  });

  it('топор в сумке считается: он рубит и оттуда', () => {
    const r = recommendFor('woodcutting', input({ levels: { woodcutting: 21 }, gear: gear({ equipment: [], inventory: [{ id: 1355, name: 'Mithril axe' }] }) }));
    expect(r).toMatchObject({ status: 'NO_UPGRADE', currentItem: 'Mithril axe' });
  });

  it('4. Монет мало → UPGRADE_NOT_AFFORDABLE, банк считается', () => {
    const poor = recommendUpgrade(input({ gear: gear({ coins: 50 }) }))!;
    expect(poor.status).toBe('UPGRADE_NOT_AFFORDABLE');
    expect(poor.coins).toBe(50);
    expect(recommendUpgrade(input({ gear: gear({ coins: 50, bankCoins: 500 }) }))!.status).toBe('UPGRADE_AVAILABLE');
  });

  it('биржа дешевле магазина — цена по бирже', () => {
    const r = recommendUpgrade(input({ gePrices: new Map([[1353, 150]]), gear: gear({ coins: 160 }) }))!;
    expect(r).toMatchObject({ status: 'UPGRADE_AVAILABLE', approxCost: 150, shopPrice: 200, gePrice: 150 });
  });

  const withMembers: ToolProgression = {
    ...toolProgression,
    woodcutting: [...toolProgression.woodcutting, { tier: 'Dragon axe', levelReq: 61, membersOnly: true, geOnly: true }],
  };

  it('5. F2P не получает Members-апгрейд', () => {
    const r = recommendFor('woodcutting', input({ levels: { woodcutting: 70 }, data: withMembers, gear: gear({ equipment: [{ id: 1359, name: 'Rune axe' }] }) }));
    expect(r.status).toBe('NO_UPGRADE');
  });

  it('6. Members получает и F2P-, и Members-апгрейды', () => {
    const f2pTier = recommendFor('woodcutting', input({ mode: 'members', levels: { woodcutting: 6 }, data: withMembers }));
    expect(f2pTier.recommendedItem).toBe('Steel axe');
    const dragon = recommendFor('woodcutting', input({ mode: 'members', levels: { woodcutting: 70 }, data: withMembers, gear: gear({ equipment: [{ id: 1359, name: 'Rune axe' }] }) }));
    expect(dragon).toMatchObject({ status: 'UPGRADE_AVAILABLE', recommendedItem: 'Dragon axe', geOnly: true });
  });

  it('7–8. «Пропустить» скрывает подсказку только на этом шаге', () => {
    expect(recommendUpgrade(input({ dismissed: ['S1-08'] }))!.status).toBe('SKIPPED');
    const mining = recommendUpgrade({ step: step('S1-12'), mode: 'f2p', levels: { mining: 6 }, gear: gear({ equipment: [{ id: 1265, name: 'Bronze pickaxe' }], coins: 10000 }), dismissed: ['S1-08'] })!;
    expect(mining).toMatchObject({ status: 'UPGRADE_AVAILABLE', recommendedItem: 'Steel pickaxe', npc: 'Nurmof' });
  });

  it('сравнение по ступеням, а не по словам в названии', () => {
    // «Bronze» в чужом предмете не делает его топором.
    const r = recommendUpgrade(input({ gear: gear({ equipment: [{ id: 1117, name: 'Bronze chainbody' }] }) }))!;
    expect(r.currentItem).toBeUndefined();
    expect(r.recommendedItem).toBe('Steel axe');
  });

  it('без RuneLite — UNKNOWN и без подсказки', () => {
    const r = recommendUpgrade(input({ gear: null }))!;
    expect(r.status).toBe('UNKNOWN');
    expect(showsPrompt(r)).toBe(false);
  });

  it('слабые ступени (Iron axe) — не повод идти в магазин', () => {
    expect(showsPrompt(recommendUpgrade(input({ levels: { woodcutting: 3 } })))).toBe(false);
  });

  it('только с биржи → стрелка к Grand Exchange, с предметом для автоснятия', () => {
    const r = recommendUpgrade(input({ levels: { woodcutting: 45 }, gear: gear({ coins: 100000 }) }))!;
    expect(r).toMatchObject({ recommendedItem: 'Rune axe', geOnly: true });
    expect(r.shop).toBeUndefined();
    const nav = upgradeNav(r, 'S1-08')!;
    expect(nav).toMatchObject({ label: 'Grand Exchange', itemName: 'Rune axe', itemId: 1359, stepId: 'S1-08' });
  });

  it('9. цель магазина снимается по предмету: в ней есть ID и имя', () => {
    const nav = upgradeNav(recommendUpgrade(input())!, 'S1-08')!;
    expect(nav).toMatchObject({ label: "Bob's Brilliant Axes", npcNames: ['Bob'], itemName: 'Steel axe', itemId: 1353, stepId: 'S1-08' });
  });

  it('данные ступеней: ID из базы предметов, магазины — в её списке продавцов и в словаре мест', () => {
    for (const [cat, tiers] of Object.entries(toolProgression).filter(([k]) => k !== 'source') as [string, ToolProgression['woodcutting']][]) {
      let prevLevel = 0;
      for (const t of tiers) {
        expect(t.levelReq, `${cat} ${t.tier}`).toBeGreaterThanOrEqual(prevLevel);
        prevLevel = t.levelReq;
        const item = itemById.get(t.itemId!);
        expect(item?.nameEn, `${t.tier}: ID ${t.itemId}`).toBe(t.tier);
        if (t.shop && !t.geOnly) {
          const shops = (item!.buyLocations ?? []).map((b) => b.shopName.replace(/\.$/, ''));
          expect(shops, `${t.tier} продаётся в ${t.shop.store}`).toContain(t.shop.store);
          expect(matchStrict(t.shop.store), `${t.shop.store} в словаре мест`).not.toBeNull();
        }
      }
    }
  });
});

// ---------- Совместимость ----------

describe('Совместимость сохранений', () => {
  it('10. старый прогресс без новых полей загружается как раньше', () => {
    const old = { version: 3, steps: { 'S1-01': 'done' }, levels: { woodcutting: 10 }, notes: {}, updatedAt: '2026-01-01T00:00:00.000Z' };
    const n = normalizeProgress(old, known)!;
    expect(n.dropped).toBe(0);
    expect(n.progress.steps['S1-01']).toBe('done');
    expect(n.progress.upgradeDismissedForSteps).toBeUndefined();
  });

  it('«Пропустить» сохраняется, неизвестные шаги отбрасываются', () => {
    const n = normalizeProgress({ ...emptyProgress(), upgradeDismissedForSteps: ['S1-08', 'S9-99', 5] }, known)!;
    expect(n.progress.upgradeDismissedForSteps).toEqual(['S1-08']);
    let p = withUpgradeDismissed(emptyProgress(), 'S1-08');
    expect(p.upgradeDismissedForSteps).toEqual(['S1-08']);
    p = withUpgradeDismissed(p, 'S1-08', false);
    expect(p.upgradeDismissedForSteps).toBeUndefined();
  });

  it('настройки функций: битые и незнакомые — по умолчанию', () => {
    expect(parseFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures('мусор')).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures('{"pacing":false,"x":1,"bankTags":"no"}')).toEqual({ ...DEFAULT_FEATURES, pacing: false });
  });
});

// ---------- Мост: временная цель, банк, снаряжение, темп ----------

describe('Мост: новые запросы и события', () => {
  it('/status говорит, какой шаг сейчас в плагине: после перезапуска RuneLite — никакого', async () => {
    const live = await checkStatus(transport({ ok: true, status: 200, data: { status: 'ok', inGame: true, activeStepId: 'S1-13' } }).t);
    expect(live.activeStepId).toBe('S1-13');
    // Gson плагина не пишет пустые поля: шага нет — поля нет.
    expect((await checkStatus(transport({ ok: true, status: 200, data: { status: 'ok', inGame: false } }).t)).activeStepId).toBeNull();
    expect((await checkStatus(transport({ ok: true, status: 200, data: { status: 'ok', activeStepId: 42 } }).t)).activeStepId).toBeNull();
    expect((await checkStatus(transport({ ok: false, status: 0 }).t)).activeStepId).toBeNull();
  });

  it('шаг с темпом уходит в игру вместе с темпом', () => {
    const p = toInGameTarget(step('S1-12'))!;
    expect(p.pacing).toMatchObject({ skill: 'mining', targetLevel: 15, targetExp: 2411, expPerAction: 17.5 });
  });

  it('временная цель: ok, оффлайн и отказ выключенной функции', async () => {
    const target = { label: 'Port Sarim', x: 3029, y: 3221, plane: 0 };
    const ok = transport({ ok: true, status: 200, data: { status: 'ok' } });
    expect(await setNavTarget(target, ok.t)).toEqual({ ok: true });
    expect(ok.calls[0]).toEqual({ method: 'POST', path: '/nav-target', body: target });
    expect(await setNavTarget(target, transport({ ok: false, status: 0 }).t)).toEqual({ ok: false, reason: 'offline' });
    expect(await setNavTarget(target, transport({ ok: false, status: 409, data: { status: 'error', error: 'навигация выключена' } }).t))
      .toEqual({ ok: false, reason: 'refused', message: 'навигация выключена' });
    const old = await setNavTarget(target, transport({ ok: false, status: 404, data: { status: 'error', error: 'not found' } }).t);
    expect(old.ok).toBe(false);
    const clr = transport({ ok: true, status: 200 });
    await clearNavTarget(clr.t);
    expect(clr.calls[0].body).toEqual({ clear: true });
  });

  it('предметы этапа — в /bank-tags', async () => {
    const b = transport({ ok: true, status: 200 });
    expect(await syncBankTags('stage-1', [995, 1351], b.t)).toBe(true);
    expect(b.calls[0]).toEqual({ method: 'POST', path: '/bank-tags', body: { stageId: 'stage-1', itemIds: [995, 1351] } });
  });

  it('совет по снаряжению — в /gear-hint; снять — clear; старый плагин и выключенная функция — не ошибка', async () => {
    const hint = { text: '⚡ Сильнее: Steel scimitar у Zeke (Al Kharid), 400 gp', watchItems: ['Steel scimitar'], highlightItems: [] };
    const ok = transport({ ok: true, status: 200 });
    expect(await setGearHint(hint, ok.t)).toBe('ok');
    expect(ok.calls[0]).toEqual({ method: 'POST', path: '/gear-hint', body: hint });
    const clr = transport({ ok: true, status: 200 });
    await setGearHint(null, clr.t);
    expect(clr.calls[0].body).toEqual({ clear: true });
    expect(await setGearHint(hint, transport({ ok: false, status: 0 }).t)).toBe('offline');
    expect(await setGearHint(hint, transport({ ok: false, status: 404 }).t)).toBe('old');
    expect(await setGearHint(hint, transport({ ok: false, status: 409, data: { status: 'error', error: 'выключено' } }).t)).toBe('off');
  });

  it('снаряжение: слот надетого из игры, неизвестный слот — без него', () => {
    expect(parseGear({ equipment: [{ id: 1291, name: 'Bronze sword', slot: 'weapon' }, { id: 1540, name: 'Anti-dragon shield', slot: 'Shield!' }] })!.equipment)
      .toEqual([{ id: 1291, name: 'Bronze sword', slot: 'weapon' }, { id: 1540, name: 'Anti-dragon shield' }]);
  });

  it('снаряжение: пропущенные поля — неизвестно, мусор отбрасывается', () => {
    expect(parseGear(undefined)).toBeNull();
    expect(parseGear({})).toBeNull();
    expect(parseGear({ equipment: [{ id: 1351, name: 'Bronze axe' }, { id: 'x' }], coins: 250 }))
      .toEqual({ equipment: [{ id: 1351, name: 'Bronze axe' }], inventory: null, coins: 250, bankCoins: null });
  });

  it('темп: из события, без выдуманного времени', () => {
    const e = { type: 'PACING', stepId: 'S1-11', pacing: { skill: 'fishing', targetLevel: 20, xp: 4130, remainingXp: 340, actionsLeft: 34, estimated: false, almost: false, done: false } };
    const p = parsePacing(e)!;
    expect(p).toMatchObject({ actionsLeft: 34, actionsPerMinute: null, etaSeconds: null });
    expect(etaText(p)).toBe('время рассчитывается…');
    expect(pacingText(p, 'креветка|креветки|креветок')).toBe('34 креветки до 20 Fishing');
    expect(parsePacing({ type: 'PACING', stepId: 'S1-11', pacing: null })).toBeNull();
    expect(parsePacing({ type: 'PACING', stepId: 'S1-11', pacing: { skill: 'magic' } })).toBeNull();
    const fast = parsePacing({ ...e, pacing: { ...e.pacing, actionsPerMinute: 10, etaSeconds: 204 } })!;
    expect(etaText(fast)).toBe('≈ 3 мин');
    expect(pacingText({ ...p, almost: true, actionsLeft: 3 }, 'креветка|креветки|креветок')).toBe('✓ Почти готово: 3 креветки до 20 Fishing');
    expect(pacingText({ ...p, done: true }, 'креветка')).toBe('✓ Целевой уровень достигнут: 20 Fishing');
    expect(actionForm('бревно|бревна|брёвен', 11)).toBe('брёвен');
    expect(actionForm('бревно|бревна|брёвен', 21)).toBe('бревно');
  });
});

// ---------- Досье → карта → игра ----------

describe('Места из досье на карту и в игру', () => {
  const shears = { nameEn: 'Shears', wikiUrl: 'https://oldschool.runescape.wiki/w/Shears' };

  it('страница предмета из ссылки вики', () => {
    expect(pageFromUrl('https://oldschool.runescape.wiki/w/Raw_shrimps')).toBe('Raw shrimps');
    expect(pageFromUrl('https://oldschool.runescape.wiki/w/Cook%27s_Assistant')).toBe("Cook's Assistant");
    expect(pageFromUrl('https://example.com/')).toBeUndefined();
  });

  it('подпись источника: предмет, магазин, город', () => {
    const p = { x: 3189, y: 3273, plane: 0, label: 'Fred the Farmer', source: 'dictionary' as const, match: 'substring' as const, page: 'Fred the Farmer' };
    const spawn = mapTarget({ kind: 'spawn', location: "Lumbridge - outside Fred the Farmer's house", item: shears }, p);
    expect(sourceBadge(spawn)).toBe("Источник предмета: Shears • Lumbridge - outside Fred the Farmer's house");
    expect(spawn.origin).toMatch(/примерно/);
    const shop = mapTarget({ kind: 'shop', location: 'Port Sarim', shop: "Gerrant's Fishy Business.", npc: 'Gerrant' }, { ...p, match: 'exact' });
    expect(sourceBadge(shop)).toBe("Источник: Gerrant's Fishy Business. • Gerrant • Port Sarim");
  });

  it('в игру уходит только найденная точка; продавец — для подсветки', () => {
    const p = { x: 3015, y: 3225, plane: 0, label: "Gerrant's Fishy Business", source: 'dictionary' as const, match: 'exact' as const, page: 'x' };
    expect(navPayload({ kind: 'shop', location: 'Port Sarim', shop: "Gerrant's Fishy Business.", npc: 'Gerrant' }, p))
      .toEqual({ label: "Gerrant's Fishy Business", x: 3015, y: 3225, plane: 0, npcNames: ['Gerrant'] });
    expect(navPayload({ kind: 'city', location: 'Port Sarim', npc: 'Gerrant' }, p).npcNames).toBeUndefined();
  });
});

describe('Радар опасности: данные', () => {
  const zones = (dangerZones as { zones: { id: string; center: { x: number; y: number; plane: number }; radius: number; warningRadius?: number; severity: string; message: string; npcNames?: string[] }[] }).zones;

  it('проверенные зоны с разумными радиусами и сообщением', () => {
    expect(zones.map((z) => z.id)).toEqual(expect.arrayContaining(['dark-wizards-varrock', 'draynor-manor-trees', 'draynor-jail-guards']));
    for (const z of zones) {
      expect(z.radius).toBeGreaterThan(0);
      expect(z.radius).toBeLessThanOrEqual(20);
      expect(z.warningRadius ?? z.radius).toBeGreaterThanOrEqual(z.radius);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(z.severity);
      expect(z.message.length).toBeGreaterThan(10);
      expect([0, 1, 2, 3]).toContain(z.center.plane);
    }
  });

  it('тюрьма Port Sarim не опасна (стражники не агрессивны) — зоны нет', () => {
    expect(zones.some((z) => z.id === 'port-sarim-jail')).toBe(false);
  });
});

describe('Шаги с темпом', () => {
  it('темп только у шагов прокачки', () => {
    const paced: Step[] = allSteps.filter((s) => s.pacing);
    expect(paced.map((s) => s.id)).toEqual(['S1-08', 'S1-11', 'S1-12', 'S2-13']);
    for (const s of paced) expect(s.type).toBe('skill');
  });
});
