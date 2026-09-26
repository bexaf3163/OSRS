// Типизированный доступ к данным, перенесённым из osrs-guide.md (npm run parse-guide).

import type {
  GoalsData, LevelSkill, PluginsData, QuestsData, ReferenceData, Skill, StagesData, Step, XpData,
} from '../types';
import stepsJson from './steps.json';
import stagesJson from './stages.json';
import skillsJson from './skills.json';
import levelsJson from './levels.json';
import goalsJson from './goals.json';
import xpJson from './xp.json';
import pluginsJson from './plugins.json';
import referenceJson from './reference.json';
import questsJson from './quests.json';

export const steps = stepsJson as Step[];
export const stagesData = stagesJson as StagesData;
export const stages = stagesData.stages;
export const skills = skillsJson as Skill[];
export const levelSkills = levelsJson as LevelSkill[];
export const goals = goalsJson as GoalsData;
export const xpData = xpJson as XpData;
export const plugins = pluginsJson as PluginsData;
export const reference = referenceJson as ReferenceData;
export const questsData = questsJson as QuestsData;

export const stepById = new Map(steps.map((s) => [s.id, s]));
export const skillById = new Map(skills.map((s) => [s.id, s]));
export const levelById = new Map(levelSkills.map((l) => [l.id, l]));

/** Очки за Learning the Ropes — обучающий остров, всегда засчитан. */
export const BASE_QP = questsData.base.qp;
export const MAX_QP = BASE_QP + steps.reduce((sum, s) => sum + (s.qp ?? 0), 0);

export const known = {
  stepIds: new Set(steps.map((s) => s.id)),
  levelIds: new Set(levelSkills.map((l) => l.id)),
};
