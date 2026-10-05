// The preparation plan — into the game (protocol 6). The app computes it for the "What you need" card (prepPlan.ts); the same plan
// goes to the plugin in the shared snapshot, and it draws the readiness percent, "do not take now", the recovery mode, advice about weight
// and the bag next to its live item list. It draws nothing; with a protocol below 6 it does nothing.

import { useEffect } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { isClosed } from '../lib/next-step';
import { useReadinessEngine } from '../readinessContext';
import { planPayload } from '../lib/prepEnvelope';
import { supportsSnapshot } from '../services/runeliteBridge';
import { useUpgradeRecommendation } from './UpgradePrompt';
import type { Step } from '../types';

export function PrepSync() {
  const { state, activeStepId, plugin, setPrepPart } = useBridge();
  const { steps, progress } = useStore();
  const step = activeStepId ? steps.find((s) => s.id === activeStepId) ?? null : null;
  const live = state === 'online' && supportsSnapshot(plugin?.protocol ?? null);
  const open = Boolean(step) && !isClosed(progress, step!.id);

  // There is no step in the game, the step is closed or the plugin is old — there is no plan in the snapshot.
  useEffect(() => {
    if (live && !open) setPrepPart('plan', null);
  }, [live, open, setPrepPart]);

  return live && step && open ? <StepPlan step={step} /> : null;
}

function StepPlan({ step }: { step: Step }) {
  const { setPrepPart } = useBridge();
  const profile = styleOf(useFeatures());
  const upgrade = useUpgradeRecommendation(step);
  const plan = useReadinessEngine().plan(step, { ahead: profile.lookAhead, upgrade });
  const payload = planPayload(plan);
  const key = JSON.stringify(payload);
  useEffect(() => {
    setPrepPart('plan', payload);
    // payload is recomputed on every render — we watch the content through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPrepPart]);
  return null;
}
