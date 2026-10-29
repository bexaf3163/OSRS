import { f2pAdviceFor, f2pAdviceLabel, F2P_PRIORITY_LABEL } from '../lib/f2pSkillAdvice';

export function F2pSkillNote({ skill, level }: { skill: string; level?: number }) {
  const advice = f2pAdviceFor(skill);
  if (!advice) return null;
  return <div className="f2p-skill-note">
    <p><strong>{f2pAdviceLabel(advice, level)}</strong> — {advice.reason}</p>
    <section className="small"><h3>F2P or members?</h3>
      <p>{F2P_PRIORITY_LABEL[advice.priority]}. {advice.comparison}</p>
      <p className="muted">Suggested checkpoint, not a cap or a replacement for your route. Reviewed 28 October 2026.</p>
      <p>{advice.sources.map((url, index) => <span key={url}>{index > 0 && ' · '}<a href={url} target="_blank" rel="noopener noreferrer">Wiki source {index + 1}</a></span>)}</p>
    </section>
  </div>;
}
