// Типы данных, которые scripts/parse-guide.ts переносит из osrs-guide.md в src/data.

export type StepType = 'quest' | 'skill' | 'gear' | 'prep';

/** Кусок разметки гайда. Текст внутри — строка с простой inline-разметкой (**жирный**, `код`, [ссылка](url)). */
export type Block =
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: ListItem[]; start?: number }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'code'; lang: string; text: string };

export interface ListItem {
  text: string;
  checked?: boolean;
  children?: Block[];
}

export type FieldKey = 'where' | 'bring' | 'how' | 'reward' | 'doneWhen';

/** Строка шага из гайда в исходном порядке: «Где: …», «Опасно: …», «Шёлк (Silk): …». */
export interface Field {
  label: string;
  text: string;
  key?: FieldKey;
}

/** Цель навыка из названия шага: «Рыбалка до 20» → { skill: 'fishing', level: 20 }. */
export interface Target {
  skill: string;
  level: number;
}

export interface Step {
  id: string;
  stage: number;
  type: StepType;
  title: string;
  /** Название из таблицы «Все шаги и зависимости». */
  shortTitle: string;
  where?: string;
  bring?: string;
  how?: string;
  reward?: string;
  doneWhen: string;
  /** Все строки шага в порядке гайда, включая «Совет», «Опасно», «Заодно» и прочие. */
  fields: Field[];
  requires: string[];
  minQp?: number;
  qp?: number;
  optional?: boolean;
  targets?: Target[];
}

export interface Stage {
  id: number;
  title: string;
  start: string;
  time?: string;
  qpAtEnd?: number;
  qpNote?: string;
  /** «Итог этапа»; у этапа 6 его нет. */
  summary?: string;
}

export interface StagesData {
  /** Вводные абзацы «Пошагового плана». */
  intro: Block[];
  stages: Stage[];
  /** Сколько этапов и шагов гайд заявляет в разделе «Коды». */
  declared: { stages: number; steps: number };
}

export interface SkillRange {
  code: string;
  from: number;
  to: number | null;
  /** Колонка «Уровни» как в гайде: «15–30», «60+». */
  levels: string;
  what: string;
  where?: string;
  amount?: string;
  notes?: string;
  /** Вся строка таблицы как в гайде. */
  cells: string[];
}

export interface SkillSection {
  title: string;
  blocks: Block[];
}

export interface Skill {
  id: string;
  /** Заголовок раздела целиком. */
  title: string;
  name: string;
  nameEn?: string;
  subtitle?: string;
  /** Игровые навыки с уровнями, которые описывает раздел (у ближнего боя их три). */
  levelSkills: string[];
  intro: Block[];
  sections: SkillSection[];
  plan: { head: string[]; ranges: SkillRange[]; sectionIndex: number };
  wiki?: string;
}

/** Навык с отдельным уровнем — строка таблицы «Цели по этапам». */
export interface LevelSkill {
  id: string;
  name: string;
  skill: string;
}

export interface GoalValue {
  raw: string;
  min: number;
  max?: number;
}

export interface GoalRow {
  /** id уровня навыка или 'qp' для строки «Очки квестов». */
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
  /** Код шага, который закрывает квест. */
  stepId: string;
  title: string;
  stage: number;
  qp: number;
  /** Шаги-части квеста (у Dragon Slayer I — весь этап 5). */
  parts: string[];
}

export interface QuestsData {
  base: { title: string; qp: number };
  quests: Quest[];
  declared: { count: number; qp: number };
}

export type StepStatus = 'done' | 'skipped';

export interface Progress {
  version: 1;
  steps: Record<string, StepStatus>;
  levels: Record<string, number>;
  notes: Record<string, string>;
  updatedAt: string;
}
