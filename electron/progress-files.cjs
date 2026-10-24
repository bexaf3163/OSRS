// The progress file: reading with a broken file set aside and a copy of the last whole state.
// The write already goes through a temporary file (main.cjs), so corruption is unlikely; but if the file still does not
// parse, it must not be overwritten by the next write — the progress could have been edited by hand or moved from another PC.

const fs = require('node:fs');
const path = require('node:path');
const { validSavedText } = require('./saved-data.mjs');

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
 * includeInvalid lets the renderer distinguish damage from an absent file and pause automatic saves; the original text is returned unchanged.
 * Read errors other than ENOENT are thrown; they never prove that a source is missing.
 */
function readProgress(dir, now = new Date(), name = 'progress.json', includeInvalid = false) {
  const target = path.join(dir, name);
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error; // An unreadable source is unknown, not permission to start saving over it.
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
  return includeInvalid ? text : null;
}

/** IPC cannot reliably propagate thrown synchronous handler errors. Keep failure distinct from a missing file. */
function readProgressResult(dir, now = new Date(), name = 'progress.json') {
  try { return { ok: true, text: readProgress(dir, now, name, true) }; }
  catch { return { ok: false, error: 'READ_FAILED' }; }
}

/**
 * A copy of the whole progress file before the first write of the session: progress.bak.json. A broken file does not become the copy, and a
 * damaged or unknown previous copy is kept for explicit recovery. Returns what happened ('copied', 'none' without a file yet, 'skipped' for a
 * source that is not a whole save, 'kept' for a previous copy that is not one); an I/O failure is thrown, so the caller can report it.
 */
function backupProgress(dir, name = 'progress.json') {
  const target = path.join(dir, name);
  const out = path.join(dir, name.replace(/\.json$/, '.bak.json'));
  let text;
  try { text = fs.readFileSync(target, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return 'none';
    throw error;
  }
  if (!validSavedText(name, text)) return 'skipped';
  let previous = null;
  try { previous = fs.readFileSync(out, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous !== null && !validSavedText(name, previous)) return 'kept';
  fs.copyFileSync(target, out);
  return 'copied';
}

const DAY_KEEP = 14;
/** What is copied: every profile's progress file and the profile list (profiles.json). */
const COPIED = /^(progress(-[a-z0-9]{1,12})?|profiles)\.json$/;
const stampOf = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// Finish copying readable profiles, but do not report a complete backup after an I/O failure.
function throwCopyErrors(errors) {
  if (!errors.length) return;
  const failure = new AggregateError(errors, 'Some progress files could not be copied');
  failure.code = 'COPY_INCOMPLETE';
  throw failure;
}

/**
 * A scheduled copy: once a day every progress file (progress.json and progress-<profile>.json) is copied into
 * the chosen folder as osrs-put-<name>-YYYYMMDD.json. Today's copy is not overwritten; the last
 * fourteen per file are kept. A broken file is not copied. It returns the number of new copies or throws a folder error.
 */
function dailyBackup(dir, target, now = new Date()) {
  fs.mkdirSync(target, { recursive: true });
  const today = stampOf(now);
  let made = 0;
  const errors = [];
  for (const name of fs.readdirSync(dir).filter((n) => COPIED.test(n))) {
    try {
      const base = name.replace(/\.json$/, '');
      const out = path.join(target, `osrs-put-${base}-${today}.json`);
      let text;
      try { text = fs.readFileSync(path.join(dir, name), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!validSavedText(name, text)) continue;
      if (!fs.existsSync(out)) { fs.writeFileSync(out, text); made++; }
      const mine = fs.readdirSync(target).filter((n) => n.startsWith(`osrs-put-${base}-`) && n.length === `osrs-put-${base}-`.length + 13 && /^\d{8}\.json$/.test(n.slice(-13))).sort();
      const supported = mine.filter(n => {
        try { return validSavedText(name, fs.readFileSync(path.join(target, n), 'utf8')); } catch { return false; }
      });
      for (const old of supported.slice(0, Math.max(0, supported.length - DAY_KEEP))) fs.rmSync(path.join(target, old), { force: true });
    } catch (error) { errors.push(error); }
  }
  throwCopyErrors(errors);
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
  const errors = [];
  for (const name of fs.readdirSync(dir).filter((n) => COPIED.test(n))) {
    try {
      let text;
      try { text = fs.readFileSync(path.join(dir, name), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!validSavedText(name, text)) continue;
      const out = path.join(target, `osrs-put-${name.replace(/\.json$/, '')}-latest.json`);
      let old = null;
      try { old = fs.readFileSync(out, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (old === text) continue;
      if (old !== null && !validSavedText(name, old)) continue;
      const mine = updatedAtOf(text);
      const theirs = old === null ? null : updatedAtOf(old);
      if (mine !== null && theirs !== null && mine < theirs) continue;
      fs.writeFileSync(out, text);
    } catch (error) { errors.push(error); }
  }
  throwCopyErrors(errors);
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
    try { text = fs.readFileSync(path.join(source, n), 'utf8'); } catch { continue; }
    if (!validSavedText(`${m[1]}.json`, text)) continue;
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
      try {
        const original = fs.readFileSync(target, 'utf8');
        if (!validSavedText(`${base}.json`, original)) continue;
        have = updatedAtOf(original);
      } catch { continue; } // An unreadable source must not be replaced automatically.
      const fresh = updatedAtOf(text);
      if (have !== null && (fresh === null || fresh <= have)) continue;
    }
    try { fs.writeFileSync(target, text); done.push(`${base}.json`); } catch { /* the folder is not writable */ }
  }
  return done;
}

module.exports = { readProgress, readProgressResult, backupProgress, dailyBackup, latestCopy, restoreFromCopies };
