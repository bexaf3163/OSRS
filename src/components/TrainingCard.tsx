// «🎯 Чем качать»: способ прокачки навыка до цели — по уровню, режиму, предметам и стилю игры (спокойно / эффективно).
// Расчёт — lib/trainingRouter.ts; здесь только показ. Ничего не запускает и не покупает: стрелка — по кнопке игрока.

import { useMemo } from 'react';
import type { Step } from '../types';
import { levelById, skillById } from '../data';
import { rangeForLevel } from '../lib/ranges';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { usePlayerState } from '../playerStateContext';
import { setFeatures, useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { adviseTraining, formatHours, type MethodView, type TrainingAdvice } from '../lib/trainingRouter';
import { actionForm } from '../lib/pacing';
import { levelOf } from '../lib/playerState';
import { trainingNav } from '../lib/trainingNav';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { NavigateButton } from './NavigateButton';

/** Совет по навыку из общего состояния игрока; пересчёт — когда меняются уровни, предметы, режим или стиль. */
export function useTrainingAdvice(skill: string | null, target: number): TrainingAdvice | null {
  const { mode } = useStore();
  const { state } = usePlayerState();
  const { xp, xpRate } = useBridge();
  const features = useFeatures();
  const style = styleOf(features).style;
  const have = skill ? xp?.[skill] ?? null : null;
  const measured = skill ? xpRate(skill) : null;
  return useMemo(
    () => (skill ? adviseTraining({ skill, target, state, mode, style, xp: have, measuredXph: measured }) : null),
    [skill, target, state, mode, style, have, measured],
  );
}

/** Точка на карте для способа: только из словаря мест по ключу — без догадок по тексту. */
export function methodNav(v: MethodView): NavTargetPayload | null {
  return trainingNav(v.method);
}

const skillTitle = (id: string) => levelById.get(id)?.name ?? id;

function Alternative({ v }: { v: MethodView }) {
  const m = v.method;
  return (
    <li>
      <strong>{m.name}</strong>
      <span className="muted"> — {m.where}{m.xph ? `; ≈ ${m.xph[0] === m.xph[1] ? m.xph[0].toLocaleString('ru-RU') : `${m.xph[0].toLocaleString('ru-RU')}–${m.xph[1].toLocaleString('ru-RU')}`} опыта в час (по вики)` : ''}</span>
      {v.status === 'PREP' && <span className="muted"> · сначала: {v.missing.map((x) => x.label).join(', ')}</span>}
      {v.status === 'LOCKED' && <span className="muted"> · закрыто: {v.missing.map((x) => x.label).join(', ')}</span>}
    </li>
  );
}

/** Способов в списке нет (Hunter, Construction, Slayer…) — строка плана прокачки из гайда для этого уровня. */
function GuideRow({ skill, level, fallback }: { skill: string; level: number; fallback: string }) {
  const guide = skillById.get(levelById.get(skill)?.skill ?? '');
  const hit = guide ? rangeForLevel(guide.plan.ranges, level) : null;
  if (!guide || !hit) return <p className="small muted">{fallback}</p>;
  const r = hit.range;
  return (
    <>
      <p className="training-now"><strong>{r.what}</strong>{r.where && <span className="muted"> — {r.where}</span>}</p>
      <p className="small muted">По плану прокачки гайда ({r.code}, уровни {r.levels}){r.notes ? `: ${r.notes}` : ''}. <a href={`#/skills/${guide.id}`}>Весь план</a></p>
    </>
  );
}

export function TrainingCard({ skill, target }: { skill: string; target: number }) {
  const advice = useTrainingAdvice(skill, target);
  const features = useFeatures();
  const profile = styleOf(features);
  if (!advice || advice.level === null || advice.level >= target) return null;
  const { best } = advice;
  const nav = best ? methodNav(best) : null;
  const legEnd = best ? Math.min(target, best.method.to ?? target) : target;
  const count = advice.actionsLeft;
  const showOthers = advice.others.length > 0;
  return (
    <section className="training" aria-label="Чем качать">
      <p className="readiness-head">
        🎯 <strong>Чем качать: {skillTitle(skill)}</strong> <span className="muted">— сейчас {advice.level}, цель {target}</span>
      </p>
      {best ? (
        <>
          <p className="training-now"><strong>{best.method.name}</strong><span className="muted"> — {best.method.where}</span></p>
          <p className="small muted">{advice.reason}</p>
          {count !== null && best.method.act && (
            <p className="small">Ещё ≈ {count.toLocaleString('ru-RU')} {actionForm(best.method.act, count)}{legEnd < target ? ` до ${legEnd} уровня` : ` до ${target} уровня`}.</p>
          )}
          {profile.showTime && advice.time && (
            <p className="small">⏱ {formatHours(advice.time)} до {target}{advice.time.source === 'wiki' ? ' (по скорости из вики — ориентир)' : ' (по твоему темпу)'}.</p>
          )}
          {best.status === 'PREP' && (
            <p className="small">Сначала: <strong>{best.missing.map((x) => x.label).join(', ')}</strong> <a href="#/shopping">В закупки</a></p>
          )}
          {best.unchecked.length > 0 && <p className="small muted">Не проверено: {best.unchecked.map((x) => x.label).join(', ')} — открой банк в игре.</p>}
          {best.method.note && <p className="small muted">{best.method.note}</p>}
          <div className="actions">
            {nav && <NavigateButton target={nav} label={`🧭 К месту: ${nav.label}`} />}
            <a className="btn btn-ghost btn-sm" href={best.method.url} target="_blank" rel="noopener noreferrer">Вики ↗</a>
          </div>
        </>
      ) : (
        <GuideRow skill={skill} level={advice.level} fallback={advice.reason} />
      )}
      {advice.path.length > 1 && (
        <p className="small muted">Путь: {advice.path.map((l) => `${l.fromLevel}–${l.toLevel} ${l.method.name}`).join(' → ')}</p>
      )}
      {advice.quests.length > 0 && (
        <p className="small muted">📜 Часть уровней закрывают квесты: {advice.quests.map((q) => q.name).join('; ')}.</p>
      )}
      {showOthers && (
        <details className="small" open={profile.alternatives > 0}>
          <summary className="muted">Другие способы: {advice.others.length}</summary>
          <ul>{advice.others.slice(0, profile.alternatives || 3).map((v) => <Alternative key={v.method.id} v={v} />)}</ul>
        </details>
      )}
      <p className="small muted">
        Стиль: {profile.label} ·{' '}
        <button type="button" className="link-btn" onClick={() => setFeatures({ efficient: !features.efficient })}>
          {features.efficient ? 'сделать спокойнее' : 'показать самые быстрые'}
        </button>
      </p>
    </section>
  );
}

/** Для шага-прокачки: берёт отстающий навык цели шага и показывает «чем качать». Остальные шаги — ничего. */
export function StepTraining({ step }: { step: Step }) {
  const { state } = usePlayerState();
  const trig = step.inGame?.completionTrigger;
  const pick = useMemo(() => {
    if (trig?.type !== 'SKILL_LEVEL' || !trig.levels?.length || trig.items?.length) return null;
    // Сколько не хватает до цели — у отстающего навыка; уровень неизвестен — берём первый.
    const rows = trig.levels.map((l) => ({ skill: l.skill, target: l.level, lv: levelOf(state, l.skill) }));
    const open = rows.filter((r) => r.lv === undefined || r.lv < r.target);
    if (!open.length) return null;
    return open.sort((a, b) => (a.lv ?? 0) - a.target - ((b.lv ?? 0) - b.target))[0];
  }, [trig, state]);
  if (!pick) return null;
  return <TrainingCard skill={pick.skill} target={pick.target} />;
}
