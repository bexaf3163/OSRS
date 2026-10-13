// The one button that leads the game to the current action: the live line's own target while the game confirms the line, otherwise the step's target.

import { useState } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { isClosed } from '../lib/next-step';
import { toInGameTarget } from '../services/runeliteBridge';
import { IconChevron } from './Icons';
import { NavigateButton } from './NavigateButton';
import { useSubStep } from './SubStepHero';

export function ShowInGame({ step }: { step: Step }) {
  const { progress } = useStore();
  const { enabled, pointInGame, questInstruction, state, inGame, activeStepId } = useBridge();
  const sub = useSubStep(step);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const confirmed = state === 'online' && inGame && activeStepId === step.id && questInstruction?.stepId === step.id;
  if (isClosed(progress, step.id) || !enabled) return null;
  const show = async () => {
    setSending(true);
    const result = await pointInGame(step);
    setProblem(result === 'ok' ? '' : result === 'offline' ? 'RuneLite is offline. Target saved.' : 'No game target is available for this step.');
    setSending(false);
  };
  return (
    <>
      {confirmed && sub?.target
        ? <NavigateButton target={{ ...sub.target, stepId: step.id }} label="Show in game" className="modern-primary-nav" />
        : toInGameTarget(step) && <button type="button" className="btn btn-primary modern-show" disabled={sending} onClick={() => void show()}>{sending ? 'Sending…' : 'Show in game'} <IconChevron /></button>}
      {problem && <p className="small muted" role="status">{problem}</p>}
    </>
  );
}
