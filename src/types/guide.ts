// The guide content: skills, goals, experience, plugins, reference and quests.
import type { Block } from './route';

export interface SkillSection {
  title: string;
  blocks: Block[];
}

export interface Skill {
  id: string;
  /** The whole section heading. */
  title: string;
  name: string;
  nameEn?: string;
  subtitle?: string;
  /** The game skills with levels that the section describes (melee has three). */
  levelSkills: string[];
  intro: Block[];
  sections: SkillSection[];
  wiki?: string;
  /** A members skill (the "Members skills" section of the guide). */
  membersOnly?: true;
}

/** The "Members skills" section of the guide: src/data/members-skills.json. */
export interface MembersSkillsData {
  title: string;
  skills: Skill[];
}

/** A skill with its own level. */
export interface LevelSkill {
  id: string;
  name: string;
  skill: string;
}

export interface XpData {
  title: string;
  points: { level: number; xp: number }[];
  note: Block[];
}

export interface Plugin {
  name: string;
  source: 'builtin' | 'hub';
  sourceLabel: string;
  why: string;
}

export interface PluginGroup {
  title: string;
  plugins: Plugin[];
  notes: Block[];
}

export interface PluginsData {
  title: string;
  intro: Block[];
  groups: PluginGroup[];
}

export interface RefSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface ReferenceData {
  title: string;
  description: string;
  sections: RefSection[];
  graph: { edges: { from: string; to: string }[] };
}

export interface Quest {
  /** The code of the step that closes the quest. */
  stepId: string;
  title: string;
  stage: number;
  qp: number;
  /** The quest's part steps (for Dragon Slayer I, the whole of stage 5). */
  parts: string[];
  membersOnly?: boolean;
}
