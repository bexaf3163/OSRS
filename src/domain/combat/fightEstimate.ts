// One quest fight with the kit the player has now (combat estimate group 7, 2.63.0): Count Draynor, Ithoi, Brutus, Melzar, the Lesser demon, Elvarg,
// the Black Knights, the Ancient Guardian. The same rolls as the training estimate (combatEstimate.ts): the player's hits against the opponent's
// defence, its swings while the fight lasts against the worn armour, and the fight's own mechanics from data (fightMechanics.json). One fight,
// at the current levels, with the safest melee style (the least damage taken), or the route's spell from a spot it cannot reach. It is an
// estimate: the range holds about 9 outcomes in 10, and no kit guarantees survival.

import { stepFood as foodOfStep } from '../player/foodStock';
import { equippedBySlot, gearData, gearPieceByName, meleeAs, SLOTS, type TrainStyle } from './gearAdvisor';
import type { GearState } from '../../services/runeliteBridge';
import type { GearPiece, Step } from '../../types';
import { attackCounts, attacksToKill, COMBAT_FOES, foeLabel, hitChance, spread, swingDamage, swingsPerFight, type CombatFoe, type Range } from './combatEstimate';
import { THREATS } from '../../data/threats';
import { FIGHT_MECHANICS, PROTECTIONS, type FightMechanics } from '../../data/fightMechanics';
import { nameKey } from '../items/itemKey';
import { SPELLS, spellHit, STAFFS } from './magicPlan';

const TICK = 0.6;
const STYLES: TrainStyle[] = ['accurate', 'aggressive', 'defensive'];
const STYLE_WORD: Record<TrainStyle, string> = { accurate: 'Accurate', aggressive: 'Aggressive', defensive: 'Defensive' };
/** Overheal and eating early waste part of each piece (as the training estimate). */
const USABLE: [number, number] = [0.85, 1];

export interface FightEstimate {
  foe: CombatFoe;
  style: TrainStyle;
  /** The fight alone, seconds. */
  seconds: Range;
  /** Damage taken over the fight, before eating. */
  damage: Range;
  /** Pieces of the given food: the damage beyond the health kept above its worst hits. */
  food: Range;
  foodName: string;
  /** The player's chance to hit and max hit with that style. */
  hitChance: number;
  maxHit: number;
  /** Its chance to hit the player. */
  foeHitChance: number;
  /** The largest single hit the fight can land with the kit as estimated (a special, unprotected dragonfire). */
  worstHit: number;
  assumed: string[];
  /** Its other attacks from the wiki (a special, dragonfire) that no mechanic entry covers: said, not modelled. */
  extra: string[];
  /** Ordinary damage rolls cannot prove readiness when a required mechanic is outside the model. */
  unmodelled: readonly string[];
  /** Modelled, and these levels and kit cannot win it (his regeneration outpaces the hits): more levels or kit change it. */
  cannot?: string;
  /** Fought from a safespot with this spell (fightMechanics.json safespot): the casts it takes. */
  spell?: string;
  casts?: Range;
}

export interface FightInput {
  foe: CombatFoe;
  levels: { attack: number; strength: number; defence: number; hitpoints: number; magic?: number };
  weapon: GearPiece | null;
  neck: GearPiece | null;
  armour: GearPiece[];
  unknownPieces?: number;
  food: { name: string; heals: number };
  currentHp?: number | null;
  /** What the step's kit puts in the inventory: a carried mechanic (garlic, the stake) counts only with its item among them. */
  carried?: readonly string[];
  /** Worn item names, for a named protection (the Anti-dragon shield). */
  worn?: readonly string[];
  /** The opponents its mechanics say come first (fightMechanics.json company), from the same table. */
  company?: readonly CombatFoe[];
  /** Casts of a safespot fight's spell that the step's runes pay for. */
  casts?: number;
}

/** Its chance to hit the player: melee against the worn armour's bonus of its type; magic against the player's magic defence. */
function foeChance(foe: CombatFoe, inp: FightInput, style: TrainStyle, weapon: GearPiece | null): number {
  const gear = [weapon, inp.neck, ...inp.armour];
  const effDef = inp.levels.defence + (style === 'defensive' ? 3 : 0) + 8;
  if (foe.attackStyle === 'magic') {
    // OSRS: the defender's magic level counts 70%, its defence 30%. Its own magic attack bonus is not in the table: counted as 0.
    const magic = inp.levels.magic ?? 1;
    const eff = Math.floor(magic * 0.7) + Math.floor(effDef * 0.3);
    const bonus = gear.reduce((s, p) => s + (p?.defence.magic ?? 0), 0);
    return hitChance((foe.magicLevel + 9) * 64, eff * (bonus + 64));
  }
  const type = (['stab', 'slash', 'crush', 'ranged'] as const).find((t) => t === foe.attackStyle) ?? 'crush';
  const bonus = gear.reduce((s, p) => s + (p?.defence[type] ?? 0), 0);
  return hitChance((foe.attackLevel + 9) * (foe.attackBonus + 64), effDef * (bonus + 64));
}

const held = (names: readonly string[] | undefined, item: string) => Boolean(names?.some((n) => nameKey(n) === nameKey(item)));
/** Regeneration is a rate against the player's own: past this many hit points of work the fight is not one to plan. */
const REGEN_CAP = 600;

interface Rolls { style: TrainStyle; secMean: number; secVar: number; dmgMean: number; dmgVar: number; chance: number; max: number; foeC: number; worst: number; keep: number }

/**
 * One opponent with the safest style: the player's hits against its defence, its swings against the worn armour, and what the wiki says of
 * this fight beyond that (fightMechanics.json): levels an item drains and their return, regeneration, the weapon the fight is done with,
 * a special after every few attacks, another attack with no known share. 'cannot' - the hits do not outpace its regeneration.
 */
function rolls(foe: CombatFoe, inp: FightInput, mech: FightMechanics | null, multiplier: number): Rolls | 'cannot' | null {
  const carried = (mech?.carried ?? []).filter((c) => held(inp.carried, c.item));
  const weapon = mech?.weapon ? gearPieceByName(mech.weapon.item) : inp.weapon;
  const drain = (key: 'hitpoints' | 'attack' | 'strength' | 'defence') => carried.reduce((n, c) => n + (c.drain[key] ?? 0), 0);
  const restoreTicks = carried.length ? Math.min(...carried.map((c) => c.restoreTicks)) : Infinity;
  const bonus = carried.reduce((n, c) => n + (c.maxHitBonus ?? 0), 0);
  // Another attack whose share the wiki does not give always lands and rolls 0..max: the worse one stands for every swing.
  const others = (mech?.attacks ?? []).map((a) => (a.protection && !PROTECTIONS[a.protection]?.some((name) => held(inp.worn, name)) ? a.unprotected ?? a.maxHit : a.maxHit));
  const special = mech?.specials?.[0];
  const specialHit = special ? Math.min(special.maxHit, Math.ceil(special.hitpointsShare * inp.levels.hitpoints)) : 0;
  const share = special ? 1 / (special.afterAttacks + 1) : 0;
  let best: Rolls | null = null;
  let outpaced = false;
  for (const style of STYLES) {
    // Drained levels come back 1 every restoreTicks: the fight is rolled at their mean level over its length, to a fixed point. Only the
    // kill's length decides that point; the full hit distribution (attackCounts) is rolled once, at the settled levels.
    let settled: { weakened: CombatFoe; hit: ReturnType<typeof meleeAs>; max: number; hp: number; a: { mean: number; variance: number } } | null = null;
    for (let pass = 0, restored = 0; pass < 6; pass++) {
      const level = (now: number, lost: number) => Math.min(now, Math.max(0, now - lost) + restored);
      const weakened = { ...foe, attackLevel: level(foe.attackLevel, drain('attack')), defenceLevel: level(foe.defenceLevel, drain('defence')) };
      const hit = meleeAs({ attack: inp.levels.attack, strength: inp.levels.strength, defence: inp.levels.defence }, weapon, inp.neck, style, weakened);
      const max = hit.maxHit + bonus;
      let hp = Math.ceil(Math.max(1, foe.hitpoints - drain('hitpoints')) / multiplier);
      if (mech?.regenTicks) {
        // The player's mean damage a tick (a successful 0 counted as 1, as the rolls below) against 1 hit point every regenTicks.
        const perTick = (hit.hitChance * (max * (max + 1) / 2 + 1)) / (max + 1) / (hit.speed / TICK);
        const scaled = perTick > 1 / mech.regenTicks ? Math.ceil((hp * perTick) / (perTick - 1 / mech.regenTicks)) : Infinity;
        if (scaled > REGEN_CAP) { outpaced = true; settled = null; break; }
        hp = scaled;
      }
      const a = attacksToKill(hp, max, hit.hitChance);
      if (!Number.isFinite(a.mean)) { settled = null; break; }
      settled = { weakened, hit, max, hp, a };
      const next = Number.isFinite(restoreTicks) ? Math.floor(a.mean * hit.speed / (2 * restoreTicks * TICK)) : 0;
      if (next <= restored) break;
      restored = next;
    }
    if (!settled) continue;
    const { weakened, hit, max, hp, a } = settled;
    const foeC = foeChance(weakened, inp, style, weapon);
    const plain = swingDamage(foeC, foe.maxHit);
    const other = others.map((n) => swingDamage(1, n)).sort((x, y) => y.mean - x.mean)[0];
    const swing = other && other.mean > plain.mean ? other : plain;
    const sw = swingsPerFight(attackCounts(hp, max, hit.hitChance), hit.speed / TICK, foe.speedTicks);
    const perSwing = (1 - share) * swing.mean + share * specialHit;
    const rolled = Math.max(foe.maxHit, ...others);
    const row: Rolls = {
      style, secMean: a.mean * hit.speed, secVar: a.variance * hit.speed ** 2, dmgMean: sw.mean * perSwing,
      dmgVar: sw.mean * (1 - share) * (swing.square - swing.mean ** 2) + sw.variance * perSwing ** 2,
      chance: hit.hitChance, max, foeC, worst: Math.max(rolled, specialHit), keep: Math.max(2 * rolled, specialHit + foe.maxHit),
    };
    if (!best || row.dmgMean < best.dmgMean - 1e-9 || (Math.abs(row.dmgMean - best.dmgMean) <= 1e-9 && row.secMean < best.secMean)) best = row;
  }
  return best ?? (outpaced ? 'cannot' : null);
}

/** The encounter search asks for the same fight many times (each kit, each trained level): identical inputs give the same estimate. */
const estimates = new Map<string, FightEstimate | null>();
const pieceKey = (p: GearPiece | null) => p?.id ?? '-';
export function estimateFight(inp: FightInput): FightEstimate | null {
  const mech = FIGHT_MECHANICS[inp.foe.name];
  const key = JSON.stringify([inp.foe, inp.levels, pieceKey(inp.weapon), pieceKey(inp.neck), inp.armour.map(pieceKey), inp.unknownPieces ?? 0, inp.food, inp.currentHp ?? null,
    mech ? [inp.carried ?? [], inp.worn ?? [], (inp.company ?? []).map(f => [f.name, f.version]), inp.casts ?? null] : null]);
  if (estimates.has(key)) return estimates.get(key)!;
  if (estimates.size > 2000) estimates.clear();
  const result = rollFight(inp);
  estimates.set(key, result);
  return result;
}

function rollFight(inp: FightInput): FightEstimate | null {
  const { foe } = inp;
  if (foe.hitpoints <= 0) return null;
  const mech = FIGHT_MECHANICS[foe.name] ?? null;
  const assumed: string[] = [];
  if (foe.attackStyle === 'magic') assumed.push(`${foeLabel(foe)} attacks with magic: its magic attack bonus counted as 0${inp.levels.magic === undefined ? ', your Magic as 1' : ''}`);
  if (inp.unknownPieces) assumed.push(`${inp.unknownPieces} worn item${inp.unknownPieces > 1 ? 's' : ''} without data counted as no armour`);
  if (inp.currentHp == null) assumed.push('you start at full health');
  if (mech) assumed.push(...mech.facts);
  if (mech?.safespot) return fromSafespot(inp, mech.safespot.spell, assumed);
  // Those that come first are fought with the same weapon, without its bonus against the main opponent.
  const first = mech?.weapon ? { ...mech, weapon: mech.weapon, carried: undefined, regenTicks: undefined, specials: undefined, attacks: undefined } : null;
  const parts = [...(inp.company ?? []).map((f) => rolls(f, inp, first, 1)), rolls(foe, inp, mech, mech?.weapon?.damageMultiplier ?? 1)];
  if (parts.some((part) => part === null)) return null;
  const won = parts.filter((part): part is Rolls => part !== 'cannot' && part !== null);
  const best = won[won.length - 1] as Rolls | undefined;
  const sum = (key: 'secMean' | 'secVar' | 'dmgMean' | 'dmgVar') => won.reduce((n, part) => n + part[key], 0);
  const worstHit = Math.max(foe.maxHit, ...won.map((part) => part.worst));
  const margin = (inp.unknownPieces ? 0.35 : 0.15) + (foe.aggressive ? 0.1 : 0) + (foe.attackStyle === 'magic' ? 0.15 : 0);
  const seconds = spread(sum('secMean'), sum('secVar'), margin);
  const damage = spread(sum('dmgMean'), sum('dmgVar'), margin);
  const startHp = Math.min(inp.levels.hitpoints, inp.currentHp ?? inp.levels.hitpoints);
  const buffer = Math.max(0, startHp - Math.max(2 * foe.maxHit, ...won.map((part) => part.keep)));
  const net = (d: number) => Math.max(0, d - buffer);
  const heals = inp.food.heals;
  const food: Range = {
    low: Math.floor(net(damage.low) / (heals * USABLE[1])),
    mid: Math.round(net(damage.mid) / (heals * ((USABLE[0] + USABLE[1]) / 2))),
    high: Math.ceil(net(damage.high) / (heals * USABLE[0])),
  };
  // A wiki attack above its plain hit is covered when a mechanic entry gives it (the special, the fire with and without the shield).
  const covered = new Set([...(mech?.specials ?? []).map((sp) => sp.maxHit), ...(mech?.attacks ?? []).flatMap((a) => [a.maxHit, ...(a.unprotected ? [a.unprotected] : [])])]);
  const threat = Object.values(THREATS).find((t) => t.page === foe.name);
  const extra = (threat?.hits ?? []).filter((h) => h.n > foe.maxHit && !covered.has(h.n)).map((h) => `${h.n}${h.label ? ` (${h.label})` : ''}`);
  if (extra.length) assumed.push(`its other attacks (${extra.join(', ')}) are not counted: the food is a lower bound`);
  const finisher = (mech?.finisher ?? []).filter((item) => !held(inp.carried, item));
  const unmodelled = [...extra.map(hit => `additional attack: ${hit}`),
    ...(finisher.length ? [`the killing blow needs ${finisher.join(' and ')} in the inventory, and this step does not carry ${finisher.length > 1 ? 'them' : 'it'}`] : []),
    ...(mech?.weapon && !gearPieceByName(mech.weapon.item) ? [`no combat data for ${mech.weapon.item}`] : []),
    ...(inp.unknownPieces ? ['worn equipment without verified combat bonuses'] : []),
    ...(foe.attackStyle === 'magic' && inp.levels.magic === undefined ? ['unread Magic level for incoming magic defence'] : []),
    ...(foe.maxHit > 0 && !['stab', 'slash', 'crush', 'magic'].includes(foe.attackStyle) ? [`unsupported incoming ${foe.attackStyle} attack model`] : [])];
  const cannot = parts.includes('cannot') ? `your hits do not outpace ${foeLabel(foe)}'s regeneration with these levels and this weapon` : undefined;
  return {
    foe, style: best?.style ?? 'accurate', seconds: cannot ? NEVER : seconds, damage: cannot ? NEVER : damage, food: cannot ? NEVER : food, foodName: inp.food.name,
    hitChance: best?.chance ?? 0, maxHit: best?.max ?? 0, foeHitChance: best?.foeC ?? 0, worstHit,
    assumed: [...new Set(assumed)], extra, unmodelled, ...(cannot ? { cannot } : {}),
  };
}
const NEVER: Range = { low: Infinity, mid: Infinity, high: Infinity };
const NONE: Range = { low: 0, mid: 0, high: 0 };
const SPELL_TICKS = 5;

/** From a spot it cannot reach: no damage and no food. The fight is the casts until it dies, at the Magic level and the worn magic attack
 * bonus; nothing can hit you there, so a piece that lowers that bonus is taken off (the route says so). 'cannot' below the spell's level
 * or when the step's runes pay for fewer casts than the estimate's high end. */
function fromSafespot(inp: FightInput, name: string, assumed: string[]): FightEstimate {
  const spell = SPELLS.find((s) => s.name === name);
  const magic = inp.levels.magic;
  const bonus = [inp.weapon, inp.neck, ...inp.armour].reduce((n, p) => n + Math.max(0, p?.attack.magic ?? 0), 0);
  const hit = spell && magic !== undefined ? spellHit(spell, magic, bonus, inp.foe) : null;
  const a = hit ? attacksToKill(inp.foe.hitpoints, hit.maxHit, hit.chance, false) : null;
  const casts = a && Number.isFinite(a.mean) ? spread(a.mean, a.variance, inp.unknownPieces ? 0.35 : 0.15) : null;
  const cannot = spell && magic !== undefined && magic < spell.level ? `${spell.name} needs Magic ${spell.level}`
    : casts && inp.casts !== undefined && casts.high > inp.casts ? `the step's runes pay for ${inp.casts} casts of ${name}; up to ${Math.ceil(casts.high)} may be needed`
      : undefined;
  const unmodelled = [...(!spell ? [`no spell data for ${name}`] : []), ...(magic === undefined ? ['unread Magic level'] : []),
    ...(inp.unknownPieces ? ['worn equipment without verified combat bonuses'] : [])];
  const seconds = casts && !cannot ? { low: casts.low * SPELL_TICKS * TICK, mid: casts.mid * SPELL_TICKS * TICK, high: casts.high * SPELL_TICKS * TICK } : NEVER;
  return {
    foe: inp.foe, style: 'accurate', seconds, damage: NONE, food: NONE, foodName: inp.food.name, hitChance: hit?.chance ?? 0, maxHit: hit?.maxHit ?? 0,
    foeHitChance: 0, worstHit: 0, assumed: [...new Set(assumed)], extra: [], unmodelled, ...(cannot ? { cannot } : {}),
    spell: name, ...(casts ? { casts } : {}),
  };
}

/** The quest fights of a step: its foes and its threats. */
export function stepFightNames(step: Pick<Step, 'foes' | 'threats' | 'pacing'>): string[] {
  if (step.pacing) return [];
  return [...new Set([...(step.foes ?? []), ...(step.threats ?? [])])];
}

/** Whether a fight of the step models its opponent's regeneration (fightMechanics.json regenTicks): then a modelled, safe estimate of that
 * fight is the proof a quest's "regeneration" capability asks for; without it regeneration stays unknown. */
export function modelsRegeneration(step: Pick<Step, 'foes' | 'threats' | 'pacing'>): boolean {
  return stepFightFoes(step).some((foe) => FIGHT_MECHANICS[foe.name]?.regenTicks !== undefined);
}

/** The quest fights of a step the table knows: the free version where there is one, else the members one (a members quest: Temple Guardian, Ghast). */
export function stepFightFoes(step: Pick<Step, 'foes' | 'threats' | 'pacing'>): CombatFoe[] {
  return stepFightNames(step).flatMap((n) => {
    const all = COMBAT_FOES.filter((f) => f.name === n);
    const free = all.filter((f) => !f.members);
    return (free.length ? free : all).slice(0, 1);
  });
}

/** The estimate for each quest fight of the step with the player's worn gear and levels; empty when the game has not given them. */
export function estimateStepFights(
  step: Pick<Step, 'foes' | 'threats' | 'pacing' | 'itemsRequired' | 'itemsRecommended'>, stats: Partial<Record<string, number>> | null, gear: GearState | null,
  food?: { name: string; heals: number },
): FightEstimate[] {
  const foes = stepFightFoes(step);
  if (!foes.length || !stats || !gear?.equipment) return [];
  const need = (k: string) => (typeof stats[k] === 'number' && (stats[k] as number) >= 1 ? (stats[k] as number) : null);
  const lv = { attack: need('attack'), strength: need('strength'), defence: need('defence'), hitpoints: need('hitpoints') };
  if (Object.values(lv).some((v) => v === null)) return [];
  const eq = equippedBySlot(gear, gearData);
  if (eq.weapon && !eq.weapon.piece) return [];
  const armour = (['head', 'body', 'legs', 'shield'] as const).map((s) => eq[s]?.piece).filter((p): p is GearPiece => Boolean(p));
  const unknownPieces = SLOTS.filter((s) => s !== 'weapon' && eq[s] && !eq[s]!.piece).length;
  const stepFood = foodOfStep(step);
  const f = food ?? (stepFood ? { name: stepFood.nameEn, heals: stepFood.heals! } : { name: 'Trout', heals: 7 });
  const magic = need('magic');
  // The step's own kit is what the fight is done with: an item it requires is carried there, whatever the bag holds now.
  const carried = (step.itemsRequired ?? []).flatMap((item) => [item.nameEn, ...(item.anyOf ?? [])]);
  const worn = gear.equipment.map((piece) => piece.name);
  // A safespot spell's casts: the fewest its runes pay for, a rune the worn staff gives counted as endless.
  const castsOf = (name: string) => {
    const spell = SPELLS.find((s) => s.name === name);
    const paid = Object.entries(spell?.runes ?? {}).filter(([element]) => !(STAFFS[element] && held(worn, STAFFS[element].name)))
      .map(([element, qty]) => Math.floor((step.itemsRequired ?? []).filter((item) => nameKey(item.nameEn) === nameKey(`${element} rune`))
        .reduce((n, item) => n + (typeof item.amount === 'number' ? item.amount : 0), 0) / qty));
    return paid.length ? Math.min(...paid) : undefined;
  };
  return foes.flatMap((foe) => {
    const listed = FIGHT_MECHANICS[foe.name]?.company ?? [];
    const company = listed.flatMap((c) => COMBAT_FOES.filter((x) => x.name === c.foe && (!c.version || x.version === c.version)).slice(0, 1));
    if (company.length !== listed.length) return []; // No numbers for one that comes first: no estimate, never a smaller fight.
    const e = estimateFight({
      foe, levels: { ...(lv as FightInput['levels']), ...(magic !== null ? { magic } : {}) }, weapon: eq.weapon?.piece ?? null, neck: eq.neck?.piece ?? null,
      armour, unknownPieces, food: f, carried, worn, company,
      ...(FIGHT_MECHANICS[foe.name]?.safespot ? { casts: castsOf(FIGHT_MECHANICS[foe.name].safespot!.spell) } : {}),
    });
    return e ? [e] : [];
  });
}

const sec = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

/** "Count Draynor: about 40 s on Aggressive; you take about 5 damage (up to 12); bring 2 Trout or more." */
export function fightLine(e: FightEstimate): string {
  if (e.cannot) return `${foeLabel(e.foe)}: ${e.cannot}.`;
  if (e.spell && e.casts) return `${foeLabel(e.foe)}: about ${Math.round(e.casts.mid)} casts of ${e.spell} (up to ${Math.ceil(e.casts.high)}), about ${sec(e.seconds.mid)} from the safespot; it cannot reach you there.`;
  const dmg = `you take about ${Math.round(e.damage.mid)} damage (up to ${Math.ceil(e.damage.high)})`;
  const food = e.food.high <= 0 ? 'your health covers it; carry a few pieces anyway' : `bring ${e.food.high} ${e.foodName} or more`;
  return `${foeLabel(e.foe)}: about ${sec(e.seconds.mid)} on ${STYLE_WORD[e.style]}; ${dmg}; ${food}.${e.unmodelled.length ? ' Partial estimate: some combat facts or mechanics are not included.' : ''}`;
}
