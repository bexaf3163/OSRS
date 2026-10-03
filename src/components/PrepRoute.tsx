// «Маршрут подготовки»: что сделать до выхода по порядку — одно главное, следом не больше двух, и возврат к шагу.
// Очередь строится и запускается сама (PrepAuto): стрелка ведёт за недостающим — в банк, к бирже, к месту прокачки, —
// а когда задача выполнена по данным игры, объезд снимается и очередь идёт дальше; в конце приложение говорит вернуться.
// Игрок может приостановить («Приостановить»), отказаться («Отменить заход») или выключить автоподготовку в настройках.
// Расчёт — lib/prepRoute.ts и lib/prepQueue.ts, готовность — lib/readiness.ts.

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
 * «Исправить» одной кнопкой: начать подготовку к шагу (стрелка к банку, бирже или месту прокачки). Если у главной задачи
 * места нет (квест, уровень без точки на карте) — ничего не уходит из окна: onDetails раскрывает подробности подготовки.
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
      returnCondition: `${primary.label} — готово`,
    });
    if (!res.ok) {
      if (res.reason === 'DEPTH') notify('Подготовка уже в три захода — сделай по списку, потом новые.');
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
      returnCondition: `${primary.label} — готово`,
    });
    if (!res.ok) {
      notify(res.reason === 'DEPTH' ? 'Подготовка уже в три захода — сделай по списку, потом новые.'
        : res.reason === 'DONE_BEFORE' ? 'Это уже делалось раньше — проверь, что на месте.' : 'Этот заход уже идёт.');
      return;
    }
    declined.delete(`${step.id}:${primary.id}`);
    set(res.state);
    // Стрелка ведёт за подготовкой; шаг вернётся сам, когда задача выполнена (или кнопкой «Вернуть к шагу»).
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
    <div className="prep-route" role="group" aria-label="Маршрут подготовки">
      <p className="small prep-head">🧭 <strong>Подготовка к {step.id}</strong> <span className="muted">— сначала главное</span></p>
      <div className="prep-primary">
        <p className="prep-now">
          <span aria-hidden="true">{KIND_ICON[primary.kind]}</span> <strong>{primary.label}</strong>
          {primary.detail && <span className="muted"> — {primary.detail}</span>}
        </p>
        {primary.method && <p className="small muted">Чем: {primary.method}</p>}
        <div className="actions">
          {go && <TaskAction a={go} />}
          {paused ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void resume()}>▶ Продолжить подготовку</button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void begin()} disabled={underway}>
              {underway ? '⚡ Подготовка идёт' : '▶ Начать подготовку'}
            </button>
          )}
        </div>
      </div>
      {next.length > 0 && (
        // Спокойно: одно главное, остальное свёрнуто; эффективно: следующие две задачи видны сразу.
        <details className="prep-more" open={profile.style === 'efficient'}>
          <summary className="small muted">Что дальше: {next.length}{hidden > 0 ? ` и ещё ${hidden}` : ''}</summary>
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
      {next.length === 0 && hidden > 0 && <p className="small muted">…и ещё {hidden} — остальное после этого.</p>}
      <p className="small muted">→ потом вернёмся к {step.id}{active.length > 1 ? ` (заходов подготовки: ${active.length})` : ''}.</p>
      <p className="small muted">
        {features.autoPrep
          ? <>Автоподготовка включена: очередь идёт сама. {underway && !paused && <><button type="button" className="link-btn" onClick={cancel}>Отменить заход</button> · </>}</>
          : <>Автоподготовка выключена. </>}
        <button type="button" className="link-btn" onClick={() => setFeatures({ autoPrep: !features.autoPrep })}>
          {features.autoPrep ? 'Выключить' : 'Включить'}
        </button>
      </p>
    </div>
  );
}

/**
 * Следит за объездами: когда задача подготовки выполнена, снимает объезд и говорит, что пора вернуться к шагу.
 * Один на всё приложение: готовность считает общий движок, а не каждый экран заново.
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
      notify(left ? `🟢 Один заход подготовки готов — дальше вернёмся к ${res.returnTo}.` : `🟢 Подготовка готова — возвращайся к ${res.returnTo}.`);
    }
  }, [prep, set, engine, notify]);
  return null;
}

/**
 * Автоочередь: сама выстраивает подготовку к текущему шагу и сама ведёт стрелку — к банку, бирже, месту прокачки.
 * Стрелку не перехватывает, если в игре уже стоит цель, и замолкает, когда игрок снял стрелку сам.
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
    // Игрок сам снял стрелку: очередь этого шага на паузе, пока он не нажмёт «Продолжить».
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
      notify(`🧭 Подготовка к ${focus.id}: ${d.task.label}. Стрелка ведёт туда; вернуться — «Вернуть к шагу».`);
    } else if (d.kind === 'renav') {
      // Не больше трёх раз на одну цель: если плагин снимает её сразу (игрок уже на месте), не крутим по кругу.
      const n = (renavs.current.get(d.key) ?? 0) + 1;
      renavs.current.set(d.key, n);
      recent.current.set(d.key, now);
      if (n <= 3 && d.task.guide?.kind === 'nav') void navigate(d.task.guide.target);
    } else if (!announced.current.has(d.key)) {
      announced.current.add(d.key);
      notify(`➡️ Дальше в подготовке к ${focus.id}: ${d.task.label}.`);
    }
  }, [focus, engine, prep, set, navTarget, navigate, features.autoPrep, profile, link, userClearedAt, notify]);
  return null;
}
