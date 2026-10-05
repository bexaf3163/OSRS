// The progress file: reading with a broken file set aside and a copy of the last whole state.
// The write already goes through a temporary file (main.cjs), so corruption is unlikely; but if the file still does not
// parse, it must not be overwritten by the next write — the progress could have been edited by hand or moved from another PC.

const fs = require('node:fs');
const path = require('node:path');

const BROKEN_KEEP = 3;

function parses(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The progress file text or null if there is no file or it is broken. A broken file is not deleted: its copy
 * stays nearby as progress.broken-<time>.json (the last three are kept).
 */
function readProgress(dir, now = new Date(), name = 'progress.json') {
  const target = path.join(dir, name);
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
  if (parses(text)) return text;
  try {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
    const base = name.replace(/\.json$/, '');
    fs.writeFileSync(path.join(dir, `${base}.broken-${stamp}.json`), text);
    const old = fs.readdirSync(dir).filter((n) => n.startsWith(`${base}.broken-`) && n.endsWith('.json')).sort();
    for (const n of old.slice(0, Math.max(0, old.length - BROKEN_KEEP))) fs.rmSync(path.join(dir, n), { force: true });
  } catch {
    // The copy failed — the file stays in place until the next write.
  }
  return null;
}

/** A copy of the whole progress file before the first write of the session: progress.bak.json. A broken file does not become the copy. */
function backupProgress(dir, name = 'progress.json') {
  const target = path.join(dir, name);
  try {
    if (parses(fs.readFileSync(target, 'utf8'))) fs.copyFileSync(target, path.join(dir, name.replace(/\.json$/, '.bak.json')));
  } catch {
    // There is no file yet — there is nothing to copy.
  }
}

const DAY_KEEP = 14;
const stampOf = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * A scheduled copy: once a day every progress file (progress.json and progress-<profile>.json) is copied into
 * the chosen folder as osrs-put-<name>-YYYYMMDD.json. Today's copy is not overwritten; the last
 * fourteen per file are kept. A broken file is not copied. It returns the number of new copies or throws a folder error.
 */
function dailyBackup(dir, target, now = new Date()) {
  fs.mkdirSync(target, { recursive: true });
  const today = stampOf(now);
  let made = 0;
  for (const name of fs.readdirSync(dir).filter((n) => /^progress(-[a-z0-9]{1,12})?\.json$/.test(n))) {
    const base = name.replace(/\.json$/, '');
    const out = path.join(target, `osrs-put-${base}-${today}.json`);
    let text;
    try { text = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
    if (!parses(text)) continue;
    if (!fs.existsSync(out)) { fs.writeFileSync(out, text); made++; }
    const mine = fs.readdirSync(target).filter((n) => n.startsWith(`osrs-put-${base}-`) && n.length === `osrs-put-${base}-`.length + 13 && /^\d{8}\.json$/.test(n.slice(-13))).sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - DAY_KEEP))) fs.rmSync(path.join(target, old), { force: true });
  }
  return made;
}

module.exports = { readProgress, backupProgress, dailyBackup };
