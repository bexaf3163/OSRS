import { stepById } from '../../data';
import { questCatalogue, questSkillTargets } from './catalogue';
import type { Progress } from '../../types';
import { isClosed } from '../quests/next-step';

/** The in-game skill tab, read row by row: the Members skill grid's order. */
export const SKILL_TAB_ORDER = ['attack', 'hitpoints', 'mining', 'strength', 'agility', 'smithing', 'defence', 'herblore', 'fishing',
  'ranged', 'thieving', 'cooking', 'prayer', 'crafting', 'firemaking', 'magic', 'fletching', 'woodcutting', 'runecraft', 'slayer',
  'farming', 'construction', 'hunter'];

/** The highest level each skill needs for a quest the route has not finished: the guide's minima and its steps' own requirements. */
export function questLevelNeeds(progress: Progress, members: boolean): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const quest of questCatalogue) {
    if ((quest.members && !members) || quest.stepIds.every((id) => isClosed(progress, id))) continue;
    const steps = quest.stepIds.flatMap((id) => stepById.get(id) ?? []);
    for (const [skill, level] of Object.entries(questSkillTargets(quest, steps))) out.set(skill, Math.max(out.get(skill) ?? 0, level));
  }
  return out;
}

/** The Members tile's status line, in the free-to-play tile's marks. */
export function questNeedLabel(need: number | undefined, level: number | undefined): string {
  if (!need) return '· No quest needs it';
  return level !== undefined && level >= need ? `✓ ${need} for quests` : `→ ${need} for quests`;
}
