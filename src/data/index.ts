// Типизированный доступ к данным.
// Маршрут V2 — steps.json и stages.json (источник правды для шагов).
// Навыки, цели, опыт, плагины и справка — из osrs-guide.md (npm run parse-guide).
// База предметов — f2p-items.json с OSRS Wiki (npm run build-items).

import type {
  GameMode, GoalsData, LevelSkill, MembersSkillsData, PluginsData, ReferenceData, Skill, Stage, Step, WikiItemDetail, XpData,
} from '../types';
import { titleTargets } from '../lib/targets';
import { deriveQuests } from '../lib/quests';
import stepsJson from './steps.json';
import questStagesJson from './questStages.json';
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
const stagesByStep = (questStagesJson as unknown as { quests: Record<string, Step['questStages']> }).quests;

/** «Прохождение» квеста из разделов Quest Helper: по порядку, без заголовков разделов. */
function routeSteps(q: Step['questStages']): string[] | undefined {
  const flat = (q?.route ?? []).flatMap((p) => p.steps);
  return flat.length ? flat : undefined;
}

export const allSteps: Step[] = (stepsJson as Step[]).map((s0) => {
  const q = stagesByStep[s0.id];
  // У квеста с полным маршрутом «Прохождение» берётся из него: прежние пункты пропускали ходы (подняться по лестнице и т. п.).
  const s: Step = q ? { ...s0, questStages: q, ...(routeSteps(q) ? { quickSteps: routeSteps(q) } : {}) } : s0;
  if (s.type !== 'skill' && s.type !== 'gear') return s;
  const targets = titleTargets(s.title);
  return targets.length ? { ...s, targets } : s;
});
export const allStages = stagesJson as Stage[];
/** Бесплатные навыки из гайда. */
export const skills = skillsJson as Skill[];
export const levelSkills = levelsJson as LevelSkill[];
/** Раздел гайда «Навыки подписки»: вступление и восемь навыков с планами прокачки. */
export const membersGuide = membersSkillsJson as MembersSkillsData;
export const membersSkills = membersGuide.skills;
export const goals = goalsJson as GoalsData;
export const xpData = xpJson as XpData;
export const plugins = pluginsJson as PluginsData;
export const reference = referenceJson as ReferenceData;
export const items = itemsJson as WikiItemDetail[];

export const stepById = new Map(allSteps.map((s) => [s.id, s]));
/** Разделы навыков по коду: WC, ME… и навыки подписки AG, SL… */
export const skillById = new Map([...skills, ...membersSkills].map((s) => [s.id, s]));
export const itemById = new Map(items.map((i) => [i.id, i]));

/** Все навыки с уровнями: бесплатные и подписки. skill — код раздела навыка в гайде. */
export const allLevelSkills: (LevelSkill & { membersOnly?: boolean })[] = [
  ...levelSkills,
  ...membersSkills.map((m) => ({ id: m.levelSkills[0], name: m.name, skill: m.id, membersOnly: true })),
];
export const levelById = new Map(allLevelSkills.map((l) => [l.id, l]));

/**
 * Раздел навыка по коду («AG») или по id уровня («agility», «attack»). Старые ссылки #/skills/agility
 * ведут туда же, куда новые #/skills/AG.
 */
export function findSkill(id: string): Skill | undefined {
  return skillById.get(id) ?? skillById.get(levelById.get(id)?.skill ?? '');
}

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
