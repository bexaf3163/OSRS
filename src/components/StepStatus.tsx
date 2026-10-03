// «Единый статус» шага вместо стопки плашек: одна строка —
//   🟢 Готов к выходу · [Начать шаг]
//   🟡 Требуется подготовка (3 пункта) · [Исправить] [Подробнее]
// По «Подробнее» раскрывается аккордеон с вкладками (подготовка, снаряжение, еда, путь и игра, прокачка и варианты) —
// в них лежит весь прежний функционал, ничего не убрано. Когда игрок готов, аккордеон сворачивается сам.
// Вкладки без содержимого не показываются: компоненты сами решают, есть ли им что сказать (null — нет).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { toInGameTarget } from '../services/runeliteBridge';
import { isClosed } from '../lib/next-step';
import { STATUS_TEXT } from '../lib/readiness';
import { plural } from '../lib/shopping';
import { useReadiness } from '../readinessContext';
import { usePrepFix } from './PrepRoute';
import { ReadinessPanel } from './ReadinessPanel';
import { OneTripCard } from './OneTripCard';
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

type TabKey = 'prep' | 'gear' | 'food' | 'route' | 'plan';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'prep', label: 'Подготовка', icon: '🧭' },
  { key: 'gear', label: 'Снаряжение', icon: '⚔️' },
  { key: 'food', label: 'Еда', icon: '🍖' },
  { key: 'route', label: 'Путь и игра', icon: '🗺️' },
  { key: 'plan', label: 'Прокачка и варианты', icon: '🎯' },
];

/** Какие вкладки не пусты: считаем по DOM — компонент без содержимого ничего не рисует. */
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
    // keys постоянны для карточки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { refs, filled };
}

export function StepStatus({ step }: { step: Step }) {
  const { progress } = useStore();
  const { enabled, activeStepId, navTarget, pointInGame, state: link } = useBridge();
  const r = useReadiness(step);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('prep');
  const [sent, setSent] = useState<'' | 'sending' | 'offline'>('');
  const measured: TabKey[] = ['prep', 'gear', 'food', 'plan'];
  const { refs, filled } = useFilled(measured);
  const openDetails = () => { setTab('prep'); setOpen(true); };
  const { available: canFix, underway, fix } = usePrepFix(step, openDetails);

  // Игрок стал готов — аккордеон сворачивается: остаётся одна чистая строка.
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
  const text = ready ? 'Готов к выходу'
    : prep ? `Требуется подготовка (${n} ${plural(n, 'пункт', 'пункта', 'пунктов')})`
      : r.status === 'UNKNOWN' ? 'Проверено не всё' : s.text;
  const icon = ready ? '🟢' : prep ? '🟡' : s.icon;
  const tone = ready ? 'is-ready' : prep ? 'is-prep' : r.status === 'UNKNOWN' ? 'is-unknown' : 'is-blocked';
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
    <section className={`step-status ${tone}`} aria-label="Статус шага">
      <div className="status-line">
        <span className="status-text" role="status"><span aria-hidden="true">{icon}</span> <strong>{text}</strong></span>
        <span className="status-actions">
          {prep && canFix && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void fix()} disabled={underway}>
              {underway ? '⚡ Подготовка идёт' : '▶ Исправить'}
            </button>
          )}
          {!prep && hasTarget && (ready || r.status === 'UNKNOWN') && (
            <button type="button" className={`btn btn-sm ${active ? 'btn-ingame-active' : 'btn-primary'}`} onClick={() => void start()} disabled={sent === 'sending'}>
              {active ? '✓ Показан в игре' : '▶ Начать шаг'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Подробнее {open ? '▴' : '▾'}
          </button>
        </span>
      </div>
      {sent === 'offline' && <p className="small muted" role="status">RuneLite мост оффлайн{link === 'online' ? ' или отказал' : ''}. Запусти RuneLite с плагином OSRS Path Bridge.</p>}
      {detour ? (
        <p className="small status-arrow">🧭 Стрелка ведёт: {detour.label}</p>
      ) : active ? (
        <p className="small status-arrow muted">🧭 Шаг показан в игре — стрелка ведёт к нему.</p>
      ) : null}
      {open && visibleTabs.length > 1 && (
        <div className="status-tabs" role="tablist" aria-label="Подробности шага">
          {visibleTabs.map((t) => (
            <button key={t.key} type="button" role="tab" className={`status-tab ${current === t.key ? 'is-active' : ''}`} aria-selected={current === t.key}
              onClick={() => setTab(t.key)}>
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}
      {panel('prep', <><ReadinessPanel step={step} /><OneTripCard step={step} /><MoneyGoal step={step} /><MoneyPlan step={step} /><MagicPlan step={step} /></>)}
      {panel('gear', <><UpgradePrompt step={step} /><GearPrompt step={step} /><StyleGear step={step} /></>)}
      {panel('food', <FoodAdvice step={step} />)}
      {open && current === 'route' && (
        <div className="status-panel" role="tabpanel"><StepMap step={step} /><InGamePanel step={step} /><TravelPlan step={step} /></div>
      )}
      {panel('plan', <><StepTraining step={step} /><BranchSuggestions step={step} /></>)}
    </section>
  );
}
