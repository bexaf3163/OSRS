// One command for the coordinated version bump. Usage: npm run bump -- X.Y.Z ["One-line summary"]
// Writes package.json, package-lock.json (root entries only), BridgeServer.PLUGIN_VERSION and a release-notes stub; refuses to go backwards.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [,, version, summary = 'TODO: one-line summary of this release.'] = process.argv;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('usage: node bump.mjs X.Y.Z ["summary"]'); process.exit(2); }
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const cmp = (a, b) => a.split('.').map(Number).reduce((r, x, i) => r || x - b.split('.').map(Number)[i], 0);
if (cmp(version, pkg.version) <= 0) { console.error(`refusing: ${version} is not newer than ${pkg.version}`); process.exit(1); }
const old = pkg.version; pkg.version = version; writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')); lock.version = version; if (lock.packages?.['']) lock.packages[''].version = version; writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
const JAVA = 'runelite-bridge/src/main/java/com/osrspath/bridge/BridgeServer.java';
const j = readFileSync(JAVA, 'utf8'); const j2 = j.replace(/(static final String PLUGIN_VERSION = ")[^"]+(")/, `$1${version}$2`);
if (j2 === j) { console.error('PLUGIN_VERSION not found'); process.exit(1); } writeFileSync(JAVA, j2);
const notes = `release-notes/v${version}.md`; if (!existsSync(notes)) writeFileSync(notes, `# OSRS Path ${version}\n\n- ${summary}\n`);
console.log(`bumped ${old} -> ${version}: package.json, package-lock.json, ${JAVA}, ${notes}`);
