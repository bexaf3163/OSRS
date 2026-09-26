// Одноразовый разбор osrs-guide.md → src/data/*.json.
// Запускать после каждого изменения гайда: npm run parse-guide
// В рантайме приложение markdown не читает.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseGuide } from './guide-parser.ts';
import { validate } from './validate.ts';
import { GUIDE_PATH, DATA_DIR, dataFiles } from './paths.ts';

const data = parseGuide(readFileSync(GUIDE_PATH, 'utf8'));
const report = validate(data);
console.log('Проверка перенесённых данных');
console.log(report.lines.join('\n'));

if (report.errors) {
  console.error('\nДанные не записаны: сначала исправь ошибки выше.');
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
for (const [path, content] of dataFiles(data)) writeFileSync(path, content);
console.log(`\nЗаписано в ${DATA_DIR}: ${dataFiles(data).map(([p]) => p.split('/').pop()).join(', ')}`);
