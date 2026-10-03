// План подготовки — в игру (протокол 6). Программа считает его для карточки «Что нужно» (prepPlan.ts); этот же план
// уходит плагину в общем снимке, и тот рисует процент готовности, «не бери сейчас», режим восстановления, совет про вес
// и сумку рядом со своим живым списком предметов. Ничего не рисует; при протоколе ниже 6 ничего не делает.

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

  // Шага в игре нет, шаг закрыт или плагин старый — плана в снимке нет.
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
    // payload пересчитывается каждую отрисовку — следим за содержимым через key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPrepPart]);
  return null;
}
