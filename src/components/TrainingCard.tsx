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
import { priorityOf, styleOf } from '../lib/playStyle';
import { adviseTraining, formatHours, type MethodView, type TrainingAdvice } from '../lib/trainingRouter';
import { actionForm } from '../lib/pacing';
import { levelOf } from '../lib/playerState';
import { trainingNav } from '../lib/trainingNav';
import { goalArrows } from '../lib/rangedAmmo';
import { xpForLevel } from '../lib/xp';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { NavigateButton } from './NavigateButton';
import { usePriceView } from '../lib/funding/usePriceView';
import { useTradeRestriction } from '../lib/useTradeRestriction';

/** Skill advice from the shared player state; recomputed when levels, items, mode or style change. */
export function useTrainingAdvice(skill: string | null, target: number, followed: string | null = null): TrainingAdvice | null {
  const { mode } = useStore();
  const { state } = usePlayerState();
  const { xp, xpRate } = useBridge();
  const features = useFeatures();
  const style = styleOf(features).style;
  const priority = priorityOf(features);
  const have = skill ? xp?.[skill] ?? null : null;
  const measured = skill ? xpRate(skill) : null;
  // The exchange and the trade restriction: what a combat method's arrows, runes and drops are worth, as on the route's steps.
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  return useMemo(
    () => (skill ? adviseTraining({ skill, target, state, mode, style, priority, xp: have, measuredXph: measured, prices, restriction: trade.state, followed }) : null),
    [skill, target, state, mode, style, priority, have, measured, prices, trade.state, followed],
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
      {/* The same summary as the recommendation (adviseTraining's one formatter): rate, coins an hour, what to get first. */}
      <span className="muted"> — {m.where}{v.reason ? `; ${v.reason}` : ''}</span>
      {m.manualSetup && <span className="muted"> · manual setup: {m.manualSetup}</span>}
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

export function TrainingCard({ skill, target, followed = null }: { skill: string; target: number; followed?: string | null }) {
  const advice = useTrainingAdvice(skill, target, followed);
  const features = useFeatures();
  const profile = styleOf(features);
  const { state } = usePlayerState();
  const { xp } = useBridge();
  // T11: the arrows for the whole goal, leg by leg against each leg's opponent, with the bow and arrows the kit picks now.
  const arrows = useMemo(() => {
    if (skill !== 'ranged' || !advice?.best || advice.level === null) return null;
    const legs = advice.path.length ? advice.path : [{ method: advice.best.method, fromLevel: advice.level, toLevel: target }];
    // Without the live XP the count starts at the beginning of the level: a little more than needed, never less.
    return goalArrows(legs, state, xp?.ranged ?? xpForLevel(advice.level));
  }, [skill, advice, state, xp, target]);
  if (!advice) return null;
  if (advice.level === null) return <section className="training" aria-label="What to train with"><p className="small muted">Level not checked. Connect RuneLite or enter your level under “Levels and live experience”.</p></section>;
  if (advice.level >= target) return null;
  const { best } = advice;
  // The method the game follows (a tracked plan) leads the card with this player's figures; the pick, when it differs, is one line under it.
  const shown = advice.followed ?? best;
  const nav = shown ? methodNav(shown) : null;
  const legEnd = advice.actionTarget ?? target;
  const count = advice.actionsLeft;
  const showOthers = advice.others.length > 0;
  return (
    <section className="training" aria-label="What to train with">
      <p className="readiness-head">
        🎯 <strong>What to train with: {skillTitle(skill)}</strong> <span className="muted">— now {advice.level}, goal {target}</span>
      </p>
      <div className="skill-seg" role="group" aria-label="Training priority">
        {([['fastest', 'XP'], ['balanced', 'Balanced'], ['profit', 'Money']] as const).map(([priority, label]) => (
          <button key={priority} type="button" className={`skill-seg-btn ${priorityOf(features) === priority ? 'is-on' : ''}`}
            aria-pressed={priorityOf(features) === priority}
            onClick={() => setFeatures({ efficient: priority === 'fastest', profitTraining: priority === 'profit', relaxedTraining: false })}>
            {label}
          </button>
        ))}
      </div>
      {best ? (
        <>
          <div className="training-recommendation">
            <div className="training-method">
              <h3>{advice.followed ? 'Your plan (the game follows it)' : 'Recommended method'}</h3>
              <p className="training-now"><strong>{shown!.method.name}</strong></p><p className="small muted">{shown!.reason}</p>
            </div>
            <div className="training-location"><h3>Location</h3><p>{shown!.method.where}</p>{nav && <NavigateButton target={nav} label={`To the place: ${nav.label}`} />}</div>
          </div>
          {advice.followed && <p className="small">Recommended for you: <strong>{best.method.name}</strong> — {advice.reason}</p>}
          {!advice.followed && (<>
          {count !== null && best.method.act && (
            <p className="small">≈ {count.toLocaleString('en-US')} more {actionForm(best.method.act, count)}{legEnd < target ? ` to level ${legEnd}` : ` to level ${target}`}.</p>
          )}
          {arrows && arrows.shots.mid > 0 && (
            <p className="small ranged-arrows">
              🏹 To level {arrows.goalLevel} with {arrows.bow} and {arrows.arrow}: about {arrows.shots.mid.toLocaleString('en-US')} shots
              ({arrows.shots.low.toLocaleString('en-US')}–{arrows.shots.high.toLocaleString('en-US')}). Picking arrows up, about {arrows.lostPickingUp.mid.toLocaleString('en-US')} break;
              left on the ground, every shot costs one.{arrows.notCounted.length > 0 && ` Accuracy leaves out ${arrows.notCounted.join(', ')} (no ranged data).`}
            </p>
          )}
          {profile.showTime && advice.time && (
            <p className="small">⏱ {formatHours(advice.time)} to {target}{advice.time.source === 'wiki' ? ' (by the wiki speed — a guide)' : advice.time.source === 'model' ? ' (for your levels and gear)' : advice.time.source === 'forecast' ? ' (across your plan)' : ' (at your pace)'}.</p>
          )}
          {best.status === 'PREP' && (
            <p className="small">First: <strong>{best.missing.map((x) => x.label).join(', ')}</strong> <a href="#/shopping">To the shopping list</a></p>
          )}
          {best.unchecked.length > 0 && <p className="small muted">Not checked: {best.unchecked.map((x) => x.label).join(', ')} — open the bank in the game.</p>}
          {best.method.note && <p className="small muted">{best.method.note}</p>}
          </>)}
          <div className="actions">
            <a className="btn btn-ghost btn-sm" href={best.method.url} target="_blank" rel="noopener noreferrer">Wiki ↗</a>
          </div>
        </>
      ) : (
        <GuideRow skill={skill} level={advice.level} fallback={advice.reason} />
      )}
      {(advice.path.length > 1 || advice.quests.length > 0) && <details className="small"><summary className="muted">Plan details</summary>
      {advice.path.length > 1 && (
        <p className="small muted">Path: {advice.path.map((l) => `${l.fromLevel}–${l.toLevel} ${l.method.name}`).join(' → ')}</p>
      )}
      {advice.quests.length > 0 && (
        <p className="small muted">📜 Some levels are covered by quests: {advice.quests.map((q) => q.name).join('; ')}.</p>
      )}
      </details>}
      {showOthers && (
        <details className="small">
          <summary className="muted">Other methods: {advice.others.length}</summary>
          <ul>{advice.others.slice(0, profile.alternatives || 3).map((v) => <Alternative key={v.method.id} v={v} />)}</ul>
        </details>
      )}
    </section>
  );
}

/**
 * For a training step: takes the lagging skill of the step's goal and shows "what to train with". Other steps, and combat steps that name their own
 * opponents and pace — nothing.
 */
export function StepTraining({ step }: { step: Step }) {
  const { state } = usePlayerState();
  const trig = step.inGame?.completionTrigger;
  // A combat step with its own opponents and pace (S3-08 Minotaurs, S4-03 Hill Giants) is itself the method: another place would contradict it.
  const ownMethod = Boolean(step.foes?.length && step.pacing);
  const pick = useMemo(() => {
    if (ownMethod || trig?.type !== 'SKILL_LEVEL' || !trig.levels?.length || trig.items?.length) return null;
    // How much is left to the goal — for the lagging skill; the level is unknown — we take the first.
    const rows = trig.levels.map((l) => ({ skill: l.skill, target: l.level, lv: levelOf(state, l.skill) }));
    const open = rows.filter((r) => r.lv === undefined || r.lv < r.target);
    if (!open.length) return null;
    // A step that follows a skill's method shows that skill's card while it is open: the card, the tools and the arrow are one answer.
    const followed = open.find((r) => r.skill === step.followsMethod);
    if (followed) return followed;
    return open.sort((a, b) => (a.lv ?? 0) - a.target - ((b.lv ?? 0) - b.target))[0];
  }, [ownMethod, trig, state, step.followsMethod]);
  if (!pick) return null;
  return <TrainingCard skill={pick.skill} target={pick.target} />;
}
