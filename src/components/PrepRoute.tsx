// «Маршрут подготовки»: что сделать до выхода по порядку — одно главное, следом не больше двух, и возврат к шагу.
// Объезд запоминается (переживает перезапуск), глубина не больше трёх; когда задача выполнена, объезд снимается сам
// и приложение говорит, что пора вернуться. Расчёт — lib/prepRoute.ts, готовность — lib/readiness.ts.

import { useEffect, useMemo } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { stepReadiness, type ReadinessAction, type StepReadiness } from '../lib/readiness';
import { buildPrepRoute, openTaskIds, reconcile, startDetour, type PrepTask } from '../lib/prepRoute';
import { usePrep } from '../lib/usePrep';
import { NavigateButton } from './NavigateButton';

const KIND_ICON: Record<PrepTask['kind'], string> = { block: '🔒', quest: '📜', stat: '⚡', buy: '🛒', money: '💰', bank: '🏦' };

function TaskAction({ a }: { a: ReadinessAction }) {
  if (a.kind === 'nav') return <NavigateButton target={a.target} label={a.label} />;
  return <a className="btn btn-ghost btn-sm" href={a.href}>{a.label}</a>;
}

export function PrepRouteBlock({ step, r }: { step: Step; r: StepReadiness }) {
  const route = useMemo(() => buildPrepRoute(r, step), [r, step]);
  const { prep, set } = usePrep();
  const { navigate } = useBridge();
  const { notify } = useStore();
  const active = prep.stack.filter((f) => f.sourceStepId === step.id);
  if (route.ready || !route.primary) return null;
  const primary = route.primary;
  const underway = active.some((f) => f.detourId === primary.id);

  const begin = async () => {
    const res = startDetour(prep, {
      sourceStepId: step.id, detourId: primary.id, reason: primary.label, startedAt: Date.now(),
      returnCondition: `${primary.label} — готово`,
    });
    if (!res.ok) {
      notify(res.reason === 'DEPTH' ? 'Подготовка уже в три захода — сделай по списку, потом новые.'
        : res.reason === 'DONE_BEFORE' ? 'Это уже делалось раньше — проверь, что на месте.' : 'Этот заход уже идёт.');
      return;
    }
    set(res.state);
    // Стрелка ведёт за подготовкой; шаг вернётся сам, когда задача выполнена (или кнопкой «Вернуть к шагу»).
    if (primary.action?.kind === 'nav') await navigate(primary.action.target);
    else if (primary.action?.kind === 'link') window.location.hash = primary.action.href;
  };

  return (
    <div className="prep-route" role="group" aria-label="Маршрут подготовки">
      <p className="small prep-head">🧭 <strong>Подготовка к {step.id}</strong> <span className="muted">— сначала главное</span></p>
      <div className="prep-primary">
        <p className="prep-now">
          <span aria-hidden="true">{KIND_ICON[primary.kind]}</span> <strong>{primary.label}</strong>
          {primary.detail && <span className="muted"> — {primary.detail}</span>}
        </p>
        <div className="actions">
          {primary.action && <TaskAction a={primary.action} />}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void begin()} disabled={underway}>
            {underway ? '⚡ Подготовка идёт' : '▶ Начать подготовку'}
          </button>
        </div>
      </div>
      {route.next.length > 0 && (
        <ol className="small prep-next" start={2}>
          {route.next.map((t) => (
            <li key={t.id}>
              <span aria-hidden="true">{KIND_ICON[t.kind]}</span> {t.label}
              {t.action && <> · <TaskAction a={t.action} /></>}
            </li>
          ))}
        </ol>
      )}
      {route.hidden > 0 && <p className="small muted">…и ещё {route.hidden} — остальное после этого.</p>}
      <p className="small muted">→ потом вернёмся к {step.id}{active.length > 1 ? ` (заходов подготовки: ${active.length})` : ''}.</p>
      {underway && (
        <p className="small muted">
          <button type="button" className="link-btn" onClick={() => set({ ...prep, stack: prep.stack.filter((f) => !(f.sourceStepId === step.id && f.detourId === primary.id)) })}>
            Отменить заход
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Следит за объездами: когда задача подготовки выполнена, снимает объезд и говорит, что пора вернуться к шагу.
 * Один на всё приложение: считает готовность для шагов из стека теми же входными данными, что и панель шага.
 */
export function PrepWatcher() {
  const { progress, qp, mode, steps, notify } = useStore();
  const { stats, owned, gear } = useBridge();
  const { prep, set } = usePrep();
  useEffect(() => {
    if (!prep.stack.length) return;
    const openTasks = (stepId: string): Set<string> | null => {
      const step = steps.find((s) => s.id === stepId);
      if (!step) return null;
      return openTaskIds(stepReadiness({ step, steps, progress, qp, mode, stats, owned, gear }), step);
    };
    const res = reconcile(prep, openTasks);
    if (res.state.stack.length === prep.stack.length && res.state.done.length === prep.done.length) return;
    set(res.state);
    if (res.returnTo) {
      const left = res.state.stack.length;
      notify(left ? `🟢 Один заход подготовки готов — дальше вернёмся к ${res.returnTo}.` : `🟢 Подготовка готова — возвращайся к ${res.returnTo}.`);
    }
  }, [prep, set, steps, progress, qp, mode, stats, owned, gear, notify]);
  return null;
}
