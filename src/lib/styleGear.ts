// «Что носить для магии и стрельбы»: рекомендации вики (styleGear.json, build-style-gear) под твои уровни, квесты и кошелёк.
// Варианты слота у вики идут от лучшего к доступному. Берём лучший из подходящих, который уже есть, иначе — по карману.

import styleJson from '../data/styleGear.json';

export interface StyleReq { skill: string; level: number }
export interface StyleOption { names: string[]; reqs: StyleReq[]; quests: string[]; note?: string }
export type StyleSlots = Record<string, StyleOption[]>;
export type Style = 'magic' | 'ranged';

export const STYLE_GEAR = styleJson as unknown as { generatedAt: string; magic: StyleSlots; ranged: StyleSlots };
export const SLOT_ORDER = ['weapon', 'ammo', 'head', 'body', 'legs', 'shield', 'neck', 'cape', 'hands', 'feet'];
export const SLOT_RU: Record<string, string> = {
  weapon: 'Оружие', ammo: 'Боеприпасы', head: 'Голова', body: 'Тело', legs: 'Ноги', shield: 'Щит', neck: 'Шея', cape: 'Плащ', hands: 'Руки', feet: 'Обувь',
};

export type PickStatus = 'worn' | 'bag' | 'buy' | 'save' | 'find' | 'locked';
export interface SlotPick {
  slot: string;
  /** Что советуем; null — нечего (нет подходящего варианта). */
  name: string | null;
  status: PickStatus;
  price: number | null;
  /** Пояснение: «нет цены на бирже», «всё дороже твоих монет». */
  note?: string;
  /** Вариант слота выше по рангу вики, который не выбран (не по уровню/квесту/кошельку). */
  better?: { name: string; why: string };
}

export interface StyleInput {
  style: Style;
  levels: Readonly<Record<string, number | undefined>>;
  /** Названия выполненных квестов (как в игре). */
  quests: ReadonlySet<string>;
  worn: ReadonlySet<string>;
  bag: ReadonlySet<string>;
  /** Монеты: null — неизвестно (тогда цена не отсекает). */
  cash: number | null;
  /** Цена на бирже по названию; null — предмет не торгуется или цены нет. */
  price: (name: string) => number | null;
}

/** Квесты, которые в маршруте идут шагом под другим названием: игра пишет «Dragon Slayer I», шаг — «Битва с драконом Elvarg». */
export const QUEST_STEP: Readonly<Record<string, string>> = { 'Dragon Slayer I': 'S5-08' };

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** Чего не хватает варианту по известным уровням и квестам. */
export function unmet(o: StyleOption, levels: StyleInput['levels'], quests: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const r of o.reqs) {
    const have = levels[r.skill];
    // Неизвестный уровень не блокирует: сомнительное значение — «показывать».
    if (have !== undefined && have < r.level) missing.push(`${cap(r.skill)} ${r.level}`);
  }
  for (const q of o.quests) if (!quests.has(q)) missing.push(q);
  return missing;
}

/** Пометка вики «(Maple shortbow only)» / «(Willow shortbow or higher)»: стрелы подходят не к любому луку. */
export function ammoFits(o: StyleOption, weapon: string | null, weapons: readonly StyleOption[]): string | null {
  const m = /^\((.+?) (only|or higher)\)$/.exec(o.note ?? '');
  if (!m || !weapon) return null;
  const rank = (n: string) => weapons.findIndex((w) => w.names.includes(n));
  const mine = rank(weapon);
  const need = rank(m[1]);
  if (mine < 0 || need < 0) return null;
  const ok = m[2] === 'only' ? mine === need : mine <= need;
  return ok ? null : `${o.names[0]} ${m[2] === 'only' ? `только к ${m[1]}` : `начиная с ${m[1]}`}`;
}

export function adviseStyle(inp: StyleInput): SlotPick[] {
  const slots = STYLE_GEAR[inp.style];
  const picks: SlotPick[] = [];
  for (const slot of SLOT_ORDER) {
    const options = slots[slot];
    if (!options?.length) continue;
    let better: SlotPick['better'];
    let cheapest: { name: string; price: number } | null = null;
    let chosen: SlotPick | null = null;
    for (const o of options) {
      const missing = unmet(o, inp.levels, inp.quests);
      if (missing.length) {
        better ??= { name: o.names[0], why: `нужно ${missing.join(', ')}` };
        continue;
      }
      const misfit = slot === 'ammo' ? ammoFits(o, picks.find((p) => p.slot === 'weapon')?.name ?? null, slots.weapon ?? []) : null;
      if (misfit) { better ??= { name: o.names[0], why: `к твоему луку не подходит: ${misfit}` }; continue; }
      const have = o.names.find((n) => inp.worn.has(n)) ?? o.names.find((n) => inp.bag.has(n));
      if (have) { chosen = { slot, name: have, status: inp.worn.has(have) ? 'worn' : 'bag', price: null }; break; }
      const priced = o.names.map((n) => ({ name: n, price: inp.price(n) })).filter((x): x is { name: string; price: number } => x.price !== null);
      if (!priced.length) { chosen = { slot, name: o.names[0], status: 'find', price: null, note: 'на бирже не продаётся — добывается в игре' }; break; }
      const best = priced.reduce((a, b) => (b.price < a.price ? b : a));
      if (!cheapest || best.price < cheapest.price) cheapest = best;
      if (inp.cash === null || best.price <= inp.cash) { chosen = { slot, name: best.name, status: 'buy', price: best.price }; break; }
      better ??= { name: best.name, why: `≈ ${best.price.toLocaleString('ru-RU')} gp — пока не по карману` };
    }
    if (!chosen) {
      chosen = cheapest
        ? { slot, name: cheapest.name, status: 'save', price: cheapest.price, note: 'всё подходящее дороже твоих монет — это дешевле всего' }
        : { slot, name: null, status: 'locked', price: null };
    }
    picks.push(better && better.name !== chosen.name ? { ...chosen, better } : chosen);
  }
  return picks;
}

/** Сколько стоит докупить то, что советуем купить или копить. */
export const shoppingTotal = (picks: readonly SlotPick[]): number => picks.reduce((s, p) => s + (p.status === 'buy' || p.status === 'save' ? p.price ?? 0 : 0), 0);
