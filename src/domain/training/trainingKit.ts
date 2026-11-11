// The training card's equipment line: the engine's own decision about the tool or kit for the selected method, never a fixed note. An advised
// upgrade says what it saves; a kept tool says why it stays; other methods name the items the selected method actually uses.
import type { PlayerState } from '../player/playerState';
import type { PriceView } from '../market/quotes';
import type { MethodPriority } from '../persistence/playStyle';
import { toolUse } from '../items/toolTiers';
import { preparationNeeds, type TrainingAdvice } from './trainingRouter';
import { toolTierAt } from './stages';
import { hoursText } from './toolUpgrade';

const an = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;

export function equipmentLine(advice: Pick<TrainingAdvice, 'best' | 'upgrade' | 'level' | 'skill'>, state: PlayerState,
  prices?: PriceView | null, priority: MethodPriority = 'balanced'): string | null {
  const { best, upgrade } = advice;
  if (!best) return null;
  if (upgrade) return `Buy ${an(upgrade.tool)} (≈ ${upgrade.price.toLocaleString('en-US')} gp): it saves about ${hoursText(upgrade.hours)}${
    toolUse(upgrade.tool) ? ' before the next tier, the trip to buy it included' : ' on this method'}.`;
  const tool = best.method.selectedTool, use = tool ? toolUse(tool) : null;
  if (tool && use) {
    // Relaxed and Money do not weigh time against a purchase (toolUpgrade): the tool in hand is simply the one used.
    if (priority === 'relaxed' || priority === 'profit') return `Uses your ${tool}.`;
    const top = advice.level === null ? null : toolTierAt(use.skill, advice.level, state.mode);
    if (top && toolUse(top)!.level <= use.level) return `Your ${tool} is the best tier your level allows.`;
    const next = best.method.upgrades?.[0]?.tool;
    return next ? `Keep your ${tool}: ${an(next)} saves too little here to pay for the trip to buy it.` : `Uses your ${tool}; a better tier has no price yet.`;
  }
  const items = [...new Set(preparationNeeds(advice, state, prices).flatMap(n => n.type === 'item' ? [n.name]
    : n.type === 'tool' ? [n.skill === 'mining' ? 'any pickaxe' : 'any axe'] : []))];
  return items.length ? `Uses: ${items.slice(0, 4).join(', ')}${items.length > 4 ? ' and more' : ''}.` : null;
}
