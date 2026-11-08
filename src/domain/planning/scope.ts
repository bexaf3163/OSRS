import type { CommittedDecision, DecisionScope } from './contracts';

export type DecisionStamp = Pick<CommittedDecision, keyof DecisionScope | 'revision'>;

export function sameSession(a: DecisionScope, b: DecisionScope): boolean {
  return a.characterId === b.characterId && a.mode === b.mode && a.gameSessionId === b.gameSessionId;
}
/** Guard success and failure continuations alike; an older snapshot is not current even within the same login. */
export function acceptsDecision(current: DecisionScope, candidate: DecisionScope): boolean {
  return sameSession(current, candidate) && current.snapshotRevision === candidate.snapshotRevision;
}

/** Owner intent may change without a new game event. Async results must also belong to the current commitment. */
export function acceptsCommit(current: DecisionStamp | null, candidate: DecisionStamp): boolean {
  return current !== null && acceptsDecision(current, candidate) && current.revision === candidate.revision;
}
