import { f2pAdviceFor, f2pAdviceLabel, f2pPhaseOf, F2P_PHASES } from '../../domain/training/f2pSkillAdvice';

/** The F2P checkpoint and why it stops there, in one line; the training card above gives the method and its rate. */
export function F2pSkillNote({ skill, level }: { skill: string; level?: number }) {
  const advice = f2pAdviceFor(skill);
  if (!advice) return null;
  return <p className="f2p-skill-note"><strong>{f2pAdviceLabel(advice, level)}</strong> — {F2P_PHASES[f2pPhaseOf(skill) - 1]?.label}. {advice.reason}</p>;
}
