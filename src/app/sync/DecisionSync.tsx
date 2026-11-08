// The game shows the committed Decision's step (v14). A step the player follows in the game stays while it belongs to the
// Decision's objective, or its quest has started, or the plugin confirms the player inside it; a leftover step of another
// quest, a closed one or none is replaced by the Decision's open step, sent once.
// Before 2.82.1 any open game step stayed, so a step left from the old route order outranked the planner.
import { useEffect, useMemo, useRef } from 'react';
import { decisionWatch } from '../../domain/planning/watch';
import { useBridge } from '../../state/bridge';
import { useStore } from '../../state/store';
import { decisionStep, followedSteps, useDecision } from '../../state/decision';
import { isClosed } from '../../domain/quests/next-step';

export function DecisionSync() {
  const { inGame, activeStepId, pointInGame, clear, setPrepPart, questStates, questInstruction } = useBridge();
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
    // The game keeps a step of the objective, a started quest or a confirmed position; a leftover step is replaced.
    if (activeStepId !== null && !isClosed(progress, activeStepId) && (activeStepId === step?.id || followedSteps(decision, activeStepId, questStates ?? null, questInstruction).has(activeStepId))) return;
    if (!step || isClosed(progress, step.id)) {
      if (activeStepId !== null) void clear();
      return;
    }
    // Sent once per Decision step: a player who took the arrow down is not overridden by the same choice again.
    if (sent.current === step.id) return;
    sent.current = step.id;
    void pointInGame(step).then(result => { if (result === 'empty') void clear(); });
  }, [inGame, activeStepId, progress, step, decision, questStates, questInstruction, pointInGame, clear]);
  return null;
}
