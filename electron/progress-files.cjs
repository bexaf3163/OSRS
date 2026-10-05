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
/** What is copied: every profile's progress file and the profile list (profiles.json). */
const COPIED = /^(progress(-[a-z0-9]{1,12})?|profiles)\.json$/;
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
  for (const name of fs.readdirSync(dir).filter((n) => COPIED.test(n))) {
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

const updatedAtOf = (text) => {
  try {
    const t = Date.parse(String(JSON.parse(text).updatedAt));
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
};

/**
 * The freshest state next to the dated copies: osrs-put-<name>-latest.json is overwritten whenever the source changes,
 * so a deletion in the middle of the day loses minutes, not a day. A broken file is not copied, and a source that is
 * OLDER than the copy (a fresh or stale data folder somewhere else) never replaces it.
 */
function latestCopy(dir, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(dir).filter((n) => COPIED.test(n))) {
    let text;
    try { text = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
    if (!parses(text)) continue;
    const out = path.join(target, `osrs-put-${name.replace(/\.json$/, '')}-latest.json`);
    let old = null;
    try { old = fs.readFileSync(out, 'utf8'); } catch { /* no copy yet */ }
    if (old === text) continue;
    const mine = updatedAtOf(text);
    const theirs = old === null ? null : updatedAtOf(old);
    if (mine !== null && theirs !== null && mine < theirs) continue;
    fs.writeFileSync(out, text);
  }
}

/** Lexicographic "a is newer than b" for the [updatedAt, date, rank] keys. */
const newer = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

const COPY_NAME = /^osrs-put-(progress(?:-[a-z0-9]{1,12})?|profiles)-(\d{8}|latest)\.json$/;

/**
 * A new data folder with no files (the app was deleted and installed again): every missing file is brought back from the
 * freshest valid copy in the copies folder — the one with the latest updatedAt, a dated copy wins over "latest" only if newer.
 * An existing file is never touched, except with replaceOlder (a data folder that was just created, maybe filled with an
 * older state from an earlier install): then a copy with a strictly newer updatedAt replaces it. It returns the names restored.
 */
function restoreFromCopies(dir, source, replaceOlder = false) {
  let names;
  try { names = fs.readdirSync(source); } catch { return []; }
  const best = new Map();
  for (const n of names) {
    const m = COPY_NAME.exec(n);
    if (!m) continue;
    let text;
    try { text = fs.readFileSync(path.join(source, n), 'utf8'); JSON.parse(text); } catch { continue; }
    const at = updatedAtOf(text) ?? -1;
    const rank = m[2] === 'latest' ? 1 : 0;
    const key = [at, m[2] === 'latest' ? 99999999 : Number(m[2]), rank];
    const cur = best.get(m[1]);
    if (!cur || newer(key, cur.key)) best.set(m[1], { key, text });
  }
  const done = [];
  for (const [base, { text }] of best) {
    const target = path.join(dir, `${base}.json`);
    if (fs.existsSync(target)) {
      if (!replaceOlder) continue;
      let have = null;
      try { have = updatedAtOf(fs.readFileSync(target, 'utf8')); } catch { /* unreadable: replace it */ }
      const fresh = updatedAtOf(text);
      if (have !== null && (fresh === null || fresh <= have)) continue;
    }
    try { fs.writeFileSync(target, text); done.push(`${base}.json`); } catch { /* the folder is not writable */ }
  }
  return done;
}

module.exports = { readProgress, backupProgress, dailyBackup, latestCopy, restoreFromCopies };
