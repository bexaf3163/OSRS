// Файл прогресса: чтение с откладыванием битого файла и копия последнего целого состояния.
// Запись и так идёт через временный файл (main.cjs), так что порча маловероятна; но если файл всё же не
// разбирается, его нельзя затирать следующей записью — прогресс могли править руками или переносить с другого ПК.

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
 * Текст файла прогресса или null, если файла нет или он битый. Битый файл не удаляется: его копия
 * остаётся рядом как progress.broken-<время>.json (хранятся три последних).
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
    // Копию не удалось — файл при этом остаётся на месте до следующей записи.
  }
  return null;
}

/** Копия целого файла прогресса перед первой записью сеанса: progress.bak.json. Битый файл копией не становится. */
function backupProgress(dir, name = 'progress.json') {
  const target = path.join(dir, name);
  try {
    if (parses(fs.readFileSync(target, 'utf8'))) fs.copyFileSync(target, path.join(dir, name.replace(/\.json$/, '.bak.json')));
  } catch {
    // Файла ещё нет — копировать нечего.
  }
}

const DAY_KEEP = 14;
const stampOf = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * Копия по расписанию: раз в сутки каждый файл прогресса (progress.json и progress-<профиль>.json) копируется в
 * выбранную папку как osrs-put-<имя>-ГГГГММДД.json. Сегодняшняя копия не перезаписывается; хранятся последние
 * четырнадцать на каждый файл. Битый файл не копируется. Возвращает число новых копий или бросает ошибку папки.
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
