// Orchestration only: the existing training, readiness and funding engines own every calculation.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useTrackedTraining } from './readinessContext';
import { useFunding, useFundingScreen, type FundingScreen } from './fundingContext';
import { useProfiles } from './lib/profiles';

const Ctx = createContext<FundingScreen | null>(null);
export const useTrainingFunding = () => useContext(Ctx);

export function TrainingSessionProvider({ children }: { children: ReactNode }) {
  const training = useTrackedTraining();
  const step = training && !training.complete ? training.step : null;
  // Keep the provider tree stable: starting/stopping a session must not discard open UI or draft input.
  const screen = useFundingScreen(step, step !== null);
  const funding = useFunding();
  const profiles = useProfiles();
  const attempted = useRef<string | null>(null);
  const a = screen.assessment;
  // A stage is a single session intent. Cancelling/pausing its money guide must not restart it on every state tick.
  const intent = step ? JSON.stringify([profiles.active, screen.snap?.character, step.id, step.trainingPhase]) : '';
  useEffect(() => {
    if (!step || a?.state === 'COVERED') { attempted.current = null; return; }
    if (!a || a.state !== 'SHORT' || !a.recommendation || !screen.snap?.connected || !screen.snap.character || funding.plan || attempted.current === intent) return;
    attempted.current = intent;
    funding.start(a, a.recommendation, screen.snap);
  }, [a, screen.snap, funding, intent, step]);
  return <Ctx.Provider value={step ? screen : null}>{children}</Ctx.Provider>;
}
