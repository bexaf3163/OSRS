// The "unified status" of a step instead of a stack of plaques: one line —
//   🟢 Ready to set off · [Start the step]
//   🟡 Preparation required (3 items) · [Fix] [More]
// "More" expands an accordion with tabs (preparation, gear, food, route and game, training and variants) —
// they hold all the earlier functionality, nothing is removed. When the player is ready, the accordion collapses by itself.
// Tabs without content are not shown: the components decide themselves whether they have anything to say (null — no).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Step } from '../../../types';
import { useStore } from '../../../state/store';
import { useBridge } from '../../../state/bridge';
import { toInGameTarget } from '../../../domain/guide/inGameTarget';
import { isClosed } from '../../../domain/quests/next-step';
import { STATUS_TEXT } from '../../../domain/readiness/readiness';
import { plural } from '../../../domain/text/format';
import { GUIDE_UNCONFIRMED, TARGET_LABEL } from '../../../domain/player/linkState';
import { useReadinessEngine } from '../../../state/readinessContext';
import { useScopedReadiness, useStageScope } from '../../../state/hooks/useStageScope';
import { scopedPercent, type StageScope } from '../../../domain/quests/stageScope';

/** No stage cut: the step's own items (the "now" lines) only. */
const STEP_ONLY: StageScope = { stageAt: 0, out: new Set() };
import { useFeatures } from '../../../state/hooks/useFeatures';
import { styleOf } from '../../../domain/persistence/playStyle';
import { usePrepFix } from '../prep/PrepRoute';
import { ReadinessPanel } from '../prep/ReadinessPanel';
import { OneTripCard, RecoveryBanner } from '../prep/OneTripCard';
import { FundingStatusLine } from '../../money/FundingCard';
import { UpgradePrompt } from '../combat/UpgradePrompt';
import { GearPrompt } from '../../gear/GearPrompt';
import { FoodAdvice } from '../combat/FoodAdvice';
import { StepMap } from '../../map/StepMap';
import { InGamePanel } from '../InGamePanel';
import { TravelPlan } from '../prep/TravelPlan';
import { F2pStops, StepTraining } from '../../skills/TrainingCard';
import { BranchSuggestions } from '../BranchSuggestions';
import { TravelTip } from '../prep/TravelTip';

type TabKey = 'prep' | 'gear' | 'food' | 'route' | 'plan';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'prep', label: 'Preparation', icon: '🧭' },
  { key: 'gear', label: 'Gear', icon: '⚔️' },
  { key: 'food', label: 'Food', icon: '🍖' },
  { key: 'route', label: 'Route and game', icon: '🗺️' },
  { key: 'plan', label: 'Training and variants', icon: '🎯' },
];

/** Which tabs are not empty: counted from the DOM — a component without content draws nothing. */
function useFilled(keys: TabKey[]) {
  const refs = useRef<Partial<Record<TabKey, HTMLDivElement | null>>>({});
  const [filled, setFilled] = useState<Partial<Record<TabKey, boolean>>>({});
  useLayoutEffect(() => {
    const update = () => {
      setFilled((prev) => {
        const next: Partial<Record<TabKey, boolean>> = {};
        let same = true;
        for (const k of keys) {
          next[k] = (refs.current[k]?.childElementCount ?? 0) > 0;
          if (next[k] !== prev[k]) same = false;
        }
        return same ? prev : next;
      });
    };
    update();
    const mo = new MutationObserver(update);
    for (const k of keys) if (refs.current[k]) mo.observe(refs.current[k]!, { childList: true });
    return () => mo.disconnect();
    // the keys are constant for a card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { refs, filled };
}

/** headline: only the verdict line and its actions (the Path workspace shows the details in its own views); onPrep opens Preparation. noStart: the workspace has its own "Show in game" button, so the status does not offer a second one. */
export function StepStatus({ step, headline = false, noStart = false, quiet = false, onPrep }: { step: Step; headline?: boolean; noStart?: boolean; quiet?: boolean; onPrep?: () => void }) {
  const { progress } = useStore();
  const { enabled, activeStepId, navTarget, pointInGame, state: link, inGame } = useBridge();
  const live = link === 'online' && inGame;
  // The quest items the current stage no longer asks for are not a problem: the verdict, the ring and the Fix button follow the stage the game confirms.
  const r = useScopedReadiness(step);
  const scope = useStageScope(step);
  const planNow = useReadinessEngine().plan(step, { ahead: styleOf(useFeatures()).lookAhead });
  // The ring beside the step's verdict counts the step's own items, the same scope as "Preparation required (N items)": the whole trip's share (the
  // next steps' items too) is the trip card's. "1 item" next to "ready 9%" read as a contradiction.
  const percent = planNow.score.verdict === 'UNKNOWN' ? null : scopedPercent(planNow.lines, scope ?? STEP_ONLY, planNow.score.percent);
  const recovering = planNow.recovery;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('prep');
  const [sent, setSent] = useState<'' | 'sending' | 'offline'>('');
  const measured: TabKey[] = ['prep', 'gear', 'food', 'plan'];
  const { refs, filled } = useFilled(measured);
  const openDetails = () => { if (headline) { onPrep?.(); return; } setTab('prep'); setOpen(true); };
  const { available: canFix, underway, fix } = usePrepFix(step, openDetails);

  // The player became ready — the accordion collapses: one clean line remains.
  const prevStatus = useRef(r?.status);
  useEffect(() => {
    if (prevStatus.current && prevStatus.current !== 'READY' && r?.status === 'READY') setOpen(false);
    prevStatus.current = r?.status;
  }, [r?.status]);

  const closed = isClosed(progress, step.id);
  if (closed || !r) return null;

  const s = STATUS_TEXT[r.status];
  const n = r.problems.length;
  const ready = r.status === 'READY' || (!!r.goalMet && n === 0);
  // quiet: a step with nothing to check has nothing to say about it — no box that only repeats "ready".
  if (quiet && ready && n === 0 && !recovering && planNow.lines.length === 0) return null;
  // Offline nothing can be checked: the list of what to bring says it all, a "not everything is checked" box would only repeat it.
  if (quiet && !ready && n === 0 && r.status === 'UNKNOWN' && link !== 'online' && !recovering) return null;
  const prep = !ready && n > 0 && r.status !== 'BLOCKED' && r.status !== 'MISSING_QUEST';
  const text = ready ? 'Ready to set off'
    : prep ? `Preparation required (${n} ${plural(n, 'item', 'items')})`
      : r.status === 'UNKNOWN' ? 'Not everything is checked' : s.text;
  const shown = recovering ? (recovering.recovery.reason === 'DEATH' ? 'You died — recovery mode' : 'Route derailment — recovery mode') : !ready && percent !== null && prep ? `${text} · ready ${percent}%` : text;
  const icon = recovering ? '🔁' : ready ? '🟢' : prep ? '🟡' : s.icon;
  // "Not everything is checked" has no share to show: unknown is not a percentage (a ring of 9% beside it read as a verdict).
  const ring = percent !== null && (ready || prep || recovering || r.status !== 'UNKNOWN');
  const tone = recovering ? 'is-prep' : ready ? 'is-ready' : prep ? 'is-prep' : r.status === 'UNKNOWN' ? 'is-unknown' : 'is-blocked';
  const hasTarget = enabled && !!toInGameTarget(step);
  const active = activeStepId === step.id;
  const detour = navTarget?.stepId === step.id ? navTarget : null;
  const visibleTabs = TABS.filter((t) => (t.key === 'route' ? true : filled[t.key]));
  const current = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key;

  const start = async () => {
    setSent('sending');
    const res = await pointInGame(step);
    setSent(res === 'ok' ? '' : 'offline');
  };

  const panel = (key: TabKey, children: ReactNode) => (
    <div key={key} ref={(el) => { refs.current[key] = el; }} className="status-panel" role="tabpanel" hidden={!open || current !== key}>
      {children}
    </div>
  );

  return (
    <section className={`step-status ${tone}`} aria-label="Step status">
      <div className="status-line">
        <span className="status-text" role="status">
          {ring && <span className="ready-ring" aria-hidden="true" style={{ '--p': percent } as CSSProperties}><i>{percent}%</i></span>}
          <span aria-hidden="true">{icon}</span> <strong>{shown}</strong>
        </span>
        <span className="status-actions">
          {prep && !recovering && canFix && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void fix()} disabled={underway}>
              {/* The status beside it already says "Preparation required": the running state needs no second "Preparation". */}
              {underway ? '⚡ Underway' : '▶ Fix'}
            </button>
          )}
          {!noStart && !prep && !recovering && hasTarget && (ready || r.status === 'UNKNOWN') && (
            <button type="button" className={`btn btn-sm ${active && live ? 'btn-ingame-active' : active ? '' : 'btn-primary'}`} onClick={() => void start()} disabled={sent === 'sending'}>
              {active ? (live ? '✓ Shown in the game' : TARGET_LABEL.saved) : '▶ Start the step'}
            </button>
          )}
          {!headline && (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              More {open ? '▴' : '▾'}
            </button>
          )}
        </span>
      </div>
      {recovering && <RecoveryBanner step={step} rec={recovering} />}
      <FundingStatusLine step={step} onOpen={openDetails} />
      {!recovering && !headline && <TravelTip step={step} />}
      {sent === 'offline' && <p className="small muted" role="status">{GUIDE_UNCONFIRMED}</p>}
      {detour ? (
        live
          ? <p className="small status-arrow">🧭 The arrow leads to: {detour.label}</p>
          : <p className="small status-arrow muted">🧭 Target saved: {detour.label}. The arrow appears when RuneLite connects.</p>
      ) : active && !noStart ? (
        live
          ? <p className="small status-arrow muted">🧭 The step is shown in the game — the arrow leads to it.</p>
          // In the workspace the current action above already says the target is saved and guidance is inactive.
          : !headline && <p className="small status-arrow muted">🧭 Target saved. Live guidance is inactive until RuneLite connects.</p>
      ) : null}
      {!headline && open && visibleTabs.length > 1 && (
        <div className="status-tabs" role="tablist" aria-label="Step details">
          {visibleTabs.map((t) => (
            <button key={t.key} type="button" role="tab" className={`status-tab ${current === t.key ? 'is-active' : ''}`} aria-selected={current === t.key}
              onClick={() => setTab(t.key)}>
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}
      {!headline && panel('prep', <><ReadinessPanel step={step} /><OneTripCard step={step} inStatus /></>)}
      {!headline && panel('gear', <><UpgradePrompt step={step} /><GearPrompt step={step} /></>)}
      {!headline && panel('food', <FoodAdvice step={step} />)}
      {!headline && open && current === 'route' && (
        <div className="status-panel" role="tabpanel"><StepMap step={step} /><InGamePanel step={step} /><TravelPlan step={step} /></div>
      )}
      {!headline && panel('plan', <><StepTraining step={step} /><BranchSuggestions step={step} />{step.bondBranch && step.type === 'prep' && <F2pStops />}</>)}
    </section>
  );
}
