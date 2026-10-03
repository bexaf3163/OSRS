// Разбор блока {{Recommended equipment}} вики для scripts/build-style-gear.ts — отдельно, чтобы проверять тестами без сети.

export interface StyleReq { skill: string; level: number }
export interface StyleOption {
  /** Названия предметов варианта: «A / B» — любой из них. */
  names: string[];
  /** Уровни, которые вики пишет рядом (<small>(40 Ranged, 40 Defence, Dragon Slayer I)</small>). */
  reqs: StyleReq[];
  /** Квесты рядом с требованиями. */
  quests: string[];
  /** Пометка вики рядом, если она не про уровень («Maple shortbow only»). */
  note?: string;
}
export type StyleSlots = Record<string, StyleOption[]>;

const SLOT = /^(head|neck|cape|body|legs|weapon|ammo|hands|feet|shield|ring)(\d+)$/;
const SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Magic', 'Prayer', 'Mining', 'Smithing', 'Crafting', 'Woodcutting'];

/** Текст блока по полям «| head1 = …» (значения до следующего «| поле =»). */
export function equipmentFields(wikitext: string): Record<string, string> {
  const start = wikitext.indexOf('{{Recommended equipment');
  if (start < 0) return {};
  const end = wikitext.indexOf('\n}}', start);
  const body = wikitext.slice(start, end < 0 ? undefined : end);
  const fields: Record<string, string> = {};
  for (const m of body.matchAll(/^\|\s*([a-z]+\d*)\s*=\s*(.*)$/gm)) fields[m[1]] = m[2];
  return fields;
}

/** Один вариант слота: предметы, требования, квесты. Ссылки-сноски (<ref>) отбрасываются. */
export function parseOption(raw: string): StyleOption | null {
  const text = raw.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
  const names = [...text.matchAll(/\{\{plink\|([^|}]+)/g)].map((m) => m[1].trim());
  if (!names.length) return null;
  const small = [...text.matchAll(/<small>([\s\S]*?)<\/small>/g)].map((m) => m[1]).join(' ');
  const reqs: StyleReq[] = [];
  const quests: string[] = [];
  // «40 Ranged, 40 Defence» — два требования; «30 Attack and Magic» — один уровень на два навыка.
  for (const m of small.matchAll(/(\d+)\s*\[\[(\w+)\]\]((?:\s*(?:,|and)\s*\[\[\w+\]\])*)/g)) {
    const skills = [m[2], ...[...m[3].matchAll(/\[\[(\w+)\]\]/g)].map((x) => x[1])];
    for (const sk of skills) if (SKILLS.includes(sk)) reqs.push({ skill: sk.toLowerCase(), level: parseInt(m[1], 10) });
  }
  for (const m of small.matchAll(/\[\[([^\]|]+)\]\]/g)) {
    if (!SKILLS.includes(m[1])) quests.push(m[1]);
  }
  const plain = small.replace(/\[\[[^\]]*\]\]/g, '').replace(/[()\d,\s]+/g, ' ').replace(/\band\b/g, ' ').trim();
  return { names, reqs, quests, ...(plain && !quests.length ? { note: small.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\s+/g, ' ').trim() } : {}) };
}

export function parseEquipment(wikitext: string): StyleSlots {
  const slots: StyleSlots = {};
  const fields = equipmentFields(wikitext);
  const keys = Object.keys(fields).filter((k) => SLOT.test(k)).sort((a, b) => Number(SLOT.exec(a)![2]) - Number(SLOT.exec(b)![2]));
  for (const k of keys) {
    const slot = SLOT.exec(k)![1];
    const opt = parseOption(fields[k]);
    if (opt) (slots[slot] ??= []).push(opt);
  }
  return slots;
}
