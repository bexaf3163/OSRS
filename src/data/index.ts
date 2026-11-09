// Typed access to the data.
// The V2 route — steps.json (the source of truth for the steps).
// Skills, experience, plugins and the reference — the JSON files in authored/.
// The item database — f2p-items.json from the OSRS Wiki (npm run build-items).

import type {
  GameMode, LevelSkill, MembersSkillsData, PluginsData, ReferenceData, Skill, Step, WikiItemDetail, XpData,
} from '../types';
import { deriveQuests } from './quests';
import stepsJson from './authored/steps.json';
import questStagesJson from './authored/questStages.json';
import skillsJson from './authored/skills.json';
import levelsJson from './authored/levels.json';
import membersSkillsJson from './authored/members-skills.json';
import xpJson from './authored/xp.json';
import pluginsJson from './authored/plugins.json';
import referenceJson from './authored/reference.json';
import itemsJson from './generated/f2p-items.json';
import questFactsJson from './generated/questFacts.json';
import worldRoutingJson from './generated/worldRouting.json';
export { questFactsJson, worldRoutingJson };

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
  return s;
});
/** The free skills of the guide. */
export const skills = skillsJson as Skill[];
export const levelSkills = levelsJson as LevelSkill[];
/** The "Members skills": eight skills trained only with membership. */
export const membersGuide = membersSkillsJson as MembersSkillsData;
export const membersSkills = membersGuide.skills;
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

/**
 * The route in a mode. F2P: the free route, ending in the optional way to a Bond. Members: the whole route, but not the way to a Bond —
 * an account that already has membership goes straight from Dragon Slayer I to the Members content, nothing waits for a grind meant to pay for it.
 */
export function stepsFor(mode: GameMode): Step[] {
  return mode === 'members' ? allSteps.filter((s) => s.bondBranch !== true) : allSteps.filter((s) => s.membersOnly !== true);
}

export function maxQpFor(mode: GameMode): number {
  return BASE_QP + stepsFor(mode).reduce((sum, s) => sum + (s.qp ?? 0), 0);
}

export const allQuests = deriveQuests(allSteps);

export const known = {
  stepIds: new Set(allSteps.map((s) => s.id)),
  // Hitpoints is kept from the game though it has no level field: the combat plan is worked out from the last levels while the game is away (2.72.1).
  levelIds: new Set([...allLevelSkills.map((l) => l.id), 'hitpoints']),
};

/** The data files that engines read as they are, so the folders under src/data stay private to this module. */
export { questStagesJson, referenceJson, stepsJson };
export { default as combatAuditJson } from './authored/combatAudit.json';
export { default as combatFoesJson } from './generated/combatFoes.json';
export { default as dangerZonesJson } from './authored/dangerZones.json';
export { default as fundingCoverageJson } from './authored/fundingCoverage.json';
export { default as fundingMethodsJson } from './authored/fundingMethods.json';
export { default as fundingWikiJson } from './generated/fundingWiki.json';
export { default as gearJson } from './generated/gear.json';
export { default as geTaxExemptJson } from './authored/geTaxExempt.json';
export { default as iconAssetsJson } from './authored/iconAssets.json';
export { default as majorLocationsJson } from './generated/majorLocations.json';
export { default as npcLocationsJson } from './authored/npcLocations.json';
export { default as portalsJson } from './generated/portals.json';
export { default as processingJson } from './generated/processing.json';
export { default as questMachinesJson } from './generated/questMachines.json';
export { default as rangedGearJson } from './generated/rangedGear.json';
export { default as recipesJson } from './authored/recipes.json';
export { default as skillingJson } from './generated/skilling.json';
export { default as spellsJson } from './authored/spells.json';
export { default as styleGearJson } from './generated/styleGear.json';
export { default as toolProgressionJson } from './authored/toolProgression.json';
export { default as trainersJson } from './generated/trainers.json';
export { default as trainingMethodsJson } from './authored/trainingMethods.json';
export { default as transportJson } from './authored/transport.json';
export { default as transportNetJson } from './generated/transportNet.json';
export { default as weightsJson } from './generated/weights.json';
