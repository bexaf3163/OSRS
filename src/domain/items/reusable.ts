// Items that a step uses without consuming them: tools, worn gear and style-specific equipment.
import { nameKey } from './itemKey';
import { toolFamilyOf } from './toolTiers';
import { gearJson, styleGearJson as styleJson } from '../../data';

/**
 * Tools and gear: they are not used up, so one is enough for all the steps: the largest
 * quantity per step is taken, not the sum. Everything else (ore, food, quest items) is summed.
 */
export const REUSABLE = new Set([
  'bronze axe', 'bronze pickaxe', 'mithril axe', 'small fishing net', 'fly fishing rod', 'harpoon', 'lobster pot',
  'tinderbox', 'spade', 'hammer', 'knife', 'shears', 'chisel', 'secateurs', 'ghostspeak amulet', 'dramen staff',
  'anti-dragon shield', 'rune sword', 'rune scimitar', 'adamant scimitar', 'holy symbol',
]);
/** Anything worn (weapons, armour, amulets) is not used up either: the gear data knows every one of them. */
const WORN = new Set((gearJson as { items: { name: string; slot?: string }[] }).items.filter((p) => p.slot).map((p) => nameKey(p.name)));
// Style-specific equipment uses its existing registry too; ammunition remains consumable.
const STYLE_WORN = new Set([styleJson.magic, styleJson.ranged].flatMap(style => Object.entries(style)
  .flatMap(([slot, options]) => slot === 'ammo' ? [] : options.flatMap(option => option.names.map(nameKey)))));
/** One is enough for every step: a tool of any tier, or something worn. */
export function isReusable(nameEn: string): boolean {
  const k = nameKey(nameEn);
  return REUSABLE.has(k) || WORN.has(k) || STYLE_WORN.has(k) || toolFamilyOf(nameEn) !== null;
}
