// "Also tracked": what belongs to the step but is not what the game's completion check measures (see lib/stepTasks.ts). Never blocks the step:
// the step's own tick, and "Keep for later", stay as they are. An unread state is "not checked", never "not done".

import type { Step } from '../types';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { taskKey, taskStatus, type TaskState } from '../lib/stepTasks';

const MARK: Record<TaskState, string> = { OK: '✓', OPEN: '○', MISSING: '✗', UNKNOWN: '?' };
const WORD: Record<TaskState, string> = { OK: 'done', OPEN: 'not ticked', MISSING: 'not yet', UNKNOWN: 'not checked' };

export function StepTasks({ step }: { step: Step }) {
  const { progress, setTaskDone } = useStore();
  const { state } = usePlayerState();
  if (!step.tasks?.length) return null;
  const rows = step.tasks.map((t) => {
    const key = taskKey(step.id, t.id);
    return { key, ticked: progress.tasksDone?.[key] === true, status: taskStatus(t, state, progress.tasksDone?.[key] === true) };
  });
  return (
    <section className="plaque step-tasks" aria-label="Also tracked for this step">
      <strong>Also tracked</strong>
      <ul className="small">
        {rows.map(({ key, ticked, status: s }) => (
          <li key={key}>
            <span aria-hidden="true">{MARK[s.state]}</span>{' '}
            {s.task.text}
            {s.task.qp ? <span className="badge"> +{s.task.qp} QP</span> : null}
            {' '}<span className="muted">({WORD[s.state]}{s.detail ? `: ${s.detail}` : ''}){s.task.why ? ` ${s.task.why}` : ''}</span>
            {(s.manual || s.state !== 'OK' || ticked) && (
              <>
                {' '}
                <label className="task-tick">
                  <input type="checkbox" checked={ticked} onChange={(e) => setTaskDone(key, e.target.checked)} /> I did it
                </label>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
