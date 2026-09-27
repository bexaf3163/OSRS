// Проверки данных: маршрут V2 (steps.json, stages.json, f2p-items.json) и то, что перенесено из osrs-guide.md.
// Общие для parse-guide.ts и check-data.ts. Без сети.

import type { GuideData } from './guide-parser.ts';
import type { FoeData, Stage, Step, WikiItemDetail } from '../src/types/index.ts';
import { xpForLevel } from '../src/lib/xp.ts';
import { titleTargets } from '../src/lib/targets.ts';

export const EXPECTED = { skills: 12, members: 8, f2pQp: 46, baseQp: 1 };

export interface Route {
  steps: Step[];
  stages: Stage[];
  items: WikiItemDetail[];
  /** Противники шагов (monsters.json): для темпа боя — здоровье, от него опыт за противника. */
  monsters?: FoeData;
}

export interface Report {
  lines: string[];
  errors: number;
  warnings: number;
}

/** Известные опечатки и небрежности, которые уже встречались в текстах маршрута. */
const TYPOS: [RegExp, string][] = [
  [/Перемещёни/i, 'Перемещени'], [/пещёр/i, 'пещер'], [/убьет/i, 'убьёт'], [/\bШелк/i, 'Шёлк'], [/бревнах/i, 'брёвнах'],
  [/Пей омар/i, 'Ешь омара'], [/\s->\s/, '→ вместо ->'], [/ {2,}/, 'двойной пробел'], [/\s[,.;:!?](?!\d)/, 'пробел перед знаком препинания'],
  [/Karamja rum/, 'Karamjan rum'],
  // Названия из игры (кэш клиента и OSRS Wiki): бармен на Karamja — Zembo; у книги Chronicle
  // действия Wield, Teleport, Check charges — «Rub» нет; у станции каноэ «Float Log / Float Canoe»
  // и «Paddle Log / Paddle Canoe», голых «Float» и «Paddle» в меню нет.
  [/\bZambo\b/, 'Zembo'], [/\bRub\b/, 'у Chronicle нет действия Rub — правый клик → Teleport'],
  [/«(Float|Paddle)»/, '«Float Log» или «Float Canoe», «Paddle Log» или «Paddle Canoe»'],
];

/** Еда маршрута и сколько очков здоровья она восстанавливает (OSRS Wiki). */
const FOOD = new Map([
  ['Cooked chicken', 3], ['Shrimps', 3], ['Trout', 7], ['Salmon', 9], ['Lobster', 12], ['Swordfish', 14],
]);

/** Еда без названия и количества — новичок не знает, что брать. */
const VAGUE = /(\d+(–\d+)?\s+(штук\s+)?еды|возьми еду|^еда\.?$|еда для боя)/i;

/** Клетка карты мира: поверхность и подземелья OSRS укладываются в эти границы. */
function badPoint(p: { x: number; y: number; plane: number }): boolean {
  const int = (n: unknown) => Number.isInteger(n);
  return !int(p.x) || !int(p.y) || !int(p.plane) || p.x < 1000 || p.x > 4200 || p.y < 2400 || p.y > 13000 || p.plane < 0 || p.plane > 3;
}

/** Тексты шага, которые видит пользователь, с подписью, где они. */
function userTexts(s: Step): [string, string][] {
  const out: [string, string][] = [];
  const add = (where: string, t?: string) => { if (t) out.push([where, t]); };
  add('Где', s.where); add('Как', s.how); add('Взять', s.bring); add('Награда', s.reward); add('Готово, когда', s.doneWhen);
  add('Pro-tip', s.proTip); add('Safespot', s.safespot); add('Подпись к схеме', s.imageCaption);
  add('Что изменилось в V2', s.v2ChangesSummary); add('С подпиской', s.membersAlternative);
  add('NPC: место', s.npc?.location); add('NPC: диалог', s.npc?.dialogue); add('Предупреждение', s.warning);
  add('Точка на карте', s.mapLocation?.label);
  s.resourceSpots?.forEach((p, i) => { add(`Точка ${i + 1}`, p.label); add(`Точка ${i + 1}: пояснение`, p.note); });
  s.quickSteps?.forEach((q, i) => add(`Шаг ${i + 1}`, q));
  s.fields?.forEach((f) => add(f.label, f.text));
  s.tips?.forEach((t) => add('Совет', t));
  for (const it of [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])]) add(`Где взять ${it.nameEn}`, it.howToGet);
  s.branches?.forEach((b) => add(`Быстрый вариант «${b.label}»`, b.replacementText));
  return out;
}

/** Первая буква текста: эмодзи и кавычки пропускаются; если текст начинается с числа («3 клубка»), буквы нет. */
function firstLetter(t: string): string | undefined {
  const m = t.match(/[\p{L}\p{N}]/u)?.[0];
  return m && /\p{L}/u.test(m) ? m : undefined;
}

function balanced(t: string): boolean {
  let depth = 0;
  for (const ch of t) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0 && (t.match(/«/g)?.length ?? 0) === (t.match(/»/g)?.length ?? 0) && (t.match(/"/g)?.length ?? 0) % 2 === 0;
}

export function validate(d: GuideData | null, route: Route): Report {
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  const ok = (msg: string) => lines.push(`  ✓ ${msg}`);
  const fail = (msg: string) => { errors++; lines.push(`  ✗ ${msg}`); };
  const warn = (msg: string) => { warnings++; lines.push(`  ! ${msg}`); };
  const check = (cond: boolean, good: string, bad: string) => (cond ? ok(good) : fail(bad));

  const { steps, stages, items } = route;
  const ids = steps.map((s) => s.id);
  const idSet = new Set(ids);
  const f2p = steps.filter((s) => !s.membersOnly);
  const members = steps.filter((s) => s.membersOnly);

  // --- Шаги ---
  lines.push('Маршрут V2');
  ok(`Шагов ${steps.length}: F2P ${f2p.length} (${f2p[0]?.id}…${f2p[f2p.length - 1]?.id}), Members ${members.length}`);
  check(idSet.size === ids.length, 'Коды шагов не повторяются', 'Есть повторяющиеся коды шагов');
  const badIds = steps.filter((s) => !/^S\d-\d{2}$/.test(s.id) || Number(s.id[1]) !== s.stage).map((s) => s.id);
  check(!badIds.length, 'Код каждого шага совпадает с его этапом (S<этап>-<номер>)', `Код не совпадает с этапом: ${badIds.join(', ')}`);
  const gaps = steps.filter((s, i) => {
    const prev = steps[i - 1];
    return Number(s.id.slice(3)) !== (prev && prev.stage === s.stage ? Number(prev.id.slice(3)) + 1 : 1);
  }).map((s) => s.id);
  check(!gaps.length, 'Внутри каждого этапа номера идут подряд с 01', `Номера идут не подряд: ${gaps.join(', ')}`);

  const stageIds = new Set(stages.map((s) => s.id));
  const noStage = steps.filter((s) => !stageIds.has(s.stage)).map((s) => s.id);
  check(!noStage.length, `Этапов ${stages.length}, у каждого шага есть этап`, `Шаги без этапа в stages.json: ${noStage.join(', ')}`);
  const membersStages = new Set(stages.filter((s) => s.membersOnly).map((s) => s.id));
  const mixed = steps.filter((s) => Boolean(s.membersOnly) !== membersStages.has(s.stage)).map((s) => s.id);
  check(!mixed.length, 'Шаги Members лежат только в этапах Members, и наоборот', `Режим шага не совпадает с этапом: ${mixed.join(', ')}`);

  const noCore = steps.filter((s) => !['quest', 'skill', 'gear', 'prep'].includes(s.type) || !s.title || !s.doneWhen).map((s) => s.id);
  check(!noCore.length, 'У каждого шага есть тип, название и «Готово, когда»', `Без типа, названия или «Готово, когда»: ${noCore.join(', ')}`);
  const questsNoWiki = steps.filter((s) => s.type === 'quest' && !s.wikiUrl).map((s) => s.id);
  check(!questsNoWiki.length, 'У каждого квеста есть ссылка на вики', `Квесты без ссылки на вики: ${questsNoWiki.join(', ')}`);
  const noFloor = steps.filter((s) => (s.npc || s.floor !== undefined) && !(s.npc?.floor || s.floor)).map((s) => s.id);
  check(!noFloor.length, 'У всех NPC и мест с этажом этаж указан', `Не указан этаж: ${noFloor.join(', ')}`);
  const badFloor = steps.flatMap((s) => [s.npc?.floor, s.floor].filter(Boolean).filter((f) => !/^(Ground|\d(st|nd|rd|th)) floor \(\d-й этаж/.test(f!)).map(() => s.id));
  check(!badFloor.length, 'Этажи записаны по британскому счёту с пояснением («1st floor (2-й этаж)»)', `Этаж без пояснения: ${badFloor.join(', ')}`);

  // --- Зависимости и очки ---
  lines.push('Зависимости и очки квестов');
  const refs = steps.flatMap((s) => s.requires.map((r) => ({ from: s.id, to: r })));
  const broken = refs.filter((r) => !idSet.has(r.to));
  check(!broken.length, `Ссылок на шаги: ${refs.length}, все ведут на существующие коды`, `Ссылки на несуществующие шаги: ${broken.map((r) => `${r.from}→${r.to}`).join(', ')}`);
  const forward = refs.filter((r) => ids.indexOf(r.to) > ids.indexOf(r.from));
  check(!forward.length, 'Зависимости указывают только на шаги выше по списку — циклов нет', `Зависимости вперёд: ${forward.map((r) => `${r.from}→${r.to}`).join(', ')}`);
  const f2pToMembers = refs.filter((r) => !steps.find((s) => s.id === r.from)?.membersOnly && steps.find((s) => s.id === r.to)?.membersOnly);
  check(!f2pToMembers.length, 'F2P-шаги не зависят от шагов Members', `F2P зависит от Members: ${f2pToMembers.map((r) => `${r.from}→${r.to}`).join(', ')}`);

  const f2pQp = EXPECTED.baseQp + f2p.reduce((sum, s) => sum + (s.qp ?? 0), 0);
  check(f2pQp === EXPECTED.f2pQp, `F2P: ${f2pQp} очков квестов (${EXPECTED.baseQp} за Learning the Ropes + шаги)`, `F2P: ${f2pQp} очков квестов, ожидалось ${EXPECTED.f2pQp}`);
  ok(`Members добавляет ${members.reduce((sum, s) => sum + (s.qp ?? 0), 0)} очков квестов`);
  const qpNotQuest = steps.filter((s) => s.qp && s.type !== 'quest').map((s) => s.id);
  if (qpNotQuest.length) fail(`Очки у шагов не-квестов: ${qpNotQuest.join(', ')}`);
  const qpMismatch = steps.filter((s) => {
    const m = s.reward?.match(/(\d+) QP/);
    return (m ? Number(m[1]) : 0) !== (s.qp ?? 0) && !(s.qp === undefined && !m);
  }).map((s) => `${s.id} (qp ${s.qp ?? 0}, в «Награде» ${s.reward?.match(/(\d+) QP/)?.[1] ?? 0})`);
  check(!qpMismatch.length, 'Очки каждого квеста совпадают с текстом «Награды»', `Не совпадают с «Наградой»: ${qpMismatch.join('; ')}`);
  // --- Требования шага (готовность): уровни и квесты из статьи квеста ---
  const REQ_SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft', 'hitpoints', 'crafting', 'mining',
    'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'agility', 'herblore', 'thieving', 'fletching', 'slayer', 'farming',
    'construction', 'hunter', 'sailing']);
  const questAt = new Map(steps.flatMap((s, i) => (s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' ? [[s.inGame.completionTrigger.questName ?? '', i] as const] : [])));
  const badReq: string[] = [];
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  steps.forEach((s, i) => {
    const text = (s.fields ?? []).filter((f) => f.label.startsWith('Требован')).map((f) => f.text).join(' ');
    for (const r of s.requirements ?? []) {
      if (r.type === 'skill') {
        if (!REQ_SKILLS.has(r.skill) || !Number.isInteger(r.min) || r.min < 1 || r.min > 99) badReq.push(`${s.id}: ${r.skill} ${r.min}`);
        else if (!text.includes(`${cap(r.skill)} ${r.min}`)) badReq.push(`${s.id}: «${cap(r.skill)} ${r.min}» нет в поле «Требования»`);
      } else {
        const at = questAt.get(r.quest);
        if (at === undefined) badReq.push(`${s.id}: квест «${r.quest}» не из маршрута`);
        else if (at >= i) badReq.push(`${s.id}: квест «${r.quest}» на маршруте позже шага`);
        else if (steps[at].membersOnly && !s.membersOnly) badReq.push(`${s.id}: F2P-шаг требует квест Members «${r.quest}»`);
        if (!text.includes(r.quest)) badReq.push(`${s.id}: «${r.quest}» нет в поле «Требования»`);
      }
    }
    // Обратно: всё, что поле «Требования» называет уровнем или квестом маршрута, записано и в requirements.
    for (const m of text.matchAll(/\b([A-Z][a-z]+) (\d{1,2})\b/g)) {
      if (REQ_SKILLS.has(m[1].toLowerCase()) && !(s.requirements ?? []).some((r) => r.type === 'skill' && r.skill === m[1].toLowerCase() && r.min === Number(m[2]))) {
        badReq.push(`${s.id}: «${m[0]}» из поля «Требования» нет в requirements`);
      }
    }
    for (const q of questAt.keys()) {
      if (q && text.includes(q) && !(s.requirements ?? []).some((r) => r.type === 'quest' && r.quest === q) && !text.includes(`(а значит, ${q}`) && !text.match(new RegExp(`а значит[^)]*${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))) {
        badReq.push(`${s.id}: квест «${q}» из поля «Требования» нет в requirements`);
      }
    }
  });
  // Цель шага-заработка совпадает с «Готово, когда»: «В банке 20 000+ монет» ↔ moneyGoal 20000.
  for (const s of steps.filter((x) => x.moneyGoal !== undefined)) {
    const n = Number((s.doneWhen.match(/(\d{1,3}(?:[  ]\d{3})+|\d+)\+? монет/)?.[1] ?? '').replace(/[  ]/g, ''));
    if (!Number.isInteger(s.moneyGoal) || s.moneyGoal! <= 0 || n !== s.moneyGoal) badReq.push(`${s.id}: moneyGoal ${s.moneyGoal} не совпадает с «Готово, когда»`);
  }
  const withReq = steps.filter((s) => s.requirements?.length).length;
  check(!badReq.length, `Требования шагов (${withReq}): навыки и уровни верные, квесты — с маршрута и раньше шага, совпадают с полем «Требования»`, `Требования шагов: ${badReq.join('; ')}`);

  let running = EXPECTED.baseQp;
  const unreachable: string[] = [];
  for (const s of f2p) {
    if (s.minQp !== undefined && running < s.minQp) unreachable.push(`${s.id} ждёт ${s.minQp}, а до него можно набрать ${running}`);
    running += s.qp ?? 0;
  }
  check(!unreachable.length, 'Пороги очков квестов достижимы шагами выше по списку', `Недостижимые пороги: ${unreachable.join('; ')}`);

  const noTargets = steps.filter((s) => s.type === 'skill' && !titleTargets(s.title).length).map((s) => s.id);
  check(!noTargets.length, 'У всех шагов-навыков распознаны цели по уровням в названии', `Не распознаны цели в названии: ${noTargets.join(', ')}`);
  const review = steps.filter((s) => s.updatedInV2 && !s.v2ChangesSummary).map((s) => s.id);
  check(!review.length, `Шагов с пометкой «обновлено в V2»: ${steps.filter((s) => s.updatedInV2).length}, у всех есть пояснение`, `Нет пояснения к обновлению: ${review.join(', ')}`);

  // --- Предметы ---
  lines.push('Предметы');
  const itemIds = new Map(items.map((i) => [i.id, i]));
  const stepItems = steps.flatMap((s) => [...(s.itemsRequired ?? []), ...(s.itemsRecommended ?? [])].map((it) => ({ s: s.id, it })));
  const noItem = stepItems.filter(({ it }) => !it.wikiItemId || !itemIds.has(it.wikiItemId) || itemIds.get(it.wikiItemId)!.iconUrl !== it.iconUrl);
  check(!noItem.length, `Предметов в шагах: ${stepItems.length}, у всех есть ID и иконка из базы`, `Нет в базе или иконка не совпадает: ${noItem.map(({ s, it }) => `${s}:${it.nameEn}`).join(', ')}`);
  const noRu = stepItems.filter(({ it }) => !it.nameRu).map(({ s, it }) => `${s}:${it.nameEn}`);
  check(!noRu.length, 'У всех предметов шагов есть русское название', `Без русского названия: ${noRu.join(', ')}`);
  check(items.length >= 120, `В базе предметов ${items.length} позиций (нужно 120+)`, `В базе только ${items.length} предметов, нужно 120+`);
  const itemGaps = items.filter((i) => !i.examine || !i.iconUrl || !i.wikiUrl).map((i) => i.nameEn);
  check(!itemGaps.length, 'У каждого предмета базы есть описание, иконка и ссылка на вики', `Неполные предметы: ${itemGaps.join(', ')}`);
  const noHow = stepItems.filter(({ it }) => !it.howToGet.trim()).map(({ s, it }) => `${s}:${it.nameEn}`);
  check(!noHow.length, 'У каждого предмета шага сказано, где его взять', `Не сказано, где взять: ${noHow.join(', ')}`);
  const food = stepItems.filter(({ it }) => FOOD.has(it.nameEn));
  const noHeal = food.filter(({ it }) => it.heals !== FOOD.get(it.nameEn)).map(({ s, it }) => `${s}:${it.nameEn} (${it.heals ?? 'нет'} вместо ${FOOD.get(it.nameEn)})`);
  check(!noHeal.length, `У еды в шагах (${food.length}) указано, сколько она лечит`, `Неверное или пустое «лечит»: ${noHeal.join(', ')}`);
  // Подпись картинки — это и alt для экранного чтения; без неё схема безымянна.
  const noCaption = steps.filter((s) => s.imageUrl && !s.imageCaption).map((s) => s.id);
  if (noCaption.length) warn(`Картинка без подписи: ${noCaption.join(', ')}`);
  else ok('У всех картинок шагов есть подпись');

  // --- Карта и подсветка в игре ---
  lines.push('Карта и RuneLite');
  const located = steps.filter((s) => s.mapLocation);
  const points = steps.flatMap((s) => [
    ...(s.mapLocation ? [{ s: s.id, p: s.mapLocation }] : []),
    ...(s.resourceSpots ?? []).map((p) => ({ s: s.id, p })),
  ]);
  const badPoints = points.filter(({ p }) => badPoint(p) || !p.label?.trim() || (p.zoom !== undefined && (!Number.isInteger(p.zoom) || p.zoom < -3 || p.zoom > 3)));
  check(!badPoints.length, `Точек на карте ${points.length} (шагов с картой ${located.length}): координаты, этаж и подпись в порядке`,
    `Неверная точка: ${badPoints.map(({ s, p }) => `${s} ${p.x},${p.y},${p.plane}`).join('; ')}`);
  // Ссылка «Карта» на вики и точка превью — одно и то же место: расхождение значит, что поправили только одно.
  const drift = steps.filter((s) => {
    const m = s.mapUrl?.match(/#\/m=(\d+),(\d+),(\d+)/);
    return m && s.mapLocation && (Number(m[1]) !== s.mapLocation.x || Number(m[2]) !== s.mapLocation.y || Number(m[3]) !== s.mapLocation.plane);
  }).map((s) => s.id);
  check(!drift.length, 'Точка превью совпадает со ссылкой на карту вики', `Точка и ссылка на карту расходятся: ${drift.join(', ')}`);
  const lonelySpots = steps.filter((s) => s.resourceSpots && s.resourceSpots.length < 2).map((s) => s.id);
  check(!lonelySpots.length, 'Переключатель точек — только там, где их две и больше', `Одна точка в resourceSpots: ${lonelySpots.join(', ')}`);

  const TRIGGERS = new Set(['QUEST_COMPLETED', 'SKILL_LEVEL', 'ITEM_OWNED', 'CHAT_MESSAGE', 'VARBIT_CHANGED']);
  // Название квеста у RuneLite: как у шага (тире в названии — дефис) или как у статьи вики шага
  // («Триумф у Oziach» — последний этап Dragon Slayer I). Есть ли он в RuneLite — проверяет RouteTargetsTest.
  const questNamesOf = (s: Step) => [s.title.replace(/ — /g, ' - '),
    ...(s.wikiUrl ? [decodeURIComponent(s.wikiUrl.replace(/^.*\/w\//, '')).replace(/_/g, ' ')] : [])];
  const triggerQuests = new Map<string, string>();
  const badGame: string[] = [];
  for (const s of steps) {
    const g = s.inGame;
    if (!g) continue;
    if (g.worldPoint && badPoint(g.worldPoint)) badGame.push(`${s.id}: worldPoint`);
    for (const t of g.groundTiles ?? []) if (badPoint(t) || !t.label.trim()) badGame.push(`${s.id}: клетка ${t.x},${t.y}`);
    for (const key of ['npcNames', 'objectNames', 'dialogChoices', 'highlightItems'] as const) {
      if (g[key]?.some((n) => !n.trim())) badGame.push(`${s.id}: пустое имя в ${key}`);
    }
    const t = g.completionTrigger;
    if (!t) continue;
    if (!TRIGGERS.has(t.type)) badGame.push(`${s.id}: неизвестный триггер ${t.type}`);
    // Квест засчитывается по названию из игры; название шага-квеста и есть это название.
    if (t.type === 'QUEST_COMPLETED') {
      if (s.type !== 'quest' || !questNamesOf(s).includes(t.questName ?? '')) badGame.push(`${s.id}: questName «${t.questName}» не совпадает с квестом шага`);
      const twin = triggerQuests.get(t.questName ?? '');
      if (twin) badGame.push(`${s.id}: квест «${t.questName}» уже отмечает ${twin} — оба шага закрылись бы разом`);
      triggerQuests.set(t.questName ?? '', s.id);
    }
    // Уровни — ровно цели из названия шага: иначе шаг закрылся бы раньше или позже, чем написано.
    if (t.type === 'SKILL_LEVEL') {
      const want = titleTargets(s.title).map((x) => `${x.skill} ${x.level}`).sort().join(', ');
      const got = (t.levels ?? []).map((x) => `${x.skill} ${x.level}`).sort().join(', ');
      if (!t.levels?.length || want !== got) badGame.push(`${s.id}: уровни автоотметки «${got}» ≠ цели из названия «${want}»`);
    } else if (t.levels) badGame.push(`${s.id}: уровни бывают только у SKILL_LEVEL`);
    if (t.type === 'ITEM_OWNED' && !t.items?.length) badGame.push(`${s.id}: ITEM_OWNED без предметов`);
    if (t.items && !['QUEST_COMPLETED', 'SKILL_LEVEL', 'ITEM_OWNED'].includes(t.type)) badGame.push(`${s.id}: предметы бывают только у условий-состояний`);
    for (const i of t.items ?? []) {
      if (!i.names?.length || i.names.some((n) => !n.trim())) badGame.push(`${s.id}: предмет автоотметки без названия`);
      if (!Number.isInteger(i.count) || i.count < 1) badGame.push(`${s.id}: количество ${i.names?.join('/')} — ${i.count}`);
      if (i.id !== undefined && (!Number.isInteger(i.id) || i.id <= 0)) badGame.push(`${s.id}: ID ${i.id}`);
    }
    if (t.type === 'CHAT_MESSAGE') {
      try { new RegExp(t.chatPattern ?? ''); } catch { badGame.push(`${s.id}: chatPattern не регулярное выражение`); }
      if (!t.chatPattern) badGame.push(`${s.id}: нет chatPattern`);
    }
    if (t.type === 'VARBIT_CHANGED' && (!Number.isInteger(t.varbitId) || !Number.isInteger(t.targetValue))) badGame.push(`${s.id}: varbitId и targetValue обязательны`);
  }
  const withGame = steps.filter((s) => s.inGame);
  const auto = withGame.filter((s) => s.inGame!.completionTrigger);
  check(!badGame.length, `Подсветка в игре у ${withGame.length} шагов, автоотметка у ${auto.length}: поля в порядке`, `Ошибки подсветки: ${badGame.join('; ')}`);

  // Путевые точки: по порядку, с подписью (её показывает HUD: «Точка 2/5: мост»).
  const badRoute = steps.flatMap((s) => (s.inGame?.pathWaypoints ?? [])
    .filter((p) => badPoint(p) || !p.label?.trim())
    .map((p) => `${s.id} ${p.x},${p.y}`));
  const routed = steps.filter((s) => s.inGame?.pathWaypoints?.length);
  const shortRoute = routed.filter((s) => s.inGame!.pathWaypoints!.length < 2).map((s) => s.id);
  check(!badRoute.length && !shortRoute.length, `Путевые точки у ${routed.length} шагов: координаты и подписи в порядке`,
    `Путевые точки: ${[...badRoute, ...shortRoute.map((id) => `${id}: одна точка — это просто worldPoint`)].join('; ')}`);

  // Быстрые варианты: известный навык и уровень 1–99, квест из маршрута, предмет с названием, точка на карте.
  const SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'prayer', 'magic', 'runecraft', 'hitpoints', 'crafting', 'mining',
    'smithing', 'fishing', 'cooking', 'firemaking', 'woodcutting', 'agility', 'herblore', 'thieving', 'fletching', 'slayer', 'farming',
    'construction', 'hunter', 'sailing']);
  const questTitles = new Set(steps.filter((s) => s.type === 'quest').map((s) => s.title));
  const badBranch: string[] = [];
  for (const s of steps) {
    const ids = new Set<string>();
    for (const b of s.branches ?? []) {
      const c = b.condition;
      if (!b.id || ids.has(b.id)) badBranch.push(`${s.id}: повтор или пустой id варианта`);
      ids.add(b.id);
      if (!b.label?.trim()) badBranch.push(`${s.id}/${b.id}: нет label`);
      if (c.type === 'SKILL_LEVEL' && (!SKILLS.has(c.skill ?? '') || !Number.isInteger(c.minLevel) || c.minLevel! < 1 || c.minLevel! > 99)) badBranch.push(`${s.id}/${b.id}: навык или уровень`);
      if (c.type === 'QUEST_COMPLETED' && !questTitles.has(c.questName ?? '')) badBranch.push(`${s.id}/${b.id}: квест «${c.questName}» не из маршрута`);
      if (c.type === 'ITEM_OWNED' && !c.itemName?.trim()) badBranch.push(`${s.id}/${b.id}: нет itemName`);
      if (!['SKILL_LEVEL', 'QUEST_COMPLETED', 'ITEM_OWNED'].includes(c.type)) badBranch.push(`${s.id}/${b.id}: неизвестное условие ${c.type}`);
      if (b.replacementTarget && (badPoint(b.replacementTarget) || !b.replacementTarget.label?.trim())) badBranch.push(`${s.id}/${b.id}: точка`);
      if (b.timeSavingSeconds !== undefined && !(b.timeSavingSeconds > 0)) badBranch.push(`${s.id}/${b.id}: timeSavingSeconds`);
    }
  }
  const branched = steps.filter((s) => s.branches?.length);
  check(!badBranch.length, `Быстрые варианты у ${branched.length} шагов: условия и точки в порядке`, `Быстрые варианты: ${badBranch.join('; ')}`);

  // Проверка вылета: у шага, где всё добывается по ходу, проверять у банка нечего — это нормально, но
  // inStep только у обязательных предметов (рекомендуемые у банка и так не проверяются).
  const recInStep = steps.flatMap((s) => (s.itemsRecommended ?? []).filter((i) => i.inStep).map((i) => `${s.id} ${i.nameEn}`));
  check(!recInStep.length, `Предметы «по ходу шага» помечены у ${steps.filter((s) => s.itemsRequired?.some((i) => i.inStep)).length} шагов`,
    `inStep у рекомендуемых предметов: ${recInStep.join(', ')}`);

  // Темп прокачки: навык и уровень — те же, что в названии шага; опыт до уровня — по формуле игры.
  const COMBAT = new Set(['attack', 'strength', 'defence']);
  const PACING_SKILLS = new Set(['fishing', 'woodcutting', 'cooking', 'mining', ...COMBAT]);
  const foeHp = new Map((route.monsters?.foes ?? []).map((f) => [f.name, f.hitpoints]));
  const badPacing = steps.flatMap((s) => {
    const p = s.pacing;
    if (!p) return [];
    const out: string[] = [];
    if (!PACING_SKILLS.has(p.skill)) out.push(`${s.id}: навык ${p.skill}`);
    if (p.targetExp !== xpForLevel(p.targetLevel)) out.push(`${s.id}: опыт ${p.targetExp} ≠ ${xpForLevel(p.targetLevel)} для ${p.targetLevel}`);
    if (!(p.expPerAction > 0)) out.push(`${s.id}: опыт за действие ${p.expPerAction}`);
    const forms = p.actionName.split('|');
    if (!(forms.length === 1 || forms.length === 3) || forms.some((f) => !f.trim())) out.push(`${s.id}: формы действия «${p.actionName}»`);
    for (const skill of [p.skill, ...(p.also ?? [])]) {
      if (!titleTargets(s.title).some((t) => t.skill === skill && t.level === p.targetLevel)) out.push(`${s.id}: цели ${skill} ${p.targetLevel} нет в названии`);
    }
    // Несколько навыков — только бой: их качают по очереди, меняя стиль атаки.
    if (p.also && (!COMBAT.has(p.skill) || p.also.some((a) => !COMBAT.has(a) || a === p.skill) || new Set(p.also).size !== p.also.length)) {
      out.push(`${s.id}: also ${p.also.join(', ')}`);
    }
    // Бой: действие — противник, опыт навыка стиля — 4 за единицу урона, то есть 4 × его здоровье.
    if (COMBAT.has(p.skill)) {
      const hp = foeHp.get(s.foes?.[0] ?? '');
      if (hp === undefined) out.push(`${s.id}: темп боя без противника из monsters.json`);
      else if (p.expPerAction !== 4 * hp) out.push(`${s.id}: опыт за противника ${p.expPerAction} ≠ 4 × ${hp}`);
    }
    if (p.secondsPerAction !== undefined && !(p.secondsPerAction > 0)) out.push(`${s.id}: секунд на действие ${p.secondsPerAction}`);
    return out;
  });
  const paced = steps.filter((s) => s.pacing).length;
  check(!badPacing.length, `Темп прокачки у ${paced} шагов: навык, уровень и опыт сходятся с названием и формулой`, `Темп прокачки: ${badPacing.join('; ')}`);

  // Разметка вики в базе предметов: HTML-сущности и «[UK]/[US]» — признак старой очистки текста.
  const entities = items.flatMap((i) => [...(i.buyLocations ?? []).map((b) => b.location), ...(i.freeSpawns ?? [])]
    .filter((t) => /&(#\d+|[a-z]+);|\[(UK|US)\]/i.test(t)).map((t) => `${i.nameEn}: ${t}`));
  check(!entities.length, 'В местах магазинов и спавнов нет HTML-сущностей и пометок [UK]/[US]', `Неочищенный текст вики: ${entities.slice(0, 5).join('; ')}`);

  // --- Текст ---
  lines.push('Текст');
  const vague = steps.flatMap((s) => userTexts(s).filter(([, t]) => VAGUE.test(t)).map(([where]) => `${s.id} «${where}»`));
  check(!vague.length, 'Еда везде названа и посчитана', `Еда без названия или количества: ${vague.join(', ')}`);
  const lower: string[] = [];
  const typos: string[] = [];
  const unbalanced: string[] = [];
  for (const s of steps) {
    for (const [where, t] of [['Название', s.title] as [string, string], ...userTexts(s)]) {
      const ch = firstLetter(t);
      if (ch && ch !== ch.toUpperCase() && !/^[a-z]/.test(t)) lower.push(`${s.id} «${where}»`);
      for (const [re, hint] of TYPOS) if (re.test(t)) typos.push(`${s.id} «${where}»: ${hint}`);
      if (!balanced(t)) unbalanced.push(`${s.id} «${where}»`);
    }
  }
  for (const st of stages) {
    const ch = firstLetter(st.title);
    if (ch && ch !== ch.toUpperCase()) lower.push(`этап ${st.id}`);
  }
  check(!lower.length, 'Все тексты шагов и этапов начинаются с заглавной буквы', `Начинается со строчной: ${lower.join(', ')}`);
  check(!typos.length, 'Известных опечаток и ASCII-стрелок нет', `Опечатки: ${typos.join('; ')}`);
  check(!unbalanced.length, 'Скобки и кавычки закрыты', `Незакрытые скобки или кавычки: ${unbalanced.join(', ')}`);

  if (d) {
    // --- Из гайда ---
    lines.push('Навыки, цели и опыт (osrs-guide.md)');
    check(d.skills.length === EXPECTED.skills, `Навыков ${d.skills.length}: ${d.skills.map((s) => `${s.id}(${s.plan.ranges.length})`).join(' ')}`, `Ожидалось ${EXPECTED.skills} навыков, найдено ${d.skills.length}`);
    let planErrors = 0;
    for (const s of d.skills) {
      const bad = s.plan.ranges.filter((r, i) => r.code !== `${s.id}-${i + 1}` || (r.to !== null && r.to <= r.from));
      if (bad.length) { planErrors++; fail(`${s.id}: неправильные строки плана ${bad.map((r) => r.code).join(', ')}`); }
    }
    if (!planErrors) ok('У каждого навыка план прокачки с кодами по порядку');

    // Навыки подписки: строка плана должна найтись для любого уровня 1–99, иначе «Сейчас по плану» пропадёт.
    const ms = d.members.skills;
    check(ms.length === EXPECTED.members, `Навыков подписки ${ms.length}: ${ms.map((s) => `${s.id}(${s.plan.ranges.length})`).join(' ')}`,
      `Ожидалось ${EXPECTED.members} навыков подписки, найдено ${ms.length}`);
    const holes = ms.filter((s) => {
      const r = s.plan.ranges;
      return r[0].from !== 1 || r[r.length - 1].to !== null
        || r.some((x, i) => x.code !== `${s.id}-${i + 1}` || (i > 0 && r[i - 1].to !== x.from) || (x.to !== null && x.to <= x.from));
    }).map((s) => s.id);
    check(!holes.length, 'Планы навыков подписки идут с 1 уровня без пропусков, коды по порядку',
      `План навыка подписки не с 1 уровня, с пропуском или не по порядку: ${holes.join(', ')}`);
    const f2pLevels = new Set(d.levels.map((l) => l.id));
    const badMembers = ms.filter((s) => s.membersOnly !== true || s.levelSkills.length !== 1 || f2pLevels.has(s.levelSkills[0])
      || d.skills.some((f) => f.id === s.id) || s.wiki !== `https://oldschool.runescape.wiki/w/${s.nameEn}`).map((s) => s.id);
    check(!badMembers.length, 'У навыков подписки свой уровень, свой код и ссылка на вики',
      `Навык подписки без своего уровня, с чужим кодом или без ссылки на вики: ${badMembers.join(', ')}`);
    const goalRows = d.goals.rows.filter((r) => r.id !== 'qp');
    check(goalRows.length === d.levels.length, `«Цели по этапам»: ${goalRows.length} навыков × ${d.goals.stages.length} этапов`, '«Цели по этапам» неполные');
    const xpBad = d.xp.points.filter((p) => xpForLevel(p.level) !== p.xp).map((p) => `${p.level}: ${p.xp} ≠ ${xpForLevel(p.level)}`);
    check(!xpBad.length, `Формула опыта совпадает со всеми ${d.xp.points.length} строками таблицы гайда`, `Формула расходится с гайдом: ${xpBad.join('; ')}`);
  }

  lines.push('');
  lines.push(`Итог: ошибок ${errors}, предупреждений ${warnings}`);
  return { lines, errors, warnings };
}
