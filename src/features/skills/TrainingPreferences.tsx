// The build preference the engines cannot guess (moved here from Settings → Training in 2.93): whether Defence stays at 1. How methods
// are chosen (XP, Balanced, Money) is the skill card's own choice; requirements and safety checks never change with either.

import { setFeatures, useFeatures } from '../../state/hooks/useFeatures';
import { Eyebrow } from '../../ledger';

export function TrainingPreferences() {
  const features = useFeatures();
  return (
    <section className="training-prefs" aria-label="Training preferences">
      <Eyebrow>YOUR BUILD</Eyebrow>
      <label className="switch">
        <input type="checkbox" checked={features.keepDefenceOne} onChange={(e) => setFeatures({ keepDefenceOne: e.target.checked })} />
        <span>Keep Defence at 1</span>
      </label>
      <p className="small muted">A pure build: fight preparation never suggests Defence training.</p>
    </section>
  );
}
