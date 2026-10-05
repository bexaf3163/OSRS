// Analysis of the plugin debug journal: `npm run telemetry` reads the latest session from ~/.runelite/osrs-path-telemetry
// (or the file/folder passed as an argument) and prints the findings: engine oddities, where the cursor stood long, what the player
// closed by hand, which screenshots were taken. `--json` — the same report for a script. It writes nothing and goes nowhere.
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
  console.error(`No journals in ${dir}. Turn on the "Debug log" setting of the OSRS Path plugin and play — the file will appear by itself.`);
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
