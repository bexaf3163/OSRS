// Проверка согласованности данных и текстов: один набор правил для `npm run check-data` и для тестов.
// Правила ловят то, что уже ломало программу: Coif без требования 20 Ranged, два «главных» амулета в одном маршруте,
// «телепорт домой» без оговорки про перезарядку, этапы квестов с битыми шагами и клетками, тексты со строчной буквы.
// Новое правило — функция rule(...) ниже; дубликаты проверок из validate.ts не заводим.

import type { Step } from '../src/types/index.ts';

export interface QaInput {
  steps: Step[];
  gear: { items: { id: number; name: string; slot?: string; members?: boolean; req?: Record<string, unknown> }[] };
  questStages: { quests: Record<string, {
    var: [string, number];
    route?: { title: string; steps: string[] }[];
    stages: { at: number; do: { t: string; s?: string; at?: number[]; has?: string; need?: string }[]; go?: unknown; items?: { name: string }[] }[];
  }> };
  /** Способы прокачки (src/data/trainingMethods.json) и словарь мест — для правил роутера способов. Нет — правила не применяются. */
  training?: { methods: { id: string; skill: string | string[]; from: number; to?: number | null; name: string; where: string; place?: string; url: string; xph?: number[]; xpa?: number; kind?: string; xpTotal?: number }[] };
  places?: { locations: Record<string, unknown> };
  /** Идентификаторы навыков с уровнями (levels.json + навыки подписки). */
  skillIds?: string[];
}

export interface QaIssue {
  rule: string;
  where: string;
  message: string;
}

const SKILLS = new Set(['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer', 'quests']);
/** Известные требования надевания: проверяем, что они не потерялись (источник — OSRS Wiki). */
const KNOWN_REQ: Record<string, Record<string, number>> = { Coif: { ranged: 20 } };

const firstChar = (t: string) => t.match(/[\p{L}\p{N}]/u)?.[0];

function badPoint(p: number[]): boolean {
  const [x, y, z] = p;
  return !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || x < 1000 || x > 4200 || y < 2400 || y > 13000 || z < 0 || z > 3;
}

export function qa(input: QaInput): QaIssue[] {
  const out: QaIssue[] = [];
  const add = (rule: string, where: string, message: string) => out.push({ rule, where, message });

  // --- Снаряжение: уникальные id, осмысленные требования, известные требования на месте ---
  const seen = new Set<number>();
  for (const g of input.gear.items) {
    if (seen.has(g.id)) add('gear-duplicate', g.name, `повтор id ${g.id}`);
    seen.add(g.id);
    for (const [k, v] of Object.entries(g.req ?? {})) {
      if (k === 'quests') {
        if (!Array.isArray(v) || v.some((q) => typeof q !== 'string' || !q)) add('gear-req', g.name, 'quests — не список названий');
      } else if (!SKILLS.has(k) || !Number.isInteger(v) || (v as number) < 2 || (v as number) > 99) {
        add('gear-req', g.name, `требование ${k}=${String(v)} не по правилам (навык из списка, уровень 2–99)`);
      }
    }
  }
  for (const [name, req] of Object.entries(KNOWN_REQ)) {
    const g = input.gear.items.find((x) => x.name === name);
    if (!g) continue;
    for (const [k, v] of Object.entries(req)) {
      if (g.req?.[k] !== v) add('gear-known-req', name, `должно требовать ${k} ${v}, в данных: ${String(g.req?.[k] ?? 'нет')}`);
    }
  }

  // --- Амулеты: одна главная рекомендация на маршрут (силы), а не силы и мощи вместе ---
  const required = (s: Step, name: string) => (s.itemsRequired ?? []).some((i) => i.nameEn.toLowerCase() === name);
  const strengthAt = input.steps.findIndex((s) => required(s, 'amulet of strength'));
  input.steps.forEach((s, i) => {
    if (required(s, 'amulet of power') && strengthAt >= 0 && strengthAt <= i) {
      add('amulet-consistency', s.id, 'в «Требуемых» Amulet of power, хотя маршрут уже требует Amulet of strength: два главных амулета');
    }
    if (required(s, 'amulet of power') && required(s, 'amulet of strength')) add('amulet-consistency', s.id, 'в «Требуемых» оба амулета сразу');
  });

  // --- Телепорт домой: не обещаем без оговорки про перезарядку (раз в 30 минут) ---
  for (const s of input.steps) {
    const texts = [s.where, s.how, s.bring, s.warning, s.proTip, ...(s.quickSteps ?? []), ...(s.tips ?? [])].filter((t): t is string => Boolean(t));
    for (const t of texts) {
      if (/home teleport/i.test(t) && !/перезаряж|раз в 30|каждые 30|30 минут|серый/i.test(t)) {
        add('home-teleport', s.id, `«Home Teleport» без оговорки про перезарядку: ${t.slice(0, 70)}…`);
      }
    }
  }

  // --- Этапы квестов ---
  const ids = new Set(input.steps.map((s) => s.id));
  const stepItems = new Map(input.steps.map((s) => [s.id, (s.itemsRequired ?? []).map((i) => ({ name: i.nameEn, ru: i.nameRu }))]));
  for (const [id, q] of Object.entries(input.questStages.quests)) {
    if (!ids.has(id)) add('stages-step', id, 'нет такого шага в маршруте');
    if (!['varp', 'varbit'].includes(q.var[0]) || !Number.isInteger(q.var[1]) || q.var[1] < 1) add('stages-var', id, `переменная ${q.var.join(' ')}`);
    let last = -1;
    for (const st of q.stages) {
      if (st.at <= last) add('stages-order', id, `этап ${st.at} не по возрастанию`);
      last = st.at;
      if (!st.do.length) add('stages-empty', id, `этап ${st.at} без шагов`);
      for (const [n, l] of st.do.entries()) {
        const c = firstChar(l.t);
        // «Отдай/Верни/Отнеси X» не первым шагом этапа: без условия «X в сумке» стоящий рядом с NPC игрок считался бы уже дошедшим.
        // Предметы — этапа и всего шага: «Купи Beer» может быть шагом этапа, где Beer среди предметов не значится (он у Dr. Harlow).
        const pool = [...(st.items ?? []).map((it) => ({ name: it.name, ru: (it as { nameRu?: string }).nameRu })), ...(stepItems.get(id) ?? [])];
        const mentions = (text: string, it: { name: string; ru?: string }) => text.includes(it.name.toLowerCase()) || Boolean(it.ru && it.ru.length > 3 && text.includes(it.ru.toLowerCase()));
        // Что строка говорит о предметах: без пометок «(нужен Spade)» — инструмент нужен, но не добывается и не сдаётся.
        // Списки («Возьми еду, противоядие, зелья…») и «можно частями» одним условием не описать — их ведут положение и этап.
        const tools = l.t.toLowerCase().replace(/\([^)]*(нужен|нужна|нужно|с собой)[^)]*\)/g, '');
        const listed = (tools.match(/,/g) ?? []).length >= 2 || /частями|по частям/.test(tools);
        // Отдать можно и «Снова поговори с Dr. Harlow и отдай пиво»: глагол не обязан стоять первым.
        if (n > 0 && l.at && !l.has && !l.need && !listed && /(^|[\s,;:—(])(Отдай|отдай|Верни|верни|Отнеси|отнеси|Принеси|принеси|Передай|передай)/.test(l.t)) {
          const text = tools;
          const item = pool.find((it) => mentions(text, it));
          if (item) add('stages-need-missing', `${id}#${st.at}`, `шаг «${l.t.slice(0, 40)}…» отдаёт «${item.name}» — нужно условие need`);
        }
        // «Накопай/Возьми/Сорви/Купи X» (не последний шаг): без has шаг не засчитывается, когда X уже в сумке, — игрок добыл руду,
        // а список всё ещё просит её копать (S2-07). Один предмет этапа в тексте — его и надо указать; два и больше — has не годится.
        if (n < st.do.length - 1 && !l.has && !l.need && !listed && /^(Накопай|Возьми|Сорви|Купи|Подбери|Добудь|Нарви|Набери|Выкопай|Срежь|Состриги)/.test(l.t)) {
          const text = tools;
          const named = [...new Map(pool.filter((it) => mentions(text, it)).map((it) => [it.name, it])).values()];
          if (named.length === 1) add('stages-has-missing', `${id}#${st.at}`, `шаг «${l.t.slice(0, 40)}…» добывает «${named[0].name}» — нужно условие has`);
        }
        // Короткий текст для игры: одна строка, без диалога, с заглавной.
        const sc = l.s ? firstChar(l.s) : '';
        if (!l.s || l.s.length > 72 || /Диалог/.test(l.s) || !sc || sc !== sc.toUpperCase() || /\s{2,}/.test(l.s) || /\s$/.test(l.s)) {
          add('stages-short', `${id}#${st.at}`, `короткий текст шага: «${(l.s ?? '').slice(0, 50)}» — нужен s до 72 знаков без диалога`);
        }
        if (!c || c !== c.toUpperCase() || /\s{2,}/.test(l.t) || /\s$/.test(l.t)) add('text', `${id}#${st.at}`, `текст шага: «${l.t.slice(0, 50)}»`);
        if (l.at && badPoint(l.at)) add('stages-point', `${id}#${st.at}`, `клетка ${l.at.join(',')} вне карты`);
        if (l.need && !pool.some((it) => it.name === l.need) && !st.do.some((o) => o.has === l.need)) add('stages-need', `${id}#${st.at}`, `условие «${l.need}» не среди предметов этапа и шага и не в has его шагов`);
      }
    }
    for (const p of q.route ?? []) {
      for (const t of p.steps) {
        const c = firstChar(t);
        if (!c || c !== c.toUpperCase() || /\s{2,}/.test(t)) add('text', `${id}: ${p.title}`, `текст маршрута: «${t.slice(0, 50)}»`);
      }
    }
  }

  // --- Способы прокачки: уникальные id, осмысленные уровни и скорости, места из словаря, ссылки на вики ---
  if (input.training) {
    const known = input.skillIds ? new Set(input.skillIds) : null;
    const seenIds = new Set<string>();
    for (const m of input.training.methods) {
      if (seenIds.has(m.id)) add('training-id', m.id, 'повтор идентификатора');
      seenIds.add(m.id);
      const skills = Array.isArray(m.skill) ? m.skill : [m.skill];
      if (known) for (const s of skills) if (!known.has(s)) add('training-skill', m.id, `неизвестный навык ${s}`);
      if (!Number.isInteger(m.from) || m.from < 1 || m.from > 98) add('training-range', m.id, `уровень входа ${m.from}`);
      if (m.to !== null && m.to !== undefined && (!Number.isInteger(m.to) || m.to <= m.from || m.to > 99)) add('training-range', m.id, `диапазон ${m.from}–${m.to}`);
      if (m.xph && (m.xph.length !== 2 || !(m.xph[0] > 0) || m.xph[1] < m.xph[0])) add('training-rate', m.id, `скорость ${JSON.stringify(m.xph)}`);
      if (m.xpa !== undefined && !(m.xpa > 0)) add('training-rate', m.id, `опыт за действие ${m.xpa}`);
      if (m.kind === 'quest' && !(m.xpTotal && m.xpTotal > 0)) add('training-rate', m.id, 'квест без награды опытом');
      if (!/^https:\/\/oldschool\.runescape\.wiki\/w\//.test(m.url)) add('training-url', m.id, `ссылка не на вики: ${m.url}`);
      if (input.places && m.place && !(m.place in input.places.locations)) add('training-place', m.id, `места «${m.place}» нет в словаре мест`);
      const c = firstChar(m.name);
      if (!c || c !== c.toUpperCase() || !m.where.trim()) add('text', m.id, `название или место способа: «${m.name.slice(0, 40)}»`);
    }
  }
  return out;
}

export function qaLines(issues: QaIssue[]): { lines: string[]; errors: number } {
  if (!issues.length) return { lines: ['  ✓ Согласованность: снаряжение, амулеты, телепорт домой, этапы квестов, способы прокачки — без замечаний'], errors: 0 };
  return { lines: issues.map((i) => `  ✗ [${i.rule}] ${i.where}: ${i.message}`), errors: issues.length };
}
