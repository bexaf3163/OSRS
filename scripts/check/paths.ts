import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Route } from './validate.ts';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/');

export const DATA_DIR = `${root}src/data`;
const generated: Record<string, string> = JSON.parse(readFileSync(`${DATA_DIR}/manifest.json`, 'utf8')).generated;
/** A data file by name: generated when src/data/manifest.json lists it, otherwise written by hand. */
export const dataFile = (name: string) => `${DATA_DIR}/${name in generated ? 'generated' : 'authored'}/${name}`;

/** The V2 route — kept right in the JSON. */
export function readRoute(): Route {
  const read = (name: string) => JSON.parse(readFileSync(dataFile(name), 'utf8'));
  return {
    steps: read('steps.json'), stages: read('stages.json'), items: read('f2p-items.json'), combatFoes: read('combatFoes.json'),
    npcs: read('npcLocations.json').npcs, places: read('majorLocations.json').locations, trainers: read('trainers.json').trainers,
  };
}
