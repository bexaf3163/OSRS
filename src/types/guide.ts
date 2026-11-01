// The guide content: skills, goals, experience, plugins, reference and quests.
import type { Block } from './route';

export interface SkillRange {
  code: string;
  from: number;
  to: number | null;
  /** The "Levels" column as in the guide: "15–30", "60+". */
  levels: string;
  what: string;
  where?: string;
  amount?: string;
  notes?: string;
  /** The whole table row as in the guide. */
  cells: string[];
}

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
  plan: { head: string[]; ranges: SkillRange[]; sectionIndex: number };
  wiki?: string;
  /** A members skill (the "Members skills" section of the guide). */
  membersOnly?: true;
}

/** The "Members skills" section of the guide: src/data/members-skills.json. */
export interface MembersSkillsData {
  title: string;
  intro: Block[];
  skills: Skill[];
}

/** A skill with its own level: a row of the "Goals by stage" table. */
export interface LevelSkill {
  id: string;
  name: string;
  skill: string;
}

export interface GoalValue {
  raw: string;
  /** The level the route itself guarantees by the end of the stage (for an optional cell: the target of the optional step). */
  min: number;
  /** What the likely extras reach (Strength 25, iron ore, a Daero option). Never a requirement. */
  max?: number;
  /** "optional": the cell belongs to an optional branch (stage 6, the Bond): nobody is behind on it. */
  kind?: 'optional';
  /** The steps of the route that produce the rise to this value. */
  from?: string[];
}

export interface GoalRow {
  /** The skill's level id, or 'qp' for the "Quest points" row. */
  id: string;
  label: string;
  values: GoalValue[];
}

export interface GoalsData {
  intro: string;
  note?: string;
  stages: string[];
  rows: GoalRow[];
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
  training: RefSection;
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
