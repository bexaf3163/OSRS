// Typed access to the data.
// The V2 route — steps.json and stages.json (the source of truth for the steps).
// Skills, goals, experience, plugins and the reference — the JSON files in this folder.
// The item database — f2p-items.json from the OSRS Wiki (npm run build-items).

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

/** All V2 steps, including Members. Level goals are computed from the titles. */
const stagesByStep = (questStagesJson as unknown as { quests: Record<string, Step['questStages']> }).quests;

/** The quest "Walkthrough" from the Quest Helper sections: in order, without the section headings. */
function routeSteps(q: Step['questStages']): string[] | undefined {
  const flat = (q?.route ?? []).flatMap((p) => p.steps);
  return flat.length ? flat : undefined;
}

export const allSteps: Step[] = (stepsJson as Step[]).map((s0) => {
  const q = stagesByStep[s0.id];
  // For a quest with a full "Walkthrough" route it is taken from there: the earlier points skipped moves (climb the stairs and so on).
  const s: Step = q ? { ...s0, questStages: q, ...(routeSteps(q) ? { quickSteps: routeSteps(q) } : {}) } : s0;
  if (s.type !== 'skill' && s.type !== 'gear') return s;
  const targets = titleTargets(s.title);
  return targets.length ? { ...s, targets } : s;
});
export const allStages = stagesJson as Stage[];
/** The free skills of the guide. */
export const skills = skillsJson as Skill[];
export const levelSkills = levelsJson as LevelSkill[];
/** The "Members skills" section of the guide: an intro and eight skills with training plans. */
export const membersGuide = membersSkillsJson as MembersSkillsData;
export const membersSkills = membersGuide.skills;
export const goals = goalsJson as GoalsData;
export const xpData = xpJson as XpData;
export const plugins = pluginsJson as PluginsData;
export const reference = referenceJson as ReferenceData;
export const items = itemsJson as WikiItemDetail[];

export const stepById = new Map(allSteps.map((s) => [s.id, s]));
/** Skill sections by code: WC, ME… and the members skills AG, SL… */
export const skillById = new Map([...skills, ...membersSkills].map((s) => [s.id, s]));
export const itemById = new Map(items.map((i) => [i.id, i]));

/** All skills with levels: free and members. skill is the code of the skill's section in the guide. */
export const allLevelSkills: (LevelSkill & { membersOnly?: boolean })[] = [
  ...levelSkills,
  ...membersSkills.map((m) => ({ id: m.levelSkills[0], name: m.name, skill: m.id, membersOnly: true })),
];
export const levelById = new Map(allLevelSkills.map((l) => [l.id, l]));

/**
 * A skill section by code ("AG") or by level id ("agility", "attack"). Old #/skills/agility links
 * lead to the same place as the new #/skills/AG.
 */
export function findSkill(id: string): Skill | undefined {
  return skillById.get(id) ?? skillById.get(levelById.get(id)?.skill ?? '');
}

/** Points for Learning the Ropes — the tutorial island, always counted. */
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
