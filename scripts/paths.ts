import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Route } from './validate.ts';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

export const DATA_DIR = `${root}src/data`;

/** Маршрут V2 — ведётся прямо в JSON. */
export function readRoute(): Route {
  const read = (name: string) => JSON.parse(readFileSync(`${DATA_DIR}/${name}`, 'utf8'));
  return {
    steps: read('steps.json'), stages: read('stages.json'), items: read('f2p-items.json'), monsters: read('monsters.json'),
    npcs: read('npcLocations.json').npcs, places: read('majorLocations.json').locations,
  };
}
