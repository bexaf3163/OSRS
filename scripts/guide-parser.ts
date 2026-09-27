// Разбор osrs-guide.md: навыки (бесплатные и подписки), цели по этапам, опыт, плагины и справка.
// Маршрут (шаги и этапы) с V2 живёт отдельно — src/data/steps.json и stages.json.
// Чистые функции без файлов: их вызывают parse-guide.ts (пишет JSON) и check-data.ts (сверяет JSON с гайдом).
//
// Правило: ничего не дописывать от себя. Всё, что не берётся из гайда напрямую,
// собрано в константах ниже и подписано, откуда оно.

import type {
  Block, GoalsData, GoalValue, LevelSkill, ListItem, MembersSkillsData, PluginsData, ReferenceData, RefSection, Skill, SkillRange,
  XpData,
} from '../src/types/index.ts';

// ---------------------------------------------------------------------------
// Данные не из гайда

/** Строки таблицы «Цели по этапам» → id уровня и код раздела навыка. Коды — из раздела «Коды». */
const LEVEL_SKILLS: { id: string; row: string; skill: string }[] = [
  { id: 'attack', row: 'Атака', skill: 'ME' },
  { id: 'strength', row: 'Сила', skill: 'ME' },
  { id: 'defence', row: 'Защита', skill: 'ME' },
  { id: 'ranged', row: 'Дальний бой', skill: 'RA' },
  { id: 'magic', row: 'Магия', skill: 'MA' },
  { id: 'prayer', row: 'Молитва', skill: 'PR' },
  { id: 'woodcutting', row: 'Рубка', skill: 'WC' },
  { id: 'firemaking', row: 'Костры', skill: 'FM' },
  { id: 'fishing', row: 'Рыбалка', skill: 'FI' },
  { id: 'cooking', row: 'Готовка', skill: 'CO' },
  { id: 'mining', row: 'Добыча руды', skill: 'MI' },
  { id: 'smithing', row: 'Кузнечное дело', skill: 'SM' },
  { id: 'crafting', row: 'Ремесло', skill: 'CR' },
  { id: 'runecraft', row: 'Создание рун', skill: 'RC' },
];
const QP_ROW = 'Очки квестов';

/**
 * Навыки подписки: код раздела → id уровня. Id — как у RuneLite (Skill.getName().toLowerCase()): по нему
 * приходят уровни из игры и хранится прогресс, поэтому менять нельзя. Коды — из раздела «Коды».
 */
const MEMBERS_LEVELS: Record<string, string> = {
  AG: 'agility', TH: 'thieving', SL: 'slayer', FA: 'farming', HE: 'herblore', HU: 'hunter', CN: 'construction', FL: 'fletching',
};
const MEMBERS_SECTION = 'Навыки подписки';

// ---------------------------------------------------------------------------
// Markdown → блоки

type Token = Block | { t: 'h'; level: number; text: string };

export interface MdSection {
  title: string;
  level: number;
  blocks: Block[];
  children: MdSection[];
}

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const RE_FENCE = /^```(\S*)\s*$/;

function isBlockStart(line: string): boolean {
  return RE_HEADING.test(line) || RE_FENCE.test(line) || line.startsWith('|') || RE_LIST.test(line);
}

function splitRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parseTable(rows: string[]): Block {
  if (rows.length < 2 || !/^\|?\s*:?-{3,}/.test(rows[1].trim())) {
    throw new Error(`Таблица без строки-разделителя: ${rows[0]}`);
  }
  return { t: 'table', head: splitRow(rows[0]), rows: rows.slice(2).map(splitRow) };
}

interface RawItem { indent: number; ordered: boolean; num: number; text: string }

function buildList(items: RawItem[], pos: number, indent: number): { block: Block; pos: number } {
  const first = items[pos];
  const list: ListItem[] = [];
  while (pos < items.length && items[pos].indent >= indent) {
    const it = items[pos];
    if (it.indent > indent) {
      const last = list[list.length - 1];
      const child = buildList(items, pos, it.indent);
      last.children = [...(last.children ?? []), child.block];
      pos = child.pos;
      continue;
    }
    const box = it.text.match(/^\[( |x|X)\]\s+(.*)$/);
    list.push(box ? { text: box[2], checked: box[1] !== ' ' } : { text: it.text });
    pos++;
  }
  const block: Block = first.ordered
    ? { t: 'ol', items: list, ...(first.num !== 1 ? { start: first.num } : {}) }
    : { t: 'ul', items: list };
  return { block, pos };
}

export function tokenize(text: string): Token[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Token[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(RE_FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: fence[1], text: body.join('\n') });
      continue;
    }

    const h = line.match(RE_HEADING);
    if (h) { out.push({ t: 'h', level: h[1].length, text: h[2].trim() }); i++; continue; }

    if (line.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      out.push(parseTable(rows));
      continue;
    }

    if (RE_LIST.test(line)) {
      const items: RawItem[] = [];
      while (i < lines.length) {
        const m = lines[i].match(RE_LIST);
        if (m) {
          items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), num: parseInt(m[2], 10) || 1, text: m[3].trim() });
          i++;
        } else if (lines[i].trim() && /^\s+/.test(lines[i])) {
          items[items.length - 1].text += ' ' + lines[i].trim();
          i++;
        } else break;
      }
      out.push(buildList(items, 0, items[0].indent).block);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++].trim());
    out.push({ t: 'p', text: para.join(' ') });
  }
  return out;
}

export function toTree(tokens: Token[]): MdSection {
  const root: MdSection = { title: '', level: 0, blocks: [], children: [] };
  const stack: MdSection[] = [root];
  for (const tok of tokens) {
    if (tok.t === 'h') {
      while (stack[stack.length - 1].level >= tok.level) stack.pop();
      const sec: MdSection = { title: tok.text, level: tok.level, blocks: [], children: [] };
      stack[stack.length - 1].children.push(sec);
      stack.push(sec);
    } else {
      stack[stack.length - 1].blocks.push(tok);
    }
  }
  return root;
}

function need(sec: MdSection, title: string | RegExp): MdSection {
  const found = sec.children.find((c) => (typeof title === 'string' ? c.title.startsWith(title) : title.test(c.title)));
  if (!found) throw new Error(`В гайде не найден раздел «${String(title)}» внутри «${sec.title}»`);
  return found;
}

function tables(blocks: Block[]): Extract<Block, { t: 'table' }>[] {
  return blocks.filter((b): b is Extract<Block, { t: 'table' }> => b.t === 'table');
}

function firstTable(sec: MdSection): Extract<Block, { t: 'table' }> {
  const t = tables(sec.blocks)[0];
  if (!t) throw new Error(`В разделе «${sec.title}» нет таблицы`);
  return t;
}

/** Все блоки раздела вместе с подразделами — для справочных страниц. */
function flatten(sec: MdSection): Block[] {
  return [...sec.blocks, ...sec.children.flatMap((c) => flatten(c))];
}

// ---------------------------------------------------------------------------
// Числа

export function parseNumber(s: string): number {
  const n = Number(s.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Не число: «${s}»`);
  return n;
}

// ---------------------------------------------------------------------------
// Навыки, цели, опыт

function parseRange(levels: string): { from: number; to: number | null } {
  const span = levels.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (span) return { from: Number(span[1]), to: Number(span[2]) };
  const open = levels.match(/^(\d+)\+$/);
  if (open) return { from: Number(open[1]), to: null };
  throw new Error(`Непонятный диапазон уровней «${levels}»`);
}

function column(head: string[], re: RegExp): number {
  return head.findIndex((h) => re.test(h));
}

/**
 * Раздел навыка: вступление, подразделы и таблица «План прокачки» с колонками «Код» и «Уровни».
 * Раздел без плана — не навык (null). Уровни навыка даёт levelSkills по коду из таблицы.
 */
function parseSkill(sec: MdSection, levelSkills: (id: string) => string[]): Skill | null {
  const planIndex = sec.children.findIndex((c) => c.title === 'План прокачки');
  if (planIndex < 0) return null;
  const table = firstTable(sec.children[planIndex]);
  if (table.head[0] !== 'Код' || table.head[1] !== 'Уровни') {
    throw new Error(`«${sec.title}»: план прокачки должен начинаться с колонок «Код» и «Уровни»`);
  }
  const whereCol = column(table.head, /^Где$/);
  const notesCol = column(table.head, /^Заметки$/);
  const amountCol = column(table.head, /^Сколько/);
  const ranges: SkillRange[] = table.rows.map((cells) => ({
    code: cells[0],
    ...parseRange(cells[1]),
    levels: cells[1],
    what: cells[2],
    ...(whereCol >= 0 && cells[whereCol] && cells[whereCol] !== '—' ? { where: cells[whereCol] } : {}),
    ...(amountCol >= 0 && cells[amountCol] && cells[amountCol] !== '—' ? { amount: cells[amountCol] } : {}),
    ...(notesCol >= 0 && cells[notesCol] && cells[notesCol] !== '—' ? { notes: cells[notesCol] } : {}),
    cells,
  }));
  const id = ranges[0].code.split('-')[0];

  const withEn = sec.title.match(/^(.+?)\s+\(([^)]+)\)$/);
  const withSub = sec.title.match(/^(.+?):\s+(.+)$/);
  const skill: Skill = {
    id,
    title: sec.title,
    name: withEn ? withEn[1] : withSub ? withSub[1] : sec.title,
    levelSkills: levelSkills(id),
    intro: sec.blocks,
    sections: sec.children.map((c) => ({ title: c.title, blocks: flatten(c) })),
    plan: { head: table.head, ranges, sectionIndex: planIndex },
  };
  if (withEn) skill.nameEn = withEn[2];
  else if (withSub) skill.subtitle = withSub[2];
  return skill;
}

/** Ссылки из раздела «Ссылки на вики»: [текст, адрес]. */
function wikiLinks(doc: MdSection): [string, string][] {
  const wiki = need(doc, 'Ссылки на вики');
  return flatten(wiki).flatMap((b) => (b.t === 'ul' ? b.items.map((i) => i.text) : []))
    .flatMap((t) => [...t.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)])
    .map(([, text, url]) => [text, url] as [string, string]);
}

function parseSkills(doc: MdSection): Skill[] {
  const skills: Skill[] = [];
  for (const sec of doc.children) {
    const skill = parseSkill(sec, (id) => LEVEL_SKILLS.filter((l) => l.skill === id).map((l) => l.id));
    if (!skill) continue;
    if (!skill.levelSkills.length) throw new Error(`Навык ${skill.id} не сопоставлен ни с одной строкой «Целей по этапам»`);
    skills.push(skill);
  }

  // Ссылки на вики: текст ссылки совпадает с названием строки в «Целях по этапам».
  for (const [text, url] of wikiLinks(doc)) {
    const ls = LEVEL_SKILLS.find((l) => l.row === text);
    const skill = ls && skills.find((s) => s.id === ls.skill);
    if (skill && !skill.wiki) skill.wiki = url;
  }
  return skills;
}

/**
 * «Навыки подписки (Members)»: раздел второго уровня, внутри — навыки третьего уровня с тем же устройством,
 * что у бесплатных (подразделы четвёртого уровня, «План прокачки»). Вступление раздела — для страницы «Навыки».
 */
function parseMembersSkills(doc: MdSection): MembersSkillsData {
  const sec = need(doc, MEMBERS_SECTION);
  const links = wikiLinks(doc);
  const skills = sec.children.map((child) => {
    const skill = parseSkill(child, (id) => (MEMBERS_LEVELS[id] ? [MEMBERS_LEVELS[id]] : []));
    if (!skill) throw new Error(`«${child.title}»: у навыка подписки нет «Плана прокачки»`);
    if (!skill.levelSkills.length) throw new Error(`Навык подписки ${skill.id} не сопоставлен с уровнем (MEMBERS_LEVELS)`);
    // Ссылка на вики: текст ссылки совпадает с названием навыка («Ловкость»).
    const link = links.find(([text]) => text === skill.name);
    return { ...skill, ...(link ? { wiki: link[1] } : {}), membersOnly: true as const };
  });
  return { title: sec.title, intro: sec.blocks, skills };
}

function parseGoal(raw: string): GoalValue {
  const span = raw.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (span) return { raw, min: Number(span[1]), max: Number(span[2]) };
  if (/^\d+$/.test(raw)) return { raw, min: Number(raw) };
  throw new Error(`Непонятная цель «${raw}»`);
}

function parseGoals(doc: MdSection): { goals: GoalsData; levels: LevelSkill[] } {
  const sec = need(need(doc, 'Пошаговый план'), 'Цели по этапам');
  const t = firstTable(sec);
  const paras = sec.blocks.filter((b): b is Extract<Block, { t: 'p' }> => b.t === 'p');
  const tableAt = sec.blocks.indexOf(t);
  const rows = t.rows.map(([label, ...cells]) => {
    let id: string;
    if (label === QP_ROW) id = 'qp';
    else {
      const ls = LEVEL_SKILLS.find((l) => l.row === label);
      if (!ls) throw new Error(`Неизвестная строка «${label}» в «Целях по этапам»`);
      id = ls.id;
    }
    return { id, label, values: cells.map(parseGoal) };
  });
  const goals: GoalsData = {
    intro: paras.filter((p) => sec.blocks.indexOf(p) < tableAt).map((p) => p.text).join(' '),
    stages: t.head.slice(1),
    rows,
  };
  const note = paras.filter((p) => sec.blocks.indexOf(p) > tableAt).map((p) => p.text).join(' ');
  if (note) goals.note = note;
  const levels = LEVEL_SKILLS.map((l) => ({ id: l.id, name: l.row, skill: l.skill }));
  return { goals, levels };
}

function parseXp(doc: MdSection): { xp: XpData; training: RefSection } {
  const sec = need(doc, 'Прокачка навыков');
  const xpSec = need(sec, 'Сколько опыта');
  const t = firstTable(xpSec);
  const points: { level: number; xp: number }[] = [];
  for (const row of t.rows) {
    for (let c = 0; c + 1 < row.length; c += 2) {
      if (row[c]) points.push({ level: parseNumber(row[c]), xp: parseNumber(row[c + 1]) });
    }
  }
  points.sort((a, b) => a.level - b.level);
  return {
    xp: { title: xpSec.title, points, note: xpSec.blocks.filter((b) => b.t !== 'table') },
    training: { id: 'training', title: sec.title, blocks: sec.blocks },
  };
}

// ---------------------------------------------------------------------------
// Справка, плагины, квесты

function parsePlugins(doc: MdSection): PluginsData {
  const sec = need(doc, 'Плагины RuneLite');
  return {
    title: sec.title,
    intro: sec.blocks,
    groups: sec.children.map((g) => ({
      title: g.title,
      plugins: firstTable(g).rows.map(([name, where, why]) => {
        let source: 'builtin' | 'hub';
        if (where === 'Hub') source = 'hub';
        else if (where.startsWith('Встроен')) source = 'builtin';
        else throw new Error(`Плагин ${name}: непонятно, где он («${where}»)`);
        return { name, source, sourceLabel: where, why };
      }),
      notes: g.blocks.filter((b) => b.t !== 'table'),
    })),
  };
}

function parseReference(doc: MdSection, training: RefSection): ReferenceData {
  const plan = need(doc, 'Пошаговый план');
  const graphSec = need(plan, 'Как навыки кормят');
  const code = graphSec.blocks.find((b) => b.t === 'code' && b.lang === 'mermaid');
  if (!code || code.t !== 'code') throw new Error('Не найдена схема mermaid в «Как навыки кормят друг друга»');
  const names = new Map<string, string>();
  const edges: { from: string; to: string }[] = [];
  for (const line of code.text.split('\n')) {
    const m = line.match(/^\s*(\w+)(?:\[([^\]]+)\])?\s*-->\s*(\w+)(?:\[([^\]]+)\])?\s*$/);
    if (!m) continue;
    if (m[2]) names.set(m[1], m[2]);
    if (m[4]) names.set(m[3], m[4]);
    edges.push({ from: m[1], to: m[3] });
  }
  const label = (id: string) => {
    const n = names.get(id);
    if (!n) throw new Error(`В схеме у узла ${id} нет подписи`);
    return n;
  };

  const section = (id: string, sec: MdSection): RefSection => ({ id, title: sec.title, blocks: flatten(sec) });
  const intro = doc.blocks.find((b) => b.t === 'p' && !/^\w{3} \d/.test(b.text) && !b.text.startsWith('**'));

  return {
    title: doc.title,
    description: intro && intro.t === 'p' ? intro.text : '',
    sections: [
      section('setup', need(doc, 'Вход и настройка')),
      section('membership', need(doc, 'Бесплатная версия или подписка')),
      { id: 'skill-graph', title: graphSec.title, blocks: graphSec.blocks.filter((b) => b.t !== 'code') },
      section('stuck', need(plan, 'Если не знаешь, что делать')),
      section('transport', need(doc, 'Телепорты, каноэ и лодки')),
      { id: 'plugins', title: need(doc, 'Плагины RuneLite').title, blocks: [] },
      section('tips', need(doc, 'Советы и безопасность')),
      section('wiki', need(doc, 'Ссылки на вики')),
    ],
    training,
    graph: { edges: edges.map((e) => ({ from: label(e.from), to: label(e.to) })) },
  };
}

// ---------------------------------------------------------------------------

export interface GuideData {
  skills: Skill[];
  /** Навыки подписки — src/data/members-skills.json. */
  members: MembersSkillsData;
  levels: LevelSkill[];
  goals: GoalsData;
  xp: XpData;
  plugins: PluginsData;
  reference: ReferenceData;
}

export function parseGuide(markdown: string): GuideData {
  const root = toTree(tokenize(markdown));
  const doc = root.children.find((c) => c.level === 1);
  if (!doc) throw new Error('В гайде нет заголовка первого уровня');
  const { goals, levels } = parseGoals(doc);
  const { xp, training } = parseXp(doc);
  return {
    skills: parseSkills(doc),
    members: parseMembersSkills(doc),
    levels,
    goals,
    xp,
    plugins: parsePlugins(doc),
    reference: parseReference(doc, training),
  };
}
