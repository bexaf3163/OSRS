// npm run check-data — проверки из «Главного правила про данные» над src/data
// и сверка, что src/data совпадает со свежим разбором osrs-guide.md.

import { readFileSync, existsSync } from 'node:fs';
import { parseGuide, type GuideData } from './guide-parser.ts';
import { validate } from './validate.ts';
import { GUIDE_PATH, DATA_DIR, dataFiles } from './paths.ts';

const read = (name: string) => JSON.parse(readFileSync(`${DATA_DIR}/${name}.json`, 'utf8'));

let stored: GuideData;
try {
  stored = {
    steps: read('steps'), stages: read('stages'), skills: read('skills'), levels: read('levels'),
    goals: read('goals'), xp: read('xp'), plugins: read('plugins'), reference: read('reference'), quests: read('quests'),
  };
} catch (e) {
  console.error(`Не прочитать src/data: ${(e as Error).message}\nЗапусти npm run parse-guide.`);
  process.exit(1);
}

const report = validate(stored);
console.log('Проверка src/data');
console.log(report.lines.join('\n'));

let stale: string[] = [];
if (existsSync(GUIDE_PATH)) {
  const fresh = dataFiles(parseGuide(readFileSync(GUIDE_PATH, 'utf8')));
  stale = fresh.filter(([path, content]) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== content).map(([p]) => p.split('/').pop()!);
  console.log(stale.length
    ? `\n  ✗ src/data не совпадает с osrs-guide.md (${stale.join(', ')}). Запусти npm run parse-guide.`
    : '\n  ✓ src/data совпадает со свежим разбором osrs-guide.md');
} else {
  console.log('\n  ! osrs-guide.md не найден, сверка с гайдом пропущена');
}

if (report.errors || stale.length) process.exit(1);
