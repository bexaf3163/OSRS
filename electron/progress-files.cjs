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
function readProgress(dir, now = new Date()) {
  const target = path.join(dir, 'progress.json');
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
  if (parses(text)) return text;
  try {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
    fs.writeFileSync(path.join(dir, `progress.broken-${stamp}.json`), text);
    const old = fs.readdirSync(dir).filter((n) => /^progress\.broken-.*\.json$/.test(n)).sort();
    for (const n of old.slice(0, Math.max(0, old.length - BROKEN_KEEP))) fs.rmSync(path.join(dir, n), { force: true });
  } catch {
    // Копию не удалось — файл при этом остаётся на месте до следующей записи.
  }
  return null;
}

/** Копия целого файла прогресса перед первой записью сеанса: progress.bak.json. Битый файл копией не становится. */
function backupProgress(dir) {
  const target = path.join(dir, 'progress.json');
  try {
    if (parses(fs.readFileSync(target, 'utf8'))) fs.copyFileSync(target, path.join(dir, 'progress.bak.json'));
  } catch {
    // Файла ещё нет — копировать нечего.
  }
}

module.exports = { readProgress, backupProgress };
