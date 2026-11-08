// The owner's word for a quest requirement the game cannot show (Shield of Arrav's partner). It appears only while the
// committed Decision waits on it; the tick is kept with the quest's tasks and the planner decides again.
import { useDecision } from '../../state/decision';
import { useStore } from '../../state/store';
import { questCatalogue } from '../../domain/planning/catalogue';
import { manualTaskKey } from '../../domain/planning/snapshot';

export function ManualConfirm() {
  const decision = useDecision();
  const { progress, setTaskDone } = useStore();
  const quest = decision?.activeAction.kind === 'MANUAL_WAIT' ? questCatalogue.find(q => q.id === decision.objectiveId) : undefined;
  const open = quest ? (quest.requirements.manual ?? []).filter(key => progress.tasksDone?.[manualTaskKey(quest, key)] !== true) : [];
  if (!quest || !open.length) return null;
  return (
    <div className="review-banner card">
      <p>{quest.id} needs your word on what the game cannot show: {open.join(', ')}.</p>
      <div className="actions">
        {open.map(key => <button key={key} type="button" className="btn btn-primary" onClick={() => setTaskDone(manualTaskKey(quest, key), true)}>I have the {key}</button>)}
      </div>
    </div>
  );
}
