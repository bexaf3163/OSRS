import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GuideData } from './guide-parser.ts';
import type { Route } from './validate.ts';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

export const GUIDE_PATH = `${root}osrs-guide.md`;
export const DATA_DIR = `${root}src/data`;

/** Файлы src/data, которые делает parse-guide из osrs-guide.md, — одинаково для записи и для сверки. */
export function dataFiles(d: GuideData): [string, string][] {
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  return [
    ['skills.json', d.skills],
    ['levels.json', d.levels],
    ['goals.json', d.goals],
    ['xp.json', d.xp],
    ['plugins.json', d.plugins],
    ['reference.json', d.reference],
  ].map(([name, value]) => [`${DATA_DIR}/${name}`, json(value)]);
}

/** Маршрут V2 — ведётся прямо в JSON. */
export function readRoute(): Route {
  const read = (name: string) => JSON.parse(readFileSync(`${DATA_DIR}/${name}`, 'utf8'));
  return { steps: read('steps.json'), stages: read('stages.json'), items: read('f2p-items.json') };
}
