// What to do with a drop (the Big bones of frogs and giants, a raw catch): process it toward a skill goal above the current level
// (bury bones, cook fish), sell what earns coins after tax, bury bones that sell for nothing, and leave the rest. One rule for every
// training card and every Money method.
import { processingJson } from '../../data';
import { nameKey } from '../items/itemKey';

interface Recipe { skill: string; level: number; xp: number; inputs: readonly { name: string }[] }

/** Single-input processing recipes by input name: burying a bone, cooking a raw catch. */
const USES = new Map<string, Recipe[]>();
for (const r of (processingJson as unknown as { recipes: Recipe[] }).recipes) {
  if (r.inputs.length !== 1) continue;
  const key = nameKey(r.inputs[0].name);
  USES.set(key, [...(USES.get(key) ?? []), r]);
}
const VERB: Record<string, 'bury' | 'cook'> = { prayer: 'bury', cooking: 'cook' };
const label = (skill: string) => skill[0].toUpperCase() + skill.slice(1);

export interface DropUse { action: 'bury' | 'cook' | 'use' | 'sell' | 'keep' | 'leave'; text: string }

/** The best use of one kind of drop for this player. goal is a level the player works towards in that skill (a quest's need or a
 * followed goal); coinsEach is the sale after tax, null when it cannot be sold or has no price, and noSale says which; processed is
 * the best Money processing method that takes it (tanning a cowhide) and the coins it adds per item over a raw sale; keepFor names the
 * followed training method that uses the item up (feathers for fly fishing). */
export function dropUse(item: string, o: { level: (skill: string) => number | null; goal: (skill: string) => number | null; coinsEach: number | null; noSale?: 'restricted' | 'unpriced'; processed?: { title: string; extraEach: number }; keepFor?: string }): DropUse {
  const uses = USES.get(nameKey(item)) ?? [];
  for (const r of uses) {
    const level = o.level(r.skill) ?? 1;
    const goal = o.goal(r.skill);
    if (goal !== null && level < goal && level >= r.level) {
      const verb = VERB[r.skill] ?? 'use';
      return { action: verb, text: `${item}: ${verb} them, ${r.xp} ${label(r.skill)} XP each toward ${label(r.skill)} ${goal}.` };
    }
  }
  if (o.keepFor) return { action: 'keep', text: `${item}: keep them for ${o.keepFor}.` };
  if (o.processed && o.processed.extraEach >= 1) {
    return { action: 'use', text: `${item}: ${o.processed.title} pays about ${Math.round(o.processed.extraEach).toLocaleString('en-US')} gp more each than selling them raw.` };
  }
  if (o.coinsEach !== null && o.coinsEach > 0) {
    const skills = [...new Set(uses.map((r) => label(r.skill)))];
    return { action: 'sell', text: `${item}: sell them, about ${Math.round(o.coinsEach).toLocaleString('en-US')} gp each after tax${skills.length ? `; no ${skills.join(' or ')} goal needs them` : ''}.` };
  }
  if (o.noSale === 'restricted') return { action: 'keep', text: `${item}: bank them; this account cannot sell them yet.` };
  if (o.noSale === 'unpriced') return { action: 'keep', text: `${item}: bank them; no exchange price is known yet.` };
  const bury = uses.find((r) => r.skill === 'prayer');
  if (bury) return { action: 'bury', text: `${item}: bury them, ${bury.xp} Prayer XP each; they sell for nothing.` };
  return { action: 'leave', text: `${item}: leave them; they sell for nothing.` };
}
