// Типизированный доступ к данным.
// Маршрут V2 — steps.json и stages.json (источник правды для шагов).
// Навыки, цели, опыт, плагины и справка — из osrs-guide.md (npm run parse-guide).
// База предметов — f2p-items.json с OSRS Wiki (npm run build-items).

import type {
  GameMode, GoalsData, LevelSkill, PluginsData, ReferenceData, Skill, Stage, Step, WikiItemDetail, XpData,
} from '../types';
import { titleTargets } from '../lib/targets';
import { deriveQuests } from '../lib/quests';
import stepsJson from './steps.json';
import stagesJson from './stages.json';
import skillsJson from './skills.json';
import levelsJson from './levels.json';
import membersSkillsJson from './members-skills.json';
import goalsJson from './goals.json';
import xpJson from './xp.json';
import pluginsJson from './plugins.json';
import referenceJson from './reference.json';
import itemsJson from './f2p-items.json';

/** Все шаги V2, включая Members. Цели по уровням вычисляются из названий. */
export const allSteps: Step[] = (stepsJson as Step[]).map((s) => {
  if (s.type !== 'skill' && s.type !== 'gear') return s;
  const targets = titleTargets(s.title);
  return targets.length ? { ...s, targets } : s;
});
export const allStages = stagesJson as Stage[];
export const skills = skillsJson as Skill[];
export const levelSkills = levelsJson as LevelSkill[];
export interface MembersSkill { id: string; name: string; nameEn: string; wiki: string }
export const membersSkills = membersSkillsJson as MembersSkill[];
export const goals = goalsJson as GoalsData;
export const xpData = xpJson as XpData;
export const plugins = pluginsJson as PluginsData;
export const reference = referenceJson as ReferenceData;
export const items = itemsJson as WikiItemDetail[];

export const stepById = new Map(allSteps.map((s) => [s.id, s]));
export const skillById = new Map(skills.map((s) => [s.id, s]));
export const itemById = new Map(items.map((i) => [i.id, i]));

/** Все навыки с уровнями: F2P из гайда и Members из ТЗ. */
export const allLevelSkills: (LevelSkill & { membersOnly?: boolean })[] = [
  ...levelSkills,
  ...membersSkills.map((m) => ({ id: m.id, name: m.name, skill: m.id, membersOnly: true })),
];
export const levelById = new Map(allLevelSkills.map((l) => [l.id, l]));

/** Очки за Learning the Ropes — обучающий остров, всегда засчитан. */
export const BASE_QP = 1;
export const BASE_QUEST = 'Learning the Ropes';

export function stepsFor(mode: GameMode): Step[] {
  return mode === 'members' ? allSteps : allSteps.filter((s) => s.membersOnly !== true);
}

export function stagesFor(mode: GameMode): Stage[] {
  return mode === 'members' ? allStages : allStages.filter((s) => s.membersOnly !== true);
}

export function maxQpFor(mode: GameMode): number {
  return BASE_QP + stepsFor(mode).reduce((sum, s) => sum + (s.qp ?? 0), 0);
}

export const allQuests = deriveQuests(allSteps);

export const known = {
  stepIds: new Set(allSteps.map((s) => s.id)),
  levelIds: new Set(allLevelSkills.map((l) => l.id)),
};
