// "🎯 What to train with": a skill training method up to the goal — by level, mode, items and play style (calm / efficient).
// The calculation is lib/trainingRouter.ts; here only the display. It starts and buys nothing: the arrow is by the player's button.

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

/** Skill advice from the shared player state; recomputed when levels, items, mode or style change. */
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

/** A map point for a method: only from the place dictionary by key — without guessing from the text. */
export function methodNav(v: MethodView): NavTargetPayload | null {
  return trainingNav(v.method);
}

const skillTitle = (id: string) => levelById.get(id)?.name ?? id;

function Alternative({ v }: { v: MethodView }) {
  const m = v.method;
  return (
    <li>
      <strong>{m.name}</strong>
      <span className="muted"> — {m.where}{m.xph ? `; ≈ ${m.xph[0] === m.xph[1] ? m.xph[0].toLocaleString('en-US') : `${m.xph[0].toLocaleString('en-US')}–${m.xph[1].toLocaleString('en-US')}`} XP per hour (wiki)` : ''}</span>
      {v.status === 'PREP' && <span className="muted"> · first: {v.missing.map((x) => x.label).join(', ')}</span>}
      {v.status === 'LOCKED' && <span className="muted"> · locked: {v.missing.map((x) => x.label).join(', ')}</span>}
    </li>
  );
}

/** No methods in the list (Hunter, Construction, Slayer…) — the training plan row for this level. */
function GuideRow({ skill, level, fallback }: { skill: string; level: number; fallback: string }) {
  const guide = skillById.get(levelById.get(skill)?.skill ?? '');
  const hit = guide ? rangeForLevel(guide.plan.ranges, level) : null;
  if (!guide || !hit) return <p className="small muted">{fallback}</p>;
  const r = hit.range;
  return (
    <>
      <p className="training-now"><strong>{r.what}</strong>{r.where && <span className="muted"> — {r.where}</span>}</p>
      <p className="small muted">From the skill's training plan ({r.code}, levels {r.levels}){r.notes ? `: ${r.notes}` : ''}. <a href={`#/skills/${guide.id}`}>The whole plan</a></p>
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
    <section className="training" aria-label="What to train with">
      <p className="readiness-head">
        🎯 <strong>What to train with: {skillTitle(skill)}</strong> <span className="muted">— now {advice.level}, goal {target}</span>
      </p>
      {best ? (
        <>
          <p className="training-now"><strong>{best.method.name}</strong><span className="muted"> — {best.method.where}</span></p>
          <p className="small muted">{advice.reason}</p>
          {count !== null && best.method.act && (
            <p className="small">≈ {count.toLocaleString('en-US')} more {actionForm(best.method.act, count)}{legEnd < target ? ` to level ${legEnd}` : ` to level ${target}`}.</p>
          )}
          {profile.showTime && advice.time && (
            <p className="small">⏱ {formatHours(advice.time)} to {target}{advice.time.source === 'wiki' ? ' (by the wiki speed — a guide)' : ' (at your pace)'}.</p>
          )}
          {best.status === 'PREP' && (
            <p className="small">First: <strong>{best.missing.map((x) => x.label).join(', ')}</strong> <a href="#/shopping">To the shopping list</a></p>
          )}
          {best.unchecked.length > 0 && <p className="small muted">Not checked: {best.unchecked.map((x) => x.label).join(', ')} — open the bank in the game.</p>}
          {best.method.note && <p className="small muted">{best.method.note}</p>}
          <div className="actions">
            {nav && <NavigateButton target={nav} label={`🧭 To the place: ${nav.label}`} />}
            <a className="btn btn-ghost btn-sm" href={best.method.url} target="_blank" rel="noopener noreferrer">Wiki ↗</a>
          </div>
        </>
      ) : (
        <GuideRow skill={skill} level={advice.level} fallback={advice.reason} />
      )}
      {advice.path.length > 1 && (
        <p className="small muted">Path: {advice.path.map((l) => `${l.fromLevel}–${l.toLevel} ${l.method.name}`).join(' → ')}</p>
      )}
      {advice.quests.length > 0 && (
        <p className="small muted">📜 Some levels are covered by quests: {advice.quests.map((q) => q.name).join('; ')}.</p>
      )}
      {showOthers && (
        <details className="small" open={profile.alternatives > 0}>
          <summary className="muted">Other methods: {advice.others.length}</summary>
          <ul>{advice.others.slice(0, profile.alternatives || 3).map((v) => <Alternative key={v.method.id} v={v} />)}</ul>
        </details>
      )}
      <p className="small muted">
        Style: {profile.label} ·{' '}
        <button type="button" className="link-btn" onClick={() => setFeatures({ efficient: !features.efficient })}>
          {features.efficient ? 'make it calmer' : 'show the fastest'}
        </button>
      </p>
    </section>
  );
}

/** For a training step: takes the lagging skill of the step's goal and shows "what to train with". Other steps — nothing. */
export function StepTraining({ step }: { step: Step }) {
  const { state } = usePlayerState();
  const trig = step.inGame?.completionTrigger;
  const pick = useMemo(() => {
    if (trig?.type !== 'SKILL_LEVEL' || !trig.levels?.length || trig.items?.length) return null;
    // How much is left to the goal — for the lagging skill; the level is unknown — we take the first.
    const rows = trig.levels.map((l) => ({ skill: l.skill, target: l.level, lv: levelOf(state, l.skill) }));
    const open = rows.filter((r) => r.lv === undefined || r.lv < r.target);
    if (!open.length) return null;
    return open.sort((a, b) => (a.lv ?? 0) - a.target - ((b.lv ?? 0) - b.target))[0];
  }, [trig, state]);
  if (!pick) return null;
  return <TrainingCard skill={pick.skill} target={pick.target} />;
}
