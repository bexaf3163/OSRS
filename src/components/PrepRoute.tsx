// "The preparation route": what to do before setting off, in order — one main thing, then no more than two, and the return to the step.
// The queue is built and started by itself (PrepAuto): the arrow leads for what is missing — to the bank, the exchange, a training place —
// and when a task is done by the game data, the detour is removed and the queue goes on; at the end the app says to return.
// The player can pause ("Pause"), refuse ("Cancel the trip") or turn off the auto preparation in settings.
// The calculation is lib/prepRoute.ts and lib/prepQueue.ts, readiness is lib/readiness.ts.

import { useEffect, useRef } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import type { ReadinessAction } from '../lib/readiness';
import { reconcile, startDetour, type PrepTask } from '../lib/prepRoute';
import { decideAuto, type QueueTask } from '../lib/prepQueue';
import { declined, usePrep } from '../lib/usePrep';
import { setFeatures, useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { isClosed, nextStep } from '../lib/next-step';
import { useReadinessEngine } from '../readinessContext';
import { NavigateButton } from './NavigateButton';

const KIND_ICON: Record<PrepTask['kind'], string> = { block: '🔒', quest: '📜', stat: '⚡', buy: '🛒', money: '💰', bank: '🏦' };

function TaskAction({ a }: { a: ReadinessAction }) {
  if (a.kind === 'nav') return <NavigateButton target={a.target} label={a.label} />;
  return <a className="btn btn-ghost btn-sm" href={a.href}>{a.label}</a>;
}

/**
 * "Fix" with one button: start the preparation for the step (the arrow to the bank, the exchange or a training place). If the main task
 * has no place (a quest, a level with no map point) — nothing leaves the window: onDetails expands the preparation details.
 */
export function usePrepFix(step: Step, onDetails: () => void): { available: boolean; underway: boolean; fix: () => Promise<void> } {
  const profile = styleOf(useFeatures());
  const queue = useReadinessEngine().queue(step, profile.style);
  const { prep, set } = usePrep();
  const { navigate } = useBridge();
  const { notify } = useStore();
  const primary: QueueTask | undefined = queue.tasks[0];
  const underway = !!primary && prep.stack.some((f) => f.sourceStepId === step.id && f.detourId === primary.id);
  const fix = async () => {
    if (!primary) return;
    const res = startDetour(prep, {
      sourceStepId: step.id, detourId: primary.id, reason: primary.label, startedAt: Date.now(),
      returnCondition: `${primary.label} — done`,
    });
    if (!res.ok) {
      if (res.reason === 'DEPTH') notify('The preparation is already three trips deep — do the list first, then new ones.');
      onDetails();
      return;
    }
    declined.delete(`${step.id}:${primary.id}`);
    set(res.state);
    const go = primary.guide ?? primary.action;
    if (go?.kind === 'nav') await navigate(go.target);
    else onDetails();
  };
  return { available: !queue.ready && !!primary, underway, fix };
}

export function PrepRouteBlock({ step }: { step: Step }) {
  const features = useFeatures();
  const profile = styleOf(features);
  const queue = useReadinessEngine().queue(step, profile.style);
  const { prep, set } = usePrep();
  const { navigate } = useBridge();
  const { notify } = useStore();
  const active = prep.stack.filter((f) => f.sourceStepId === step.id);
  const tasks = queue.tasks;
  const primary: QueueTask | undefined = tasks[0];
  if (queue.ready || !primary) return null;
  const next = tasks.slice(1, 3);
  const hidden = Math.max(0, tasks.length - 3);
  const underway = active.some((f) => f.detourId === primary.id);
  const paused = active.some((f) => f.paused);

  const begin = async () => {
    const res = startDetour(prep, {
      sourceStepId: step.id, detourId: primary.id, reason: primary.label, startedAt: Date.now(),
      returnCondition: `${primary.label} — done`,
    });
    if (!res.ok) {
      notify(res.reason === 'DEPTH' ? 'The preparation is already three trips deep — do the list first, then new ones.'
        : res.reason === 'DONE_BEFORE' ? 'This was done before — check that it is in place.' : 'This trip is already underway.');
      return;
    }
    declined.delete(`${step.id}:${primary.id}`);
    set(res.state);
    // The arrow leads for the preparation; the step returns by itself when the task is done (or with the "Return to the step" button).
    const go = primary.guide ?? primary.action;
    if (go?.kind === 'nav') await navigate(go.target);
    else if (go?.kind === 'link') window.location.hash = go.href;
  };

  const resume = async () => {
    set({ ...prep, stack: prep.stack.map((f) => (f.sourceStepId === step.id ? { ...f, paused: false } : f)) });
    declined.delete(`${step.id}:${primary.id}`);
    if (primary.guide?.kind === 'nav') await navigate(primary.guide.target);
  };

  const cancel = () => {
    declined.add(`${step.id}:${primary.id}`);
    set({ ...prep, stack: prep.stack.filter((f) => !(f.sourceStepId === step.id && f.detourId === primary.id)) });
  };

  const go = primary.guide ?? primary.action;
  return (
    <div className="prep-route" role="group" aria-label="Preparation route">
      <p className="small prep-head">🧭 <strong>Preparing for {step.id}</strong> <span className="muted">— the main thing first</span></p>
      <div className="prep-primary">
        <p className="prep-now">
          <span aria-hidden="true">{KIND_ICON[primary.kind]}</span> <strong>{primary.label}</strong>
          {primary.detail && <span className="muted"> — {primary.detail}</span>}
        </p>
        {primary.method && <p className="small muted">How: {primary.method}</p>}
        <div className="actions">
          {go && <TaskAction a={go} />}
          {paused ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void resume()}>▶ Continue the preparation</button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void begin()} disabled={underway}>
              {underway ? '⚡ Preparation underway' : '▶ Start the preparation'}
            </button>
          )}
        </div>
      </div>
      {next.length > 0 && (
        // Calm: one main thing, the rest folded; efficient: the next two tasks are visible at once.
        <details className="prep-more" open={profile.style === 'efficient'}>
          <summary className="small muted">What next: {next.length}{hidden > 0 ? ` and ${hidden} more` : ''}</summary>
          <ol className="small prep-next" start={2}>
            {next.map((t) => (
              <li key={t.id}>
                <span aria-hidden="true">{KIND_ICON[t.kind]}</span> {t.label}
                {t.action && <> · <TaskAction a={t.action} /></>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {next.length === 0 && hidden > 0 && <p className="small muted">…and {hidden} more — the rest after this.</p>}
      <p className="small muted">→ then we return to {step.id}{active.length > 1 ? ` (preparation trips: ${active.length})` : ''}.</p>
      <p className="small muted">
        {features.autoPrep
          ? <>Auto preparation is on: the queue runs by itself. {underway && !paused && <><button type="button" className="link-btn" onClick={cancel}>Cancel the trip</button> · </>}</>
          : <>Auto preparation is off. </>}
        <button type="button" className="link-btn" onClick={() => setFeatures({ autoPrep: !features.autoPrep })}>
          {features.autoPrep ? 'Turn off' : 'Turn on'}
        </button>
      </p>
    </div>
  );
}

/**
 * Watches the detours: when a preparation task is done, removes the detour and says it is time to return to the step.
 * One for the whole app: the shared engine counts the readiness, not every screen anew.
 */
export function PrepWatcher() {
  const { notify } = useStore();
  const engine = useReadinessEngine();
  const { prep, set } = usePrep();
  useEffect(() => {
    if (!prep.stack.length) return;
    const res = reconcile(prep, (stepId) => engine.openTasks(stepId));
    if (res.state.stack.length === prep.stack.length && res.state.done.length === prep.done.length) return;
    set(res.state);
    if (res.returnTo) {
      const left = res.state.stack.length;
      notify(left ? `🟢 One preparation trip is ready — next we return to ${res.returnTo}.` : `🟢 The preparation is ready — return to ${res.returnTo}.`);
    }
  }, [prep, set, engine, notify]);
  return null;
}

/**
 * The auto queue: builds the preparation for the current step by itself and leads the arrow — to the bank, the exchange, a training place.
 * It does not take over the arrow if a target is already set in the game, and goes quiet when the player cleared the arrow by hand.
 */
export function PrepAuto() {
  const features = useFeatures();
  const profile = styleOf(features);
  const { steps, progress, qp, notify } = useStore();
  const { activeStepId, navTarget, navigate, state: link, userClearedAt } = useBridge();
  const engine = useReadinessEngine();
  const { prep, set } = usePrep();
  const recent = useRef(new Map<string, number>());
  const announced = useRef(new Set<string>());
  const seenClear = useRef(userClearedAt);
  const renavs = useRef(new Map<string, number>());

  const focus = (activeStepId ? steps.find((s) => s.id === activeStepId && !isClosed(progress, s.id)) : undefined) ?? nextStep(steps, progress, qp);

  useEffect(() => {
    if (!focus) return;
    // The player cleared the arrow by hand: this step's queue is paused until they press "Continue".
    if (userClearedAt !== seenClear.current) {
      seenClear.current = userClearedAt;
      if (prep.stack.some((f) => f.sourceStepId === focus.id && !f.paused)) {
        set({ ...prep, stack: prep.stack.map((f) => (f.sourceStepId === focus.id ? { ...f, paused: true } : f)) });
        return;
      }
    }
    const queue = engine.queue(focus, profile.style);
    const now = Date.now();
    const d = decideAuto({
      queue, stepId: focus.id, prep, enabled: features.autoPrep, online: link === 'online' && engine.ctx.state.connected,
      navActive: navTarget !== null, announce: profile.announce, now, recent: recent.current, declined,
    });
    if (!d) return;
    if (d.kind === 'start') {
      set(d.state);
      if (d.task.guide?.kind === 'nav') {
        recent.current.set(`${focus.id}:${d.task.id}:${d.task.guide.target.x},${d.task.guide.target.y},${d.task.guide.target.itemName ?? ''}`, now);
        void navigate(d.task.guide.target);
      }
      notify(`🧭 Preparing for ${focus.id}: ${d.task.label}. The arrow leads there; to return — "Return to the step".`);
    } else if (d.kind === 'renav') {
      // No more than three times per target: if the plugin clears it at once (the player is already there), we do not loop.
      const n = (renavs.current.get(d.key) ?? 0) + 1;
      renavs.current.set(d.key, n);
      recent.current.set(d.key, now);
      if (n <= 3 && d.task.guide?.kind === 'nav') void navigate(d.task.guide.target);
    } else if (!announced.current.has(d.key)) {
      announced.current.add(d.key);
      notify(`➡️ Next in the preparation for ${focus.id}: ${d.task.label}.`);
    }
  }, [focus, engine, prep, set, navTarget, navigate, features.autoPrep, profile, link, userClearedAt, notify]);
  return null;
}
