// npm run check-data — the checks of the V2 route and the static data (skills, goals, XP). No network.

import { readFileSync } from 'node:fs';
import { validate, type GuideData } from './validate.ts';
import { qa, qaLines } from './qa.ts';
import { DATA_DIR, readRoute } from './paths.ts';

const read = (name: string) => JSON.parse(readFileSync(`${DATA_DIR}/${name}.json`, 'utf8'));

let stored: GuideData;
let route;
try {
  stored = {
    skills: read('skills'), members: read('members-skills'), levels: read('levels'), goals: read('goals'), xp: read('xp'),
    plugins: read('plugins'), reference: read('reference'),
  };
  route = readRoute();
} catch (e) {
  console.error(`Cannot read src/data: ${(e as Error).message}`);
  process.exit(1);
}

const report = validate(stored, route);
console.log('Checking src/data');
console.log(report.lines.join('\n'));

const levelSkillIds = [...(read('levels') as { id: string }[]).map((l) => l.id), ...(read('members-skills') as { skills: { levelSkills: string[] }[] }).skills.flatMap((s) => s.levelSkills)];
const consistency = qaLines(qa({ steps: route.steps, gear: read('gear'), questStages: read('questStages'), training: read('trainingMethods'), places: read('majorLocations'), skillIds: levelSkillIds }));
console.log('\nData consistency');
console.log(consistency.lines.join('\n'));

if (report.errors || consistency.errors) process.exit(1);
