import { Icon } from './icons';
import type { RouteStage, RouteStep } from './model';

const ROW_H = 44;

const nodeColor = (s: RouteStep) => (s.state === 'done' ? '#4f8f74' : s.state === 'current' ? '#c4512a' : s.state === 'locked' ? '#8a7a60' : '#e9dec2');
const rowClass = (s: RouteStep) => (s.state === 'done' ? 'la-done' : s.state === 'current' ? 'la-cur' : s.state === 'locked' ? 'la-locked' : '');
const STATE_TEXT: Record<RouteStep['state'], string> = { done: ', closed', current: ', you are here', locked: ', locked', todo: '' };

interface RoadProps {
  stages: RouteStage[];
  /** Completed chapters (by stage key) fold into a seal unless they are in this set. */
  unrolled: ReadonlySet<string>;
  /** Unrolls a folded chapter, or folds an unrolled complete one again. */
  onToggle: (stage: string) => void;
  onSelectStep: (step: RouteStep) => void;
}

/** The winding road of the route: chapters, a wavy path and one row per step. */
export function Road({ stages, unrolled, onToggle, onSelectStep }: RoadProps) {
  const globalIndex = new Map(stages.flatMap((s) => s.steps).map((x, i) => [x.id, i]));

  return (
    <ol className="la-roadlist" aria-label="Stages and steps">
      {stages.map((stage) => {
        const doneCount = stage.steps.filter((x) => x.state === 'done').length;
        const allDone = doneCount === stage.steps.length;
        const open = unrolled.has(stage.key);
        const inner = (
          <>
            <b>
              <i>{stage.id}</i>
            </b>
            <span>{stage.name.toUpperCase()}</span>
            <em>
              {doneCount} of {stage.steps.length}
            </em>
          </>
        );
        // A complete chapter's heading folds it back; an open chapter's heading is a plain title.
        const head = allDone && open ? (
          <button type="button" className={`la-stagehead la-fold ${stage.members ? 'la-members' : ''}`} aria-expanded title="Fold this chapter" onClick={() => onToggle(stage.key)}>
            {inner}
          </button>
        ) : (
          <div className={`la-stagehead ${stage.members ? 'la-members' : ''}`}>{inner}</div>
        );
        if (allDone && !open) {
          return (
            <li key={stage.id}>
              {head}
              <button type="button" className="la-seal6" aria-expanded={false} onClick={() => onToggle(stage.key)}>
                <Icon name="check" size={16} /> Chapter complete — {stage.steps.length} steps, {stage.steps.reduce((a, b) => a + b.qp, 0)} QP. <i>Unroll</i>
              </button>
            </li>
          );
        }

        const box = stage.steps.length * ROW_H;
        const points = stage.steps.map((x, i) => ({ x: 24 + 16 * Math.sin((globalIndex.get(x.id) ?? 0) * 0.95), y: i * ROW_H + 22, step: x }));
        let d = `M${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const my = (a.y + b.y) / 2;
          d += ` C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
        }

        return (
          <li key={stage.id}>
            {head}
            <div className="la-road" style={{ height: box }}>
              <svg width="64" height={box} aria-hidden="true">
                <path d={d} fill="none" stroke="#8a6d3a" strokeWidth="2" />
                {points.map(({ x, y, step }) =>
                  step.state === 'current' ? (
                    <g key={step.id}>
                      <circle cx={x} cy={y} r="14" fill="#c4512a30">
                        <animate attributeName="r" values="11;17;11" dur="2.4s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="9" fill={nodeColor(step)} stroke="#2b1d11" strokeWidth="1.5" />
                    </g>
                  ) : (
                    <g key={step.id}>
                      <circle cx={x} cy={y} r="7" fill={nodeColor(step)} stroke="#2b1d11" strokeWidth="1.5" />
                      {step.state === 'done' && <path d={`M${x - 3} ${y}l2 2 4-4`} stroke="#fff" strokeWidth="1.6" fill="none" />}
                    </g>
                  ),
                )}
              </svg>
              <ol className="la-rows">
                {stage.steps.map((x, i) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      id={`rail-${x.id}`}
                      className={`la-rrow ${rowClass(x)} ${x.selected ? 'la-sel' : ''}`}
                      style={{ top: i * ROW_H, paddingLeft: 64 }}
                      title={`${x.id} · ${x.name}`}
                      aria-current={x.selected ? 'step' : undefined}
                      onClick={() => onSelectStep(x)}
                    >
                      <span className="la-nm">{x.name}</span>
                      <span className="visually-hidden">{STATE_TEXT[x.state]}</span>
                      {x.state === 'current' && <span className="la-ypl" aria-hidden="true">YOU ARE HERE</span>}
                      {x.state === 'locked' && x.lock && (
                        <span className="la-m">
                          <Icon name="lock" size={12} /> {x.lock}
                        </span>
                      )}
                      <span className="la-qp">{x.kind === 'skill' ? 'SKILL' : x.qp ? `${x.qp} QP` : ''}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
