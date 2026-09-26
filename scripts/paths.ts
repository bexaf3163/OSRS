import { fileURLToPath } from 'node:url';
import type { GuideData } from './guide-parser.ts';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

export const GUIDE_PATH = `${root}osrs-guide.md`;
export const DATA_DIR = `${root}src/data`;

/** Файлы src/data и их содержимое — одинаково для записи и для сверки. */
export function dataFiles(d: GuideData): [string, string][] {
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  return [
    ['steps.json', d.steps],
    ['stages.json', d.stages],
    ['skills.json', d.skills],
    ['levels.json', d.levels],
    ['goals.json', d.goals],
    ['xp.json', d.xp],
    ['plugins.json', d.plugins],
    ['reference.json', d.reference],
    ['quests.json', d.quests],
  ].map(([name, value]) => [`${DATA_DIR}/${name}`, json(value)]);
}
