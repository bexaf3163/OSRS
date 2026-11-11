// The NPC a quest-stage line is about, by name, before the place dictionary is asked where it stands. Pure, so the data check
// (scripts/check/validate.ts) counts the same names the guide resolves (subStep.ts).
import type { QuestStage, QuestStageLine } from '../../types';

const TITLE = /^(Lady|Lord|King|Queen|Captain|Dr\.?|Sir)\s+/i;

/** Names to try, in order: the stage's NPC on a talking line, "Checkal:" in the short text, "Talk to Checkal" in the text; each also
 * without a title ("Captain Ned" → "Ned"). */
export function stageNpcCandidates(stage: Pick<QuestStage, 'go'>, line: Pick<QuestStageLine, 't' | 's'>): string[] {
  const out: string[] = [];
  if (typeof stage.go === 'string' && /talk|speak|ask|hassan|osman/i.test(line.t)) out.push(stage.go);
  const colon = /^([A-Z][\w'’. -]{2,28}):/.exec(line.s ?? '');
  const talk = /\b(?:Talk to|Speak to|Ask|Return to|Give [^.]*? to)\s+((?:[A-Z][\w'’.-]*\s?){1,3})/.exec(line.t);
  for (const name of [colon?.[1], talk?.[1]].flatMap((c) => (c ? [c.trim()] : []))) {
    out.push(name);
    const bare = name.replace(TITLE, '');
    if (bare !== name) out.push(bare);
  }
  return out;
}
