// The "unified status" of a step instead of a stack of plaques: one line —
//   🟢 Ready to set off · [Start the step]
//   🟡 Preparation required (3 items) · [Fix] [More]
// "More" expands an accordion with tabs (preparation, gear, food, route and game, training and variants) —
// they hold all the earlier functionality, nothing is removed. When the player is ready, the accordion collapses by itself.
// Tabs without content are not shown: the components decide themselves whether they have anything to say (null — no).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { toInGameTarget } from '../services/runeliteBridge';
import { isClosed } from '../lib/next-step';
import { STATUS_TEXT } from '../lib/readiness';
import { plural } from '../lib/shopping';
import { useReadiness, useReadinessEngine } from '../readinessContext';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { usePrepFix } from './PrepRoute';
import { ReadinessPanel } from './ReadinessPanel';
import { OneTripCard, RecoveryBanner } from './OneTripCard';
import { MoneyGoal } from './MoneyGoal';
import { MoneyPlan } from './MoneyPlan';
import { MagicPlan } from './MagicPlan';
import { UpgradePrompt } from './UpgradePrompt';
import { GearPrompt } from './GearPrompt';
import { StyleGear } from './StyleGear';
import { FoodAdvice } from './FoodAdvice';
import { StepMap } from './StepMap';
import { InGamePanel } from './InGamePanel';
import { TravelPlan } from './TravelPlan';
import { StepTraining } from './TrainingCard';
import { BranchSuggestions } from './BranchSuggestions';
import { TravelTip } from './TravelTip';

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

export function StepStatus({ step }: { step: Step }) {
  const { progress } = useStore();
  const { enabled, activeStepId, navTarget, pointInGame, state: link } = useBridge();
  const r = useReadiness(step);
  const planNow = useReadinessEngine().plan(step, { ahead: styleOf(useFeatures()).lookAhead });
  const percent = planNow.score.percent;
  const recovering = planNow.recovery;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('prep');
  const [sent, setSent] = useState<'' | 'sending' | 'offline'>('');
  const measured: TabKey[] = ['prep', 'gear', 'food', 'plan'];
  const { refs, filled } = useFilled(measured);
  const openDetails = () => { setTab('prep'); setOpen(true); };
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
  const prep = !ready && n > 0 && r.status !== 'BLOCKED' && r.status !== 'MISSING_QUEST';
  const text = ready ? 'Ready to set off'
    : prep ? `Preparation required (${n} ${plural(n, 'item', 'items')})`
      : r.status === 'UNKNOWN' ? 'Not everything is checked' : s.text;
  const shown = recovering ? (recovering.recovery.reason === 'DEATH' ? 'You died — recovery mode' : 'Route derailment — recovery mode') : !ready && percent !== null && prep ? `${text} · ready ${percent}%` : text;
  const icon = recovering ? '🔁' : ready ? '🟢' : prep ? '🟡' : s.icon;
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
          {percent !== null && <span className="ready-ring" aria-hidden="true" style={{ '--p': percent } as CSSProperties}><i>{percent}%</i></span>}
          <span aria-hidden="true">{icon}</span> <strong>{shown}</strong>
        </span>
        <span className="status-actions">
          {prep && !recovering && canFix && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void fix()} disabled={underway}>
              {underway ? '⚡ Preparation underway' : '▶ Fix'}
            </button>
          )}
          {!prep && !recovering && hasTarget && (ready || r.status === 'UNKNOWN') && (
            <button type="button" className={`btn btn-sm ${active ? 'btn-ingame-active' : 'btn-primary'}`} onClick={() => void start()} disabled={sent === 'sending'}>
              {active ? '✓ Shown in the game' : '▶ Start the step'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            More {open ? '▴' : '▾'}
          </button>
        </span>
      </div>
      {recovering && <RecoveryBanner step={step} rec={recovering} />}
      {!recovering && <TravelTip step={step} />}
      {sent === 'offline' && <p className="small muted" role="status">RuneLite bridge offline{link === 'online' ? ' or refused' : ''}. Start RuneLite with the OSRS Path Bridge plugin.</p>}
      {detour ? (
        <p className="small status-arrow">🧭 The arrow leads to: {detour.label}</p>
      ) : active ? (
        <p className="small status-arrow muted">🧭 The step is shown in the game — the arrow leads to it.</p>
      ) : null}
      {open && visibleTabs.length > 1 && (
        <div className="status-tabs" role="tablist" aria-label="Step details">
          {visibleTabs.map((t) => (
            <button key={t.key} type="button" role="tab" className={`status-tab ${current === t.key ? 'is-active' : ''}`} aria-selected={current === t.key}
              onClick={() => setTab(t.key)}>
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}
      {panel('prep', <><ReadinessPanel step={step} /><OneTripCard step={step} inStatus /><MoneyGoal step={step} /><MoneyPlan step={step} /><MagicPlan step={step} /></>)}
      {panel('gear', <><UpgradePrompt step={step} /><GearPrompt step={step} /><StyleGear step={step} /></>)}
      {panel('food', <FoodAdvice step={step} />)}
      {open && current === 'route' && (
        <div className="status-panel" role="tabpanel"><StepMap step={step} /><InGamePanel step={step} /><TravelPlan step={step} /></div>
      )}
      {panel('plan', <><StepTraining step={step} /><BranchSuggestions step={step} /></>)}
    </section>
  );
}
