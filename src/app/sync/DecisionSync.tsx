// The game shows the committed Decision's step (v14). A step the player follows in the game stays until it closes; then, or
// when the game shows none, the Decision's open step is sent once. Nothing here ranks steps: the planner already chose.
import { useEffect, useMemo, useRef } from 'react';
import { decisionWatch } from '../../domain/planning/watch';
import { useBridge } from '../../state/bridge';
import { useStore } from '../../state/store';
import { decisionStep, useDecision } from '../../state/decision';
import { isClosed } from '../../domain/quests/next-step';

export function DecisionSync() {
  const { inGame, activeStepId, pointInGame, clear, setPrepPart } = useBridge();
  const { progress, steps } = useStore();
  const decision = useDecision();
  const step = decisionStep(decision, steps);
  const id = decision?.activeAction.id ?? null;
  const objectiveId = decision?.objectiveId ?? null;
  const watch = useMemo(() => decisionWatch(steps, progress), [steps, progress]);
  // The snapshot names the Decision it carries out, so the plugin can tell a superseded action from the current one.
  useEffect(() => { setPrepPart('decision', id && objectiveId ? { id, objectiveId, watch } : null); }, [id, objectiveId, watch, setPrepPart]);
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!inGame) { sent.current = null; return; }
    if (activeStepId !== null && !isClosed(progress, activeStepId)) return;
    if (!step || isClosed(progress, step.id)) {
      if (activeStepId !== null) void clear();
      return;
    }
    // Sent once per Decision step: a player who took the arrow down is not overridden by the same choice again.
    if (sent.current === step.id) return;
    sent.current = step.id;
    void pointInGame(step).then(result => { if (result === 'empty') void clear(); });
  }, [inGame, activeStepId, progress, step, pointInGame, clear]);
  return null;
}
