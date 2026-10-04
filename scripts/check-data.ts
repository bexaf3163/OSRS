// npm run check-data — проверки маршрута V2 и статических данных (навыки, цели, опыт). Без сети.

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
  console.error(`Не прочитать src/data: ${(e as Error).message}`);
  process.exit(1);
}

const report = validate(stored, route);
console.log('Проверка src/data');
console.log(report.lines.join('\n'));

const levelSkillIds = [...(read('levels') as { id: string }[]).map((l) => l.id), ...(read('members-skills') as { skills: { levelSkills: string[] }[] }).skills.flatMap((s) => s.levelSkills)];
const consistency = qaLines(qa({ steps: route.steps, gear: read('gear'), questStages: read('questStages'), training: read('trainingMethods'), places: read('majorLocations'), skillIds: levelSkillIds }));
console.log('\nСогласованность данных');
console.log(consistency.lines.join('\n'));

if (report.errors || consistency.errors) process.exit(1);
