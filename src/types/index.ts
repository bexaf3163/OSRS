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
  /** Добывается по ходу самого шага (выдаст NPC, подберёшь, купишь на месте): у банка не проверяется. */
  inStep?: boolean;
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

/** Точка в игре без подписи на карте: цель, путевая точка. */
export interface GamePoint {
  x: number;
  y: number;
  plane: number;
  label?: string;
}

/** Что показать в игре через плагин RuneLite «OSRS Path Bridge». */
export interface InGameTarget {
  worldPoint?: GamePoint;
  groundTiles?: { x: number; y: number; plane: number; label: string; color?: string }[];
  npcNames?: string[];
  npcIds?: number[];
  objectNames?: string[];
  objectIds?: number[];
  /** Точный текст вариантов в диалоге, которые нужно выбрать. */
  dialogChoices?: string[];
  /** Названия предметов (как в игре, по-английски) — подсветка в инвентаре и банке. */
  highlightItems?: string[];
  /** Текущая цель одной строкой для микро-HUD; без неё — подпись точки шага. */
  goal?: string;
  /**
   * Остановки по порядку: калитка → мост → лестница → NPC. В игре стрелка и HUD («Точка 2/5») ведут к текущей
   * остановке, а если установлен Shortest Path — он ведёт к ней настоящим путём.
   */
  pathWaypoints?: GamePoint[];
  /**
   * Только проверенные условия: квест из игры, настоящие уровни навыков, предметы у игрока, точный текст
   * сообщения или varbit со значением.
   */
  completionTrigger?: CompletionTrigger;
}

export interface CompletionTrigger {
  type: 'QUEST_COMPLETED' | 'SKILL_LEVEL' | 'ITEM_OWNED' | 'CHAT_MESSAGE' | 'VARBIT_CHANGED';
  /** QUEST_COMPLETED: название квеста, как его знает RuneLite (net.runelite.api.Quest). */
  questName?: string;
  /** SKILL_LEVEL: настоящие уровни (без зелий), все сразу. Совпадают с целями из названия шага. */
  levels?: Target[];
  /** ITEM_OWNED — сами предметы; у QUEST_COMPLETED и SKILL_LEVEL — ещё одно условие вдобавок. */
  items?: OwnedItem[];
  chatPattern?: string;
  varbitId?: number;
  targetValue?: number;
}

/**
 * Предмет для автоотметки: сколько его должно быть у игрока — в сумке, на нём, банкнотами и в банке вместе
 * (банк — если его открывали в этой сессии игры).
 */
export interface OwnedItem {
  /** Названия как в игре. Несколько — считаются вместе: «Shrimps» и «Anchovies», любые части Graceful. */
  names: string[];
  /** Только этот ID — когда у разных предметов одно название (куски карты Dragon Slayer I). */
  id?: number;
  count: number;
}

/** Навыки, у которых шаг считает темп: столько действий до цели и столько минут. */
export type PacingSkill = 'fishing' | 'woodcutting' | 'cooking' | 'mining' | 'attack' | 'strength' | 'defence';

/**
 * Темп прокачки шага. Плагин RuneLite считает по опыту из игры, сколько действий осталось
 * до targetExp и сколько это займёт; без замеров время не выдумывается.
 */
export interface StepPacing {
  skill: PacingSkill;
  /**
   * Ещё навыки с той же целью — только бой: сила и защита вслед за атакой. Их качают по очереди, меняя стиль
   * атаки; темп показывает тот, что сейчас растёт.
   */
  also?: PacingSkill[];
  targetLevel: number;
  /** Опыт на targetLevel по таблице опыта игры. */
  targetExp: number;
  /** Действие формами для 1, 2–4 и 5+: «креветка|креветки|креветок». Одна форма тоже годится. */
  actionName: string;
  /** Опыт за одно действие (улов, бревно, руда, приготовленная рыба; в бою — 4 × здоровье противника). */
  expPerAction: number;
  /** Секунд на действие — первая оценка до своих замеров. */
  secondsPerAction?: number;
}

/** Опасное место для радара в RuneLite (src/data/dangerZones.json). */
export interface DangerZone {
  id: string;
  name: string;
  center: { x: number; y: number; plane: number };
  radius: number;
  warningRadius?: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  /** Коротко для микро-HUD. */
  hud?: string;
  npcNames?: string[];
  /** Откуда данные: статья вики и её точки. */
  source?: string;
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

/** Уровни навыков по ключам RuneLite: { magic: 25, woodcutting: 12 }. */
export type PlayerStats = Record<string, number>;

export type BranchConditionType = 'SKILL_LEVEL' | 'QUEST_COMPLETED' | 'ITEM_OWNED';

/** Условие быстрого варианта. Проверяется по уровням из RuneLite (или введённым вручную), прогрессу и предметам. */
export interface BranchCondition {
  type: BranchConditionType;
  /** Ключ навыка RuneLite: magic, woodcutting, agility… */
  skill?: string;
  minLevel?: number;
  /** Название квеста как в игре — засчитан, если его шаг отмечен выполненным. */
  questName?: string;
  /** Предмет (как в игре, по-английски) — есть в сумке, надет или в банке. */
  itemName?: string;
}

/** Быстрый вариант шага для текущих статов: основной путь не заменяет, а дополняет. */
export interface StepBranch {
  id: string;
  /** Короткий заголовок: «Varrock Teleport». */
  label: string;
  condition: BranchCondition;
  /** Как сделать по-быстрому. */
  replacementText?: string;
  /** Куда ведёт быстрый вариант — эта точка уходит в игру, если выбрать его. */
  replacementTarget?: MapLocation;
  /** Экономия времени, только если она проверена. */
  timeSavingSeconds?: number;
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
  /** Быстрые варианты для статов игрока: телепорт, каноэ, срезка. */
  branches?: StepBranch[];
  /** Темп прокачки навыка шага (рыбалка, рубка, готовка, добыча). */
  pacing?: StepPacing;
  /**
   * С кем шаг дерётся в ближнем бою — названия статей вики (monsters.json). По ним разбор снаряжения
   * сравнивает оружие и показывает совет на шаге. Нет у шагов, где бьют особым оружием или магией.
   */
  foes?: string[];

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
  /** Цену узнать не удалось (нет связи, таймаут). Только во время работы, в данных не бывает. */
  priceUnavailable?: boolean;
  buyLocations?: { shopName: string; location: string; owner?: string; price: number; stock: number | string; members?: boolean }[];
  freeSpawns?: string[];
  dropSources?: { monster: string; combatLevel: number | null; rate: string }[];
  wikiUrl: string;
}

/** Слоты снаряжения, которые разбирает советник: оружие, шлем, торс, ноги, щит, амулет. */
export type GearSlot = 'weapon' | 'head' | 'body' | 'legs' | 'shield' | 'neck';

export interface GearStats { stab: number; slash: number; crush: number; magic: number; ranged: number }

/** Предмет снаряжения с OSRS Wiki (gear.json): бонусы, требование, магазины. */
/** Требования к надеванию. Уровень 1 не пишется — это не требование. */
export interface GearRequirements {
  attack?: number;
  strength?: number;
  defence?: number;
  ranged?: number;
  magic?: number;
  prayer?: number;
  /** Квесты, без которых предмет не надеть: Rune platebody — Dragon Slayer I. */
  quests?: string[];
}

export interface GearPiece {
  id: number;
  name: string;
  nameRu: string;
  slot: GearSlot;
  /** Вид: scimitar, sword, platebody, amulet… */
  kind: string;
  metal?: 'bronze' | 'iron' | 'steel' | 'black' | 'mithril' | 'adamant' | 'rune';
  twoHanded?: boolean;
  /** Что нужно, чтобы надеть: { attack: 5 }, у молотов { strength: 5 }, у Coif { ranged: 20 }, квесты. Нет — требований нет (если есть reqFrom). */
  req?: GearRequirements;
  /** Статья вики, где сказано о требованиях (или об их отсутствии). */
  reqFrom?: string;
  /** Вики о требованиях молчит: такой предмет не советуем, только узнаём на персонаже. */
  reqUnverified?: boolean;
  members: boolean;
  tradeable: boolean;
  attack: GearStats;
  defence: GearStats;
  strength: number;
  prayer?: number;
  /** Тиков между ударами (у оружия; тик — 0,6 с). */
  speed?: number;
  /** Магазины бесплатной версии: цена при полном запасе. */
  shops?: { shop: string; location: string; price: number; owner?: string }[];
  iconUrl: string;
}

export interface GearData {
  source: string;
  updated: string;
  items: GearPiece[];
}

/** Противник из карточки монстра на вики: с ним сравнивается оружие. Версия — самая низкоуровневая у статьи. */
export interface Foe {
  name: string;
  version?: string;
  combat: number;
  hitpoints: number;
  defenceLevel: number;
  defence: { stab: number; slash: number; crush: number };
  members: boolean;
}

export interface FoeData {
  source: string;
  updated: string;
  foes: Foe[];
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
  /** Навык подписки (раздел «Навыки подписки» гайда). */
  membersOnly?: true;
}

/** Раздел гайда «Навыки подписки (Members)» — src/data/members-skills.json. */
export interface MembersSkillsData {
  title: string;
  intro: Block[];
  skills: Skill[];
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
  /** Шаги, где игрок нажал «✕ Пропустить» у подсказки апгрейда снаряжения. */
  upgradeDismissedForSteps?: string[];
  /**
   * «У меня уже есть» в оптовой закупке: сколько предмета есть по словам игрока. Ключ — строка списка
   * (`id:1725` по ID предмета, `name:…` у предметов без ID). Данные из игры главнее, если они полные.
   */
  ownedManual?: Record<string, ManualOwned>;
}

export interface ManualOwned {
  count: number;
  /** Когда игрок указал количество (ISO). */
  updatedAt: string;
}
