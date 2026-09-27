// npm run check-data — проверки маршрута V2 и данных из гайда, плюс сверка, что src/data совпадает
// со свежим разбором osrs-guide.md. Без сети.

import { readFileSync, existsSync } from 'node:fs';
import { parseGuide, type GuideData } from './guide-parser.ts';
import { validate } from './validate.ts';
import { GUIDE_PATH, DATA_DIR, dataFiles, readRoute } from './paths.ts';

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

let stale: string[] = [];
if (existsSync(GUIDE_PATH)) {
  const fresh = dataFiles(parseGuide(readFileSync(GUIDE_PATH, 'utf8')));
  stale = fresh.filter(([path, content]) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== content).map(([p]) => p.split('/').pop()!);
  console.log(stale.length
    ? `\n  ✗ src/data не совпадает с osrs-guide.md (${stale.join(', ')}). Запусти npm run parse-guide.`
    : '\n  ✓ Данные из гайда совпадают со свежим разбором osrs-guide.md');
} else {
  console.log('\n  ! osrs-guide.md не найден, сверка с гайдом пропущена');
}

if (report.errors || stale.length) process.exit(1);
