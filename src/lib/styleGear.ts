// "What to wear for magic and ranged": the wiki's recommendations (styleGear.json, build-style-gear) for your levels, quests and wallet.
// The wiki's slot options go from the best to the available. We take the best suitable one that you already have, otherwise — by your means.

import styleJson from '../data/styleGear.json';
import { nameKey } from './checklist';

export interface StyleReq { skill: string; level: number }
export interface StyleOption { names: string[]; reqs: StyleReq[]; quests: string[]; note?: string }
export type StyleSlots = Record<string, StyleOption[]>;
export type Style = 'magic' | 'ranged';

export const STYLE_GEAR = styleJson as unknown as { generatedAt: string; magic: StyleSlots; ranged: StyleSlots };
export const SLOT_ORDER = ['weapon', 'ammo', 'head', 'body', 'legs', 'shield', 'neck', 'cape', 'hands', 'feet'];
export const SLOT_LABEL: Record<string, string> = {
  weapon: 'Weapon', ammo: 'Ammo', head: 'Head', body: 'Body', legs: 'Legs', shield: 'Shield', neck: 'Neck', cape: 'Cape', hands: 'Hands', feet: 'Feet',
};

export type PickStatus = 'worn' | 'bag' | 'buy' | 'save' | 'find' | 'locked';
export interface SlotPick {
  slot: string;
  /** What we advise; null — nothing (there is no suitable option). */
  name: string | null;
  status: PickStatus;
  price: number | null;
  /** An explanation: "no exchange price", "everything costs more than your coins". */
  note?: string;
  /** A slot option higher in the wiki's rank that was not chosen (not by level/quest/wallet). */
  better?: { name: string; why: string };
}

export interface StyleInput {
  style: Style;
  levels: Readonly<Record<string, number | undefined>>;
  /** The names of completed quests (as in the game). */
  quests: ReadonlySet<string>;
  worn: ReadonlySet<string>;
  bag: ReadonlySet<string>;
  /** Coins: null — unknown (then the price does not cut anything off). */
  cash: number | null;
  /** The exchange price by name; null — the item is not traded or there is no price. */
  price: (name: string) => number | null;
}

/** Quests that go in the route as a step under another name: the game writes "Dragon Slayer I", the step is "The battle with the dragon Elvarg". */
export const QUEST_STEP: Readonly<Record<string, string>> = { 'Dragon Slayer I': 'S5-08' };

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** What the option lacks by the known levels and quests. */
export function unmet(o: StyleOption, levels: StyleInput['levels'], quests: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const r of o.reqs) {
    const have = levels[r.skill];
    // An unknown level does not block: a doubtful value means "show".
    if (have !== undefined && have < r.level) missing.push(`${cap(r.skill)} ${r.level}`);
  }
  const done = new Set([...quests].map(nameKey));
  for (const q of o.quests) if (!done.has(nameKey(q))) missing.push(q);
  return missing;
}

/** The wiki note "(Maple shortbow only)" / "(Willow shortbow or higher)": arrows do not suit every bow. */
export function ammoFits(o: StyleOption, weapon: string | null, weapons: readonly StyleOption[]): string | null {
  const m = /^\((.+?) (only|or higher)\)$/.exec(o.note ?? '');
  if (!m || !weapon) return null;
  const rank = (n: string) => weapons.findIndex((w) => w.names.includes(n));
  const mine = rank(weapon);
  const need = rank(m[1]);
  if (mine < 0 || need < 0) return null;
  const ok = m[2] === 'only' ? mine === need : mine <= need;
  return ok ? null : `${o.names[0]} ${m[2] === 'only' ? `only with ${m[1]}` : `from ${m[1]}`}`;
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
        better ??= { name: o.names[0], why: `needs ${missing.join(', ')}` };
        continue;
      }
      const misfit = slot === 'ammo' ? ammoFits(o, picks.find((p) => p.slot === 'weapon')?.name ?? null, slots.weapon ?? []) : null;
      if (misfit) { better ??= { name: o.names[0], why: `does not fit your bow: ${misfit}` }; continue; }
      const have = o.names.find((n) => inp.worn.has(n)) ?? o.names.find((n) => inp.bag.has(n));
      if (have) { chosen = { slot, name: have, status: inp.worn.has(have) ? 'worn' : 'bag', price: null }; break; }
      const priced = o.names.map((n) => ({ name: n, price: inp.price(n) })).filter((x): x is { name: string; price: number } => x.price !== null);
      if (!priced.length) { chosen = { slot, name: o.names[0], status: 'find', price: null, note: 'not sold at the exchange: obtained in the game' }; break; }
      let best = priced.reduce((a, b) => (b.price < a.price ? b : a));
      // With Fire Strike (Magic 13) the staff of fire replaces three fire runes per cast — we take it if affordable, not the cheapest of the four.
      const fire = priced.find((x) => x.name === 'Staff of fire');
      if (inp.style === 'magic' && slot === 'weapon' && fire && (inp.levels.magic ?? 99) >= 13 && (inp.cash === null || fire.price <= inp.cash)) best = fire;
      if (!cheapest || best.price < cheapest.price) cheapest = best;
      if (inp.cash === null || best.price <= inp.cash) { chosen = { slot, name: best.name, status: 'buy', price: best.price }; break; }
      better ??= { name: best.name, why: `≈ ${best.price.toLocaleString('en-US')} gp: not affordable yet` };
    }
    if (!chosen) {
      chosen = cheapest
        ? { slot, name: cheapest.name, status: 'save', price: cheapest.price, note: 'everything suitable costs more than your coins: this is the cheapest' }
        : { slot, name: null, status: 'locked', price: null };
    }
    picks.push(better && better.name !== chosen.name ? { ...chosen, better } : chosen);
  }
  return picks;
}

/** How much it costs to top up what we advise to buy or save for. */
export const shoppingTotal = (picks: readonly SlotPick[]): number => picks.reduce((s, p) => s + (p.status === 'buy' || p.status === 'save' ? p.price ?? 0 : 0), 0);
