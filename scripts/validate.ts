// Проверки данных из раздела «Главное правило про данные» и сверки, которые
// ловят ошибки разбора. Общие для parse-guide.ts и check-data.ts.

import type { GuideData } from './guide-parser.ts';
import { xpForLevel } from '../src/lib/xp.ts';

export const EXPECTED = { steps: 63, first: 'S1-01', last: 'S6-07', skills: 12, qp: 46 };

export interface Report {
  lines: string[];
  errors: number;
  warnings: number;
}

export function validate(d: GuideData): Report {
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  const ok = (msg: string) => lines.push(`  ✓ ${msg}`);
  const fail = (msg: string) => { errors++; lines.push(`  ✗ ${msg}`); };
  const warn = (msg: string) => { warnings++; lines.push(`  ! ${msg}`); };
  const check = (cond: boolean, good: string, bad: string) => (cond ? ok(good) : fail(bad));

  const ids = d.steps.map((s) => s.id);
  const idSet = new Set(ids);

  // --- Шаги ---
  lines.push('Шаги');
  check(
    ids.length === EXPECTED.steps && ids[0] === EXPECTED.first && ids[ids.length - 1] === EXPECTED.last,
    `Шагов ${ids.length}, коды от ${ids[0]} до ${ids[ids.length - 1]}`,
    `Ожидалось ${EXPECTED.steps} шагов ${EXPECTED.first}…${EXPECTED.last}, найдено ${ids.length}: ${ids[0]}…${ids[ids.length - 1]}`,
  );
  check(idSet.size === ids.length, 'Коды шагов не повторяются', 'Есть повторяющиеся коды шагов');
  const gaps: string[] = [];
  d.steps.forEach((s, i) => {
    const prev = d.steps[i - 1];
    const n = Number(s.id.slice(3));
    const expected = prev && prev.stage === s.stage ? Number(prev.id.slice(3)) + 1 : 1;
    if (n !== expected) gaps.push(s.id);
  });
  check(!gaps.length, 'Внутри каждого этапа номера идут подряд с 01', `Номера идут не подряд: ${gaps.join(', ')}`);
  check(
    d.stages.declared.steps === ids.length && d.stages.declared.stages === d.stages.stages.length,
    `Совпадает с разделом «Коды»: ${d.stages.declared.stages} этапов, ${d.stages.declared.steps} шага`,
    `Раздел «Коды» заявляет ${d.stages.declared.stages} этапов и ${d.stages.declared.steps} шагов, найдено ${d.stages.stages.length} и ${ids.length}`,
  );

  const noType = d.steps.filter((s) => !s.type || !s.title).map((s) => s.id);
  const noDone = d.steps.filter((s) => !s.doneWhen).map((s) => s.id);
  const noWhere = d.steps.filter((s) => !s.where).map((s) => s.id);
  check(!noType.length, 'У каждого шага есть тип и название', `Без типа или названия: ${noType.join(', ')}`);
  check(!noDone.length, 'У каждого шага есть «Готово, когда»', `Без «Готово, когда»: ${noDone.join(', ')}`);
  if (noWhere.length) warn(`Без «Где» (в гайде у этих шагов его нет, ничего не дописано): ${noWhere.join(', ')}`);
  else ok('У каждого шага есть «Где»');

  // --- Зависимости ---
  lines.push('Зависимости');
  const withShort = d.steps.filter((s) => s.shortTitle).length;
  check(withShort === ids.length, 'Каждый шаг есть в таблице «Все шаги и зависимости»', `В таблице зависимостей нет ${ids.length - withShort} шагов`);
  const refs = d.steps.flatMap((s) => s.requires.map((r) => ({ from: s.id, to: r })));
  const broken = refs.filter((r) => !idSet.has(r.to));
  check(!broken.length, `Ссылок на шаги: ${refs.length}, все ведут на существующие коды`, `Ссылки на несуществующие шаги: ${broken.map((r) => `${r.from}→${r.to}`).join(', ')}`);
  const forward = refs.filter((r) => ids.indexOf(r.to) > ids.indexOf(r.from));
  if (forward.length) warn(`Зависимости вперёд по списку: ${forward.map((r) => `${r.from}→${r.to}`).join(', ')}`);
  else ok('Все зависимости указывают на шаги выше по списку — циклов нет');
  const minQp = d.steps.filter((s) => s.minQp !== undefined).map((s) => `${s.id} ≥ ${s.minQp}`);
  ok(`Условия по очкам квестов: ${minQp.join(', ')}`);

  // --- Навыки ---
  lines.push('Навыки');
  check(d.skills.length === EXPECTED.skills, `Навыков ${d.skills.length}: ${d.skills.map((s) => `${s.id}(${s.plan.ranges.length})`).join(' ')}`, `Ожидалось ${EXPECTED.skills} навыков, найдено ${d.skills.length}`);
  let planErrors = 0;
  for (const s of d.skills) {
    const bad = s.plan.ranges.filter((r, i) => r.code !== `${s.id}-${i + 1}` || (r.to !== null && r.to <= r.from));
    if (bad.length) { planErrors++; fail(`${s.id}: неправильные строки плана ${bad.map((r) => r.code).join(', ')}`); }
    const holes = s.plan.ranges.slice(1).filter((r, i) => s.plan.ranges[i].to !== r.from);
    if (holes.length) warn(`${s.id}: диапазоны не стыкуются перед ${holes.map((r) => r.code).join(', ')}`);
    if (s.plan.ranges[0]?.from !== 1) warn(`${s.id}: план начинается не с 1 уровня`);
  }
  if (!planErrors) ok('У каждого навыка план прокачки с кодами по порядку');
  const noWiki = d.skills.filter((s) => !s.wiki).map((s) => s.id);
  if (noWiki.length) warn(`Нет ссылки на вики: ${noWiki.join(', ')}`);

  const skillSteps = d.steps.filter((s) => s.type === 'skill');
  const noTargets = skillSteps.filter((s) => !s.targets?.length).map((s) => s.id);
  check(!noTargets.length, `У всех ${skillSteps.length} шагов-навыков распознаны цели по уровням`, `Не распознаны цели в названии: ${noTargets.join(', ')}`);
  const levelIds = new Set(d.levels.map((l) => l.id));
  const unknownTargets = d.steps.flatMap((s) => (s.targets ?? []).filter((t) => !levelIds.has(t.skill)).map((t) => `${s.id}:${t.skill}`));
  if (unknownTargets.length) fail(`Цели с неизвестным навыком: ${unknownTargets.join(', ')}`);

  // --- Очки квестов ---
  lines.push('Очки квестов');
  const stepQp = d.steps.reduce((sum, s) => sum + (s.qp ?? 0), 0);
  const total = stepQp + d.quests.base.qp;
  check(total === EXPECTED.qp && total === d.quests.declared.qp,
    `${stepQp} за шаги + ${d.quests.base.qp} за ${d.quests.base.title} = ${total}`,
    `Сумма очков ${total} (шаги ${stepQp} + ${d.quests.base.qp}), ожидалось ${EXPECTED.qp}, гайд заявляет ${d.quests.declared.qp}`);
  const qpNotQuest = d.steps.filter((s) => s.qp && s.type !== 'quest').map((s) => s.id);
  if (qpNotQuest.length) fail(`Очки у шагов не-квестов: ${qpNotQuest.join(', ')}`);
  const mismatch: string[] = [];
  for (const s of d.steps) {
    const m = s.reward?.match(/(\d+) очк\p{L}* квест/u);
    const inText = m ? Number(m[1]) : 0;
    if (inText !== (s.qp ?? 0)) mismatch.push(`${s.id} (таблица ${s.qp ?? 0}, в «Награде» ${inText})`);
  }
  check(!mismatch.length, 'Очки каждого шага совпадают с текстом «Награды»', `Не совпадают с «Наградой»: ${mismatch.join('; ')}`);
  const questCount = d.quests.quests.length + 1;
  check(questCount === d.quests.declared.count, `Квестов ${questCount} — как в гайде`, `Квестов ${questCount}, гайд заявляет ${d.quests.declared.count}`);

  const qpRow = d.goals.rows.find((r) => r.id === 'qp');
  let running = d.quests.base.qp;
  const qpByStage: string[] = [];
  for (const stage of d.stages.stages) {
    running += d.steps.filter((s) => s.stage === stage.id).reduce((sum, s) => sum + (s.qp ?? 0), 0);
    const goal = qpRow?.values[stage.id - 1]?.min;
    if (goal !== running) qpByStage.push(`этап ${stage.id}: цель ${goal}, по шагам ${running}`);
    if (stage.qpAtEnd !== undefined && stage.qpAtEnd !== running) qpByStage.push(`этап ${stage.id}: «в конце» ${stage.qpAtEnd}, по шагам ${running}`);
  }
  check(!qpByStage.length, 'Очки по этапам сходятся с «Целями» и «Очками квестов в конце»', `Очки по этапам не сходятся: ${qpByStage.join('; ')}`);

  // --- Цели и опыт ---
  lines.push('Цели и опыт');
  const goalRows = d.goals.rows.filter((r) => r.id !== 'qp');
  const shortRows = d.goals.rows.filter((r) => r.values.length !== d.stages.stages.length).map((r) => r.label);
  check(goalRows.length === d.levels.length && !shortRows.length,
    `«Цели по этапам»: ${goalRows.length} навыков × ${d.goals.stages.length} этапов`,
    `«Цели по этапам» неполные: ${shortRows.join(', ') || `${goalRows.length} строк из ${d.levels.length}`}`);
  const xpBad = d.xp.points.filter((p) => xpForLevel(p.level) !== p.xp).map((p) => `${p.level}: ${p.xp} ≠ ${xpForLevel(p.level)}`);
  check(!xpBad.length, `Формула опыта совпадает со всеми ${d.xp.points.length} строками таблицы гайда`, `Формула расходится с гайдом: ${xpBad.join('; ')}`);

  lines.push('');
  lines.push(`Итог: ошибок ${errors}, предупреждений ${warnings}`);
  return { lines, errors, warnings };
}
