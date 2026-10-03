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
/** Время сворачивания карточки (как transition у .collapse) — после него раскладка устоялась. */
const COLLAPSE_MS = 240;
/** Без анимации раскладке всё равно нужна пара кадров, чтобы раскрытый этап получил высоту. */
const SETTLE_MS = 50;

/** Виден ли заголовок шага целиком, с учётом липкой шапки. */
function rowVisible(el: HTMLElement): boolean {
  const row = el.querySelector('.step-row') ?? el;
  const r = row.getBoundingClientRect();
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const bottom = window.innerHeight - (document.querySelector('.tabs-bottom')?.getBoundingClientRect().height ?? 0);
  return r.top >= top && r.bottom <= bottom;
}

/** Все раскрытые блоки вокруг шага и в нём самом дошли до полной высоты. */
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

/** Узкое окно: этапы списком, шаги раскрываются на месте. */
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
  // Ближайший шаг, которому не хватает очков квестов: «S3-06 ждёт 12».
  const threshold = steps.find((s) => s.minQp !== undefined && s.minQp > qp && !isClosed(progress, s.id));
  const pending = pendingReview(steps, progress);

  const isStageOpen = (id: number) => stageOpen[id] ?? id === current;

  const reveal = useCallback((id: string, opts: { scroll: 'always' | 'if-hidden'; delay: number }) => {
    window.clearTimeout(followTimer.current);
    const run = (framesLeft: number) => {
      const el = document.getElementById(`step-${id}`);
      if (!el) return;
      // Пока этап и карточка раскрываются, страница ещё короткая и прокрутка упрётся в её конец.
      if (framesLeft > 0 && !settled(el)) {
        followTimer.current = window.setTimeout(() => run(framesLeft - 1), 16);
        return;
      }
      // Прокрутка к началу карточки: у раскрытой высокой карточки «по центру» заголовок уходил за край экрана.
      if (opts.scroll === 'always' || !rowVisible(el)) {
        el.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
      el.querySelector<HTMLButtonElement>('.step-toggle')?.focus({ preventScroll: true });
    };
    followTimer.current = window.setTimeout(() => run(60), opts.delay);
  }, []);

  useEffect(() => () => window.clearTimeout(followTimer.current), []);

  // Переход по ссылке #/step/S3-05: раскрыть этап и шаг, прокрутить к нему.
  useEffect(() => {
    const step = focusStep && stepById.get(focusStep);
    if (!step || !steps.includes(step)) return;
    setStageOpen((o) => ({ ...o, [step.stage]: true }));
    setExpanded((e) => new Set(e).add(step.id));
    // Ждём, пока этап раскроется, иначе прокрутка промахнётся.
    reveal(step.id, { scroll: 'always', delay: reduceMotion() ? SETTLE_MS : COLLAPSE_MS });
  }, [focusStep, focusKey, steps, reveal]);

  const toggleStep = (id: string) => setExpanded((e) => {
    const next = new Set(e);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  /** Свернуть выполненный шаг и раскрыть следующий незакрытый. */
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

  /** «Отметить выполненным» в карточке: свернуть её и раскрыть следующий незакрытый шаг. */
  const completeInList = useCallback((id: string) => {
    setStep(id, 'done');
    advanceFrom(id, openAfter(steps, progress, id));
  }, [steps, progress, setStep, advanceFrom]);

  // Шаг выполнен в игре (RuneLite): то же, что кнопка в карточке, только отметку уже поставил мост.
  const seenAdvance = useRef(advance?.nonce);
  useEffect(() => {
    if (!advance || advance.nonce === seenAdvance.current) return;
    seenAdvance.current = advance.nonce;
    flashDone(`step-${advance.from}`);
    advanceFrom(advance.from, steps.find((s) => s.id === advance.to));
  }, [advance, steps, advanceFrom]);

  /** Из «Что делать сейчас» — только отметка: карточка сверху сама покажет следующий шаг. */
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
      <h1 className="visually-hidden">Путь</h1>

      {pending.length > 0 && (
        <section className="review-banner card" aria-labelledby="review-title">
          <h2 id="review-title" className="review-title">🔔 Обновление гайда до V2!</h2>
          <p>
            В {pending.length === 1 ? 'шаге' : 'шагах'} {pending.map((s) => s.id).join(', ')}, которые ты уже отметил, появились важные требования.
            Проверь их — возможно, в игре что-то пропущено. Очки квестов при сбросе не отнимаются.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={showChanges}>Показать что изменилось</button>
            <button type="button" className="btn" onClick={() => reactivate(pending.map((s) => s.id))}>Сбросить обновлённые шаги в активные</button>
            <button type="button" className="btn btn-ghost" onClick={() => review(pending.map((s) => s.id))}>Я всё проверил, скрыть</button>
          </div>
        </section>
      )}

      <section className="summary card" aria-label="Прогресс">
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Выполнено</span>
            <span className="stat-value">{Math.round((closed / steps.length) * 100)}%</span>
            <span className="stat-sub">{closed} из {steps.length} {plural(steps.length, 'шага', 'шагов', 'шагов')} · {mode === 'members' ? 'Members' : 'F2P'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Очки квестов</span>
            <span className="stat-value">{qp} <span className="stat-of">/ {maxQp}</span></span>
            <span className="stat-sub">
              {skippedQp.length
                ? `максимум ${reachable}: ${skippedQp.map((s) => s.id).join(', ')} пропущен`
                : threshold ? `${threshold.id} ждёт ${threshold.minQp}` : 'все пороги пройдены'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Этап</span>
            <span className="stat-value">{current} <span className="stat-of">/ {stages.length}</span></span>
            <span className="stat-sub">{stage.title}</span>
          </div>
        </div>
        <ProgressBar value={closed / steps.length} label="Выполнено шагов" />
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
