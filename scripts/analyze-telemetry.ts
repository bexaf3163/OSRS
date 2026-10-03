// Разбор журнала отладки плагина: `npm run telemetry` читает самый свежий сеанс из ~/.runelite/osrs-path-telemetry
// (или файл/папку, переданные аргументом) и печатает находки: странности движка, где курсор стоял долго, что игрок
// закрывал вручную, какие скриншоты сделаны. `--json` — тот же отчёт для скрипта. Ничего не пишет и никуда не ходит.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyze, formatReport, parseLog } from '../src/lib/telemetryReport.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const all = args.includes('--all');
const target = args.find((a) => !a.startsWith('--'));

const dir = target && existsSync(target) && statSync(target).isDirectory() ? resolve(target) : join(homedir(), '.runelite', 'osrs-path-telemetry');

function sessions(d: string): string[] {
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((n) => n.startsWith('session-') && n.endsWith('.jsonl')).sort().map((n) => join(d, n));
}

let files: string[];
if (target && existsSync(target) && statSync(target).isFile()) files = [resolve(target)];
else {
  const list = sessions(dir);
  files = all ? list : list.slice(-1);
}

if (files.length === 0) {
  console.error(`Журналов нет в ${dir}. Включи настройку «Журнал для отладки» у плагина OSRS Путь и поиграй — файл появится сам.`);
  process.exit(2);
}

let worst = 0;
for (const file of files) {
  const { events, bad } = parseLog(readFileSync(file, 'utf8'));
  const report = analyze(events, bad);
  if (json) console.log(JSON.stringify({ file, ...report }, null, 2));
  else {
    console.log(`=== ${file}`);
    console.log(formatReport(report));
    console.log('');
  }
  if (report.findings.some((f) => f.severity === 'bad')) worst = 1;
}
process.exit(worst);
