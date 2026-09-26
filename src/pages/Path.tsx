import { useEffect, useMemo, useState } from 'react';
import { MAX_QP, BASE_QP, stages, stagesData, stepById, steps } from '../data';
import { useStore } from '../store';
import { currentStage, isClosed } from '../lib/next-step';
import { reachableQuestPoints } from '../lib/qp';
import { Blocks } from '../components/Blocks';
import { NextStepCard } from '../components/NextStepCard';
import { ProgressBar } from '../components/ProgressBar';
import { StageSection } from '../components/StageSection';

export function PathPage({ focusStep, focusKey }: { focusStep?: string; focusKey: number }) {
  const { progress, qp } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [stageOpen, setStageOpen] = useState<Record<number, boolean>>({});

  const current = currentStage(steps, progress);
  const byStage = useMemo(() => new Map(stages.map((st) => [st.id, steps.filter((s) => s.stage === st.id)])), []);
  const closed = steps.filter((s) => isClosed(progress, s.id)).length;
  const reachable = reachableQuestPoints(steps, progress, BASE_QP);
  const skippedQp = steps.filter((s) => s.qp && progress.steps[s.id] === 'skipped');
  // Ближайший шаг, которому не хватает очков квестов: «S3-06 ждёт 12».
  const threshold = steps.find((s) => s.minQp !== undefined && s.minQp > qp && !isClosed(progress, s.id));

  const isStageOpen = (id: number) => stageOpen[id] ?? id === current;

  // Переход по ссылке #/step/S3-05: раскрыть этап и шаг, прокрутить к нему.
  useEffect(() => {
    const step = focusStep && stepById.get(focusStep);
    if (!step) return;
    setStageOpen((o) => ({ ...o, [step.stage]: true }));
    setExpanded((e) => new Set(e).add(step.id));
    const t = window.setTimeout(() => {
      const el = document.getElementById(`step-${step.id}`);
      el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el?.querySelector<HTMLButtonElement>('.step-toggle')?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [focusStep, focusKey]);

  const toggleStep = (id: string) => setExpanded((e) => {
    const next = new Set(e);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const stage = stages.find((s) => s.id === current)!;
  return (
    <div className="page">
      <h1 className="visually-hidden">Путь</h1>
      <section className="summary card" aria-label="Прогресс">
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Выполнено</span>
            <span className="stat-value">{Math.round((closed / steps.length) * 100)}%</span>
            <span className="stat-sub">{closed} из {steps.length} шагов</span>
          </div>
          <div className="stat">
            <span className="stat-label">Очки квестов</span>
            <span className="stat-value">{qp} <span className="stat-of">/ {MAX_QP}</span></span>
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

      <NextStepCard />

      <div className="stages">
        {stages.map((st) => (
          <StageSection key={st.id} stage={st} steps={byStage.get(st.id)!}
            open={isStageOpen(st.id)} current={st.id === current}
            onToggle={() => setStageOpen((o) => ({ ...o, [st.id]: !isStageOpen(st.id) }))}
            expanded={expanded} onToggleStep={toggleStep} />
        ))}
      </div>

      <details className="disclosure card">
        <summary>О маршруте</summary>
        <div className="prose"><Blocks blocks={stagesData.intro} /></div>
      </details>
    </div>
  );
}
