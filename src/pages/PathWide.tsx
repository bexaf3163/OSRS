// "Path" on a wide screen (redesign D): on the left a ribbon of stages with steps, in the centre the chosen step,
// on the right the pinned wiki dossier. The whole route, the step and the dossier are visible at once, without page scrolling.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Step } from '../types';
import { stepById } from '../data';
import { useStore } from '../store';
import { blockerParts, blockersOf, currentStage, firstOpen, isClosed, nextStep, openAfter } from '../lib/next-step';
import { useBridge } from '../bridge';
import { flashDone } from '../lib/flash';
import { needsReview, pendingReview } from '../lib/review';
import { IconCheck, IconChevron, IconLock, TypeIcon, TYPE_LABEL } from '../components/Icons';
import { StepBody } from '../components/StepCard';
import { WikiDock } from '../components/WikiDrawer';
import { GearBanner } from '../components/GearPrompt';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PathWide({ focusStep, focusKey }: { focusStep?: string; focusKey: number }) {
  const { progress, qp, steps, stages, setStep, review, reactivate } = useStore();
  const { advance } = useBridge();
  const suggested = nextStep(steps, progress, qp) ?? firstOpen(steps, progress) ?? steps[steps.length - 1];
  const [selectedId, setSelectedId] = useState(() => focusStep ?? suggested.id);
  const selected = steps.find((s) => s.id === selectedId) ?? suggested;
  const current = currentStage(steps, progress);
  const [openStages, setOpenStages] = useState<Set<number>>(() => new Set([selected.stage]));
  const center = useRef<HTMLElement>(null);
  const pending = pendingReview(steps, progress);

  const select = useCallback((id: string, focus = true) => {
    const step = stepById.get(id);
    if (!step) return;
    setSelectedId(id);
    setOpenStages((o) => (o.has(step.stage) ? o : new Set(o).add(step.stage)));
    // A new step — from the start: the central column scrolls by itself, the page stays still.
    center.current?.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (focus) window.setTimeout(() => center.current?.querySelector<HTMLElement>('.step-view-title')?.focus({ preventScroll: true }), 0);
    // The chosen step in the ribbon — within the visible area.
    window.setTimeout(() => document.getElementById(`rail-${id}`)?.scrollIntoView({ block: 'nearest' }), 0);
  }, []);

  // Navigation by the link #/step/S3-05.
  useEffect(() => {
    if (focusStep && steps.some((s) => s.id === focusStep)) select(focusStep);
  }, [focusStep, focusKey, steps, select]);

  const toggleStage = (id: number) => setOpenStages((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const nextAfter = (id: string): Step | undefined => openAfter(steps, progress, id);

  // The step is done in the game (RuneLite): as after the "Mark as done" button — the next one is in the centre.
  const seenAdvance = useRef(advance?.nonce);
  useEffect(() => {
    if (!advance || advance.nonce === seenAdvance.current) return;
    seenAdvance.current = advance.nonce;
    flashDone(`rail-${advance.from}`);
    if (advance.to && steps.some((s) => s.id === advance.to)) select(advance.to);
  }, [advance, steps, select]);

  /** "Mark as done": the step closes, the next unclosed one is at once in the centre. */
  const complete = (id: string) => {
    const next = nextAfter(id);
    setStep(id, 'done');
    if (next) select(next.id);
  };

  const showChanges = () => {
    setOpenStages((o) => new Set([...o, ...pending.map((s) => s.stage)]));
    select(pending[0].id);
  };

  const upcoming = nextAfter(selected.id);
  const blockers = isClosed(progress, selected.id) ? null : blockersOf(selected, progress, qp);
  const status = progress.steps[selected.id];

  return (
    <div className="path-wide">
      <h1 className="visually-hidden">Path</h1>

      <nav className="rail" aria-label="Stages and steps">
        {selected.id !== suggested.id ? (
          <button type="button" className="rail-now" onClick={() => select(suggested.id)}>
            To the current step · <code className="code">{suggested.id}</code>
          </button>
        ) : (
          // The same height as the button: the list below does not jump when you leave the current step.
          <div className="rail-now is-here">You are on the current step · <code className="code">{suggested.id}</code></div>
        )}
        <ol className="rail-stages">
          {stages.map((st) => {
            const list = steps.filter((s) => s.stage === st.id);
            const done = list.filter((s) => isClosed(progress, s.id)).length;
            const complete = done === list.length;
            const open = openStages.has(st.id);
            return (
              <li key={st.id} className={`rail-stage ${st.id === current ? 'is-current' : ''} ${complete ? 'is-complete' : ''} ${st.membersOnly ? 'is-members' : ''}`}>
                <button type="button" className="rail-stage-btn" aria-expanded={open} onClick={() => toggleStage(st.id)}>
                  <span className="rail-num">{complete ? <IconCheck /> : st.id}</span>
                  <span className="rail-stage-title">{st.title}</span>
                  <span className="rail-count">{done}/{list.length}</span>
                </button>
                {open && (
                  <ol className="rail-steps">
                    {list.map((s) => {
                      const closed = isClosed(progress, s.id);
                      const locked = !closed && blockersOf(s, progress, qp);
                      return (
                        <li key={s.id}>
                          <button type="button" id={`rail-${s.id}`}
                            className={`rail-step ${s.id === selected.id ? 'is-selected' : ''} ${closed ? 'is-closed' : ''} ${s.id === suggested.id ? 'is-next' : ''}`}
                            aria-current={s.id === selected.id ? 'step' : undefined} onClick={() => select(s.id, false)}>
                            <span className="rail-step-mark" aria-hidden="true">
                              {progress.steps[s.id] === 'done' ? <IconCheck /> : locked ? <IconLock /> : null}
                            </span>
                            <code className="rail-step-code">{s.id}</code>
                            <span className="rail-step-title">{s.title}</span>
                            {needsReview(s, progress) && <span className="rail-dot" title="Updated in V2 — check" />}
                            <span className="visually-hidden">
                              {progress.steps[s.id] === 'done' ? ', done' : progress.steps[s.id] === 'skipped' ? ', skipped' : locked ? ', locked' : ''}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="center" ref={center} aria-labelledby="step-view-title">
        {pending.length > 0 && (
          <div className="review-banner card">
            <h2 className="review-title">🔔 The guide updated to V2!</h2>
            <p>
              In the {pending.length === 1 ? 'step' : 'steps'} {pending.map((s) => s.id).join(', ')}, which you already marked, important requirements appeared.
              Quest points are not taken away on a reset.
            </p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={showChanges}>Show what changed</button>
              <button type="button" className="btn" onClick={() => reactivate(pending.map((s) => s.id))}>Reset the updated steps to active</button>
              <button type="button" className="btn btn-ghost" onClick={() => review(pending.map((s) => s.id))}>I checked everything, hide</button>
            </div>
          </div>
        )}

        {/* A combat step has its own advice in the card — the banner does not repeat it. */}
        {!selected.foes?.length && <GearBanner />}
        <article className={`step-view ${selected.membersOnly ? 'is-members' : ''}`} key={selected.id}>
          <header className="step-view-head">
            <p className="step-view-kicker">
              <code className="code">{selected.id}</code>
              <TypeIcon type={selected.type} />
              <span>{TYPE_LABEL[selected.type]} · stage {selected.stage}</span>
              {selected.qp ? <span className="badge badge-qp">+{selected.qp} QP</span> : null}
              {selected.membersOnly && <span className="badge badge-members">Members</span>}
              {selected.optional && <span className="tag">optional</span>}
              {status === 'done' && <span className="badge badge-f2p"><IconCheck /> done</span>}
              {status === 'skipped' && <span className="tag">skipped</span>}
              {selected.id === suggested.id && status !== 'done' && <span className="badge badge-now">now by the plan</span>}
            </p>
            <h2 className="step-view-title" id="step-view-title" tabIndex={-1}>{selected.title}</h2>
            {blockers && (
              <p className="step-blocked"><IconLock />First: {blockerParts(blockers).join(', ')}</p>
            )}
          </header>
          <StepBody step={selected} onDone={complete} nextId={upcoming?.id} />
          <footer className="step-view-nav">
            {(() => {
              const at = steps.findIndex((s) => s.id === selected.id);
              const prev = steps[at - 1];
              const next = steps[at + 1];
              return (
                <>
                  {prev ? <button type="button" className="btn btn-ghost" onClick={() => select(prev.id)}><IconChevron className="flip" /> {prev.id}</button> : <span />}
                  {next && <button type="button" className="btn btn-ghost" onClick={() => select(next.id)}>{next.id} <IconChevron /></button>}
                </>
              );
            })()}
          </footer>
        </article>
      </section>

      <WikiDock className="dock" />
    </div>
  );
}
