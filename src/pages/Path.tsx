import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_QP, stepById } from '../data';
import { useStore } from '../store';
import { currentStage, isClosed, openAfter } from '../lib/next-step';
import { useBridge } from '../bridge';
import { flashDone } from '../lib/flash';
import { reachableQuestPoints } from '../lib/qp';
import { pendingReview } from '../lib/review';
import { NextStepCard } from '../components/NextStepCard';
import { GearBanner } from '../components/GearPrompt';
import { ProgressBar } from '../components/ProgressBar';
import { StageSection } from '../components/StageSection';
import { useMediaQuery, WIDE } from '../lib/media';
import { PathWide } from './PathWide';
import { plural } from '../lib/shopping';
import { AccountSync } from '../components/AccountSync';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The collapse time of a card (like the transition of .collapse) — after it the layout has settled. */
const COLLAPSE_MS = 240;
/** Without animation the layout still needs a couple of frames for an expanded stage to get its height. */
const SETTLE_MS = 50;

/** Whether the step header is fully visible, taking the sticky header into account. */
function rowVisible(el: HTMLElement): boolean {
  const row = el.querySelector('.step-row') ?? el;
  const r = row.getBoundingClientRect();
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const bottom = window.innerHeight - (document.querySelector('.tabs-bottom')?.getBoundingClientRect().height ?? 0);
  return r.top >= top && r.bottom <= bottom;
}

/** All the expanded blocks around the step and in it reached their full height. */
function settled(el: HTMLElement): boolean {
  const open = [...el.querySelectorAll<HTMLElement>('.collapse.is-open')];
  for (let p = el.parentElement?.closest<HTMLElement>('.collapse.is-open'); p; p = p.parentElement?.closest<HTMLElement>('.collapse.is-open')) open.push(p);
  return open.every((c) => {
    const inner = c.firstElementChild as HTMLElement | null;
    return !inner || c.getBoundingClientRect().height + 1 >= inner.scrollHeight;
  });
}

export function PathPage(props: { focusStep?: string; focusKey: number }) {
  const wide = useMediaQuery(WIDE);
  return wide ? <PathWide {...props} /> : <PathNarrow {...props} />;
}

/** A narrow window: the stages as a list, the steps expand in place. */
function PathNarrow({ focusStep, focusKey }: { focusStep?: string; focusKey: number }) {
  const { progress, qp, maxQp, steps, stages, mode, setStep, review, reactivate } = useStore();
  const { advance } = useBridge();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [stageOpen, setStageOpen] = useState<Record<number, boolean>>({});
  const followTimer = useRef<number>(undefined);

  const current = currentStage(steps, progress);
  const byStage = useMemo(() => new Map(stages.map((st) => [st.id, steps.filter((s) => s.stage === st.id)])), [stages, steps]);
  const closed = steps.filter((s) => isClosed(progress, s.id)).length;
  const reachable = reachableQuestPoints(steps, progress, BASE_QP);
  const skippedQp = steps.filter((s) => s.qp && progress.steps[s.id] === 'skipped');
  // The nearest step that lacks quest points: "S3-06 waits for 12".
  const threshold = steps.find((s) => s.minQp !== undefined && s.minQp > qp && !isClosed(progress, s.id));
  const pending = pendingReview(steps, progress);

  const isStageOpen = (id: number) => stageOpen[id] ?? id === current;

  const reveal = useCallback((id: string, opts: { scroll: 'always' | 'if-hidden'; delay: number }) => {
    window.clearTimeout(followTimer.current);
    const run = (framesLeft: number) => {
      const el = document.getElementById(`step-${id}`);
      if (!el) return;
      // While the stage and card are expanding, the page is still short and scrolling would hit its end.
      if (framesLeft > 0 && !settled(el)) {
        followTimer.current = window.setTimeout(() => run(framesLeft - 1), 16);
        return;
      }
      // Scrolling to the start of the card: for an expanded tall card "centered" pushed the header off the screen edge.
      if (opts.scroll === 'always' || !rowVisible(el)) {
        el.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
      el.querySelector<HTMLButtonElement>('.step-toggle')?.focus({ preventScroll: true });
    };
    followTimer.current = window.setTimeout(() => run(60), opts.delay);
  }, []);

  useEffect(() => () => window.clearTimeout(followTimer.current), []);

  // Navigation by the link #/step/S3-05: expand the stage and the step, scroll to it.
  useEffect(() => {
    const step = focusStep && stepById.get(focusStep);
    if (!step || !steps.includes(step)) return;
    setStageOpen((o) => ({ ...o, [step.stage]: true }));
    setExpanded((e) => new Set(e).add(step.id));
    // We wait until the stage expands, otherwise the scroll misses.
    reveal(step.id, { scroll: 'always', delay: reduceMotion() ? SETTLE_MS : COLLAPSE_MS });
  }, [focusStep, focusKey, steps, reveal]);

  const toggleStep = (id: string) => setExpanded((e) => {
    const next = new Set(e);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  /** Collapse the completed step and expand the next unclosed one. */
  const advanceFrom = useCallback((id: string, next: (typeof steps)[number] | undefined) => {
    setExpanded((e) => {
      const n = new Set(e);
      n.delete(id);
      if (next) n.add(next.id);
      return n;
    });
    if (!next) return;
    setStageOpen((o) => ({ ...o, [next.stage]: true }));
    reveal(next.id, { scroll: 'if-hidden', delay: reduceMotion() ? SETTLE_MS : COLLAPSE_MS });
  }, [reveal]);

  /** "Mark as done" in the card: collapse it and expand the next unclosed step. */
  const completeInList = useCallback((id: string) => {
    setStep(id, 'done');
    advanceFrom(id, openAfter(steps, progress, id));
  }, [steps, progress, setStep, advanceFrom]);

  // The step is done in the game (RuneLite): the same as the button in the card, only the bridge already set the mark.
  const seenAdvance = useRef(advance?.nonce);
  useEffect(() => {
    if (!advance || advance.nonce === seenAdvance.current) return;
    seenAdvance.current = advance.nonce;
    flashDone(`step-${advance.from}`);
    advanceFrom(advance.from, steps.find((s) => s.id === advance.to));
  }, [advance, steps, advanceFrom]);

  /** From "What to do now" — only the mark: the card above shows the next step by itself. */
  const completeFromTop = useCallback((id: string) => {
    setStep(id, 'done');
    setExpanded((e) => {
      if (!e.has(id)) return e;
      const n = new Set(e);
      n.delete(id);
      return n;
    });
  }, [setStep]);

  const showChanges = () => {
    setStageOpen((o) => ({ ...o, ...Object.fromEntries(pending.map((s) => [s.stage, true])) }));
    setExpanded((e) => new Set([...e, ...pending.map((s) => s.id)]));
    reveal(pending[0].id, { scroll: 'always', delay: reduceMotion() ? SETTLE_MS : COLLAPSE_MS });
  };

  const stage = stages.find((s) => s.id === current) ?? stages[0];
  return (
    <div className="page">
      <h1 className="visually-hidden">Path</h1>

      {pending.length > 0 && (
        <section className="review-banner card" aria-labelledby="review-title">
          <h2 id="review-title" className="review-title">🔔 The guide updated to V2!</h2>
          <p>
            In the {pending.length === 1 ? 'step' : 'steps'} {pending.map((s) => s.id).join(', ')}, which you already marked, important requirements appeared.
            Check them — something in the game may have been missed. Quest points are not taken away on a reset.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={showChanges}>Show what changed</button>
            <button type="button" className="btn" onClick={() => reactivate(pending.map((s) => s.id))}>Reset the updated steps to active</button>
            <button type="button" className="btn btn-ghost" onClick={() => review(pending.map((s) => s.id))}>I checked everything, hide</button>
          </div>
        </section>
      )}

      <section className="summary card" aria-label="Progress">
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Done</span>
            <span className="stat-value">{Math.round((closed / steps.length) * 100)}%</span>
            <span className="stat-sub">{closed} of {steps.length} {plural(steps.length, 'step', 'steps')} · {mode === 'members' ? 'Members' : 'F2P'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Quest points</span>
            <span className="stat-value">{qp} <span className="stat-of">/ {maxQp}</span></span>
            <span className="stat-sub">
              {skippedQp.length
                ? `maximum ${reachable}: ${skippedQp.map((s) => s.id).join(', ')} skipped`
                : threshold ? `${threshold.id} waits for ${threshold.minQp}` : 'all thresholds passed'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Stage</span>
            <span className="stat-value">{current} <span className="stat-of">/ {stages.length}</span></span>
            <span className="stat-sub">{stage.title}</span>
          </div>
        </div>
        <ProgressBar value={closed / steps.length} label="Steps done" />
      </section>

      <AccountSync compact />
      <NextStepCard onDone={completeFromTop} />
      <GearBanner />

      <div className="stages">
        {stages.map((st) => (
          <StageSection key={st.id} stage={st} steps={byStage.get(st.id) ?? []}
            open={isStageOpen(st.id)} current={st.id === current}
            onToggle={() => setStageOpen((o) => ({ ...o, [st.id]: !isStageOpen(st.id) }))}
            expanded={expanded} onToggleStep={toggleStep} onDone={completeInList} />
        ))}
      </div>
    </div>
  );
}
