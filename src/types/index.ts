// Типы данных приложения. Маршрут V2 — src/data/steps.json и stages.json;
// навыки, цели и справка — из osrs-guide.md (scripts/parse-guide.ts).

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

/** Подписанная строка шага: «Зачем: …», «Опасно: …», «Бой: …». */
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

export type GameMode = 'f2p' | 'members';

/** Предмет, который нужно взять или стоит взять на шаг. */
export interface StepItemRequirement {
  nameEn: string;
  nameRu: string;
  /** 1 или «23 (20 сдать, 3 в банк)». */
  amount: string | number;
  /** Где именно взять предмет; пусто, если маршрут не уточняет. */
  howToGet: string;
  iconUrl?: string;
  /** ID предмета на OSRS Wiki и в API цен. */
  wikiItemId?: number;
  /** Сколько очков здоровья восстанавливает — у еды. */
  heals?: number;
}

/** Точка на карте мира в игровых координатах (как в RuneLite и на карте OSRS Wiki). */
export interface MapLocation {
  x: number;
  y: number;
  /** 0 — Ground floor (земля), 1 — 1st floor, 2 — 2nd floor, 3 — 3rd floor. */
  plane: number;
  label: string;
  /** Масштаб карты вики: от −3 (весь мир) до 3 (клетки крупно). По умолчанию 2. */
  zoom?: number;
  /** Как найти место на месте: ориентиры, чего избегать. Показывается под переключателем точек. */
  note?: string;
}

/** Что показать в игре через плагин RuneLite «OSRS Path Bridge». */
export interface InGameTarget {
  worldPoint?: { x: number; y: number; plane: number; label?: string };
  groundTiles?: { x: number; y: number; plane: number; label: string; color?: string }[];
  npcNames?: string[];
  npcIds?: number[];
  objectNames?: string[];
  objectIds?: number[];
  /** Точный текст вариантов в диалоге, которые нужно выбрать. */
  dialogChoices?: string[];
  /** Названия предметов (как в игре, по-английски) — подсветка в инвентаре и банке. */
  highlightItems?: string[];
  /** Только проверенные условия: название квеста из игры, точный текст сообщения или varbit со значением. */
  completionTrigger?: {
    type: 'QUEST_COMPLETED' | 'CHAT_MESSAGE' | 'VARBIT_CHANGED';
    questName?: string;
    chatPattern?: string;
    varbitId?: number;
    targetValue?: number;
  };
}

/** NPC или точка старта шага. */
export interface StepNpcInfo {
  nameEn: string;
  nameRu: string;
  location: string;
  /** Этаж по британскому счёту с пояснением: «1st floor (2-й этаж)». */
  floor: string;
  dialogue?: string;
  wikiUrl?: string;
}

export interface Step {
  id: string;
  stage: number;
  type: StepType;
  title: string;
  titleRu?: string;
  qp?: number;
  minQp?: number;
  requires: string[];
  optional?: boolean;

  wikiUrl?: string;
  quickGuideUrl?: string;
  mapUrl?: string;

  npc?: StepNpcInfo;
  /** Этаж места, если у шага нет NPC (например, банк на верхушке замка). */
  floor?: string;
  itemsRequired?: StepItemRequirement[];
  itemsRecommended?: StepItemRequirement[];
  quickSteps?: string[];
  safespot?: string;
  imageUrl?: string;
  imageCaption?: string;
  proTip?: string;

  /** Где начинается шаг: превью карты в карточке и карта мира. */
  mapLocation?: MapLocation;
  /** Несколько равноценных мест (рыбалка, руда): переключаются на карте. */
  resourceSpots?: MapLocation[];
  /** Готовая картинка вместо превью из тайлов карты. */
  mapPreviewImage?: string;
  /** Главное предупреждение шага — жёлтая плашка над прохождением. */
  warning?: string;
  /** Подсветка в игре и автоотметка через RuneLite. */
  inGame?: InGameTarget;

  where?: string;
  bring?: string;
  how?: string;
  tips?: string[];
  reward?: string;
  doneWhen: string;
  /** Прочие подписанные строки: «Зачем», «Важно», «Опасно», «Бой», «Требования». */
  fields?: Field[];
  targets?: Target[];

  updatedInV2?: boolean;
  v2ChangesSummary?: string;
  membersOnly?: boolean;
  membersAlternative?: string;
}

export interface Stage {
  id: number;
  title: string;
  membersOnly?: boolean;
}

/** Досье предмета для встроенного инспектора вики. */
export interface WikiItemDetail {
  id: number;
  nameEn: string;
  nameRu?: string;
  examine: string;
  members: boolean;
  iconUrl: string;
  value: number;
  highAlch?: number;
  lowAlch?: number;
  gePrice?: { buyPrice: number; sellPrice: number; updatedAt: string };
  buyLocations?: { shopName: string; location: string; owner?: string; price: number; stock: number | string; members?: boolean }[];
  freeSpawns?: string[];
  dropSources?: { monster: string; combatLevel: number | null; rate: string }[];
  wikiUrl: string;
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
  titleRu?: string;
  stage: number;
  qp: number;
  /** Шаги-части квеста (у Dragon Slayer I — весь этап 5). */
  parts: string[];
  membersOnly?: boolean;
}

export type StepStatus = 'done' | 'skipped';

export interface Progress {
  version: 3;
  steps: Record<string, StepStatus>;
  levels: Record<string, number>;
  notes: Record<string, string>;
  updatedAt: string;
  gameMode?: GameMode;
  /** Шаги с пометкой updatedInV2, которые пользователь уже проверил. */
  reviewedV2Steps?: string[];
  /** Шаги, возвращённые в активные после V2: их очки квестов уже получены в игре и не откатываются. */
  qpKept?: string[];
  /** Полная копия прогресса старого маршрута (V1) до переноса в V2 — чтобы ничего не потерять. */
  legacy?: { steps: Record<string, StepStatus>; notes: Record<string, string> };
}
