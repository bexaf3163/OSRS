import { describe, expect, it } from 'vitest';
import { admitQuestObservation, parseQuestObservation } from './questObservation';

const good = () => ({ player: 'Fixture', sessionId: 'login-1', revision: 3, states: { quest: 'IN_PROGRESS' as const } });
describe('optional full quest observations', () => {
  it('keeps started, completed, unstarted and unread states distinct', () => {
    const raw = { ...good(), states: { a: 'NOT_STARTED', b: 'IN_PROGRESS', c: 'COMPLETED', d: 'UNKNOWN' } };
    expect(parseQuestObservation(raw)).toEqual(raw);
    expect(parseQuestObservation(undefined)).toBeNull();
    for (const bad of [{ revision: NaN }, { revision: -1 }, { states: { quest: 'STARTED_GUESSED' } }, { player: '' }, { sessionId: '' }, { states: [] }, { questPoints: -1 }, { questPoints: 501 }]) {
      expect(parseQuestObservation({ ...good(), ...bad })).toBeNull();
    }
    expect(parseQuestObservation({ ...raw, questPoints: 0 })?.questPoints).toBe(0);
  });
  it('rejects delayed character/login/revision events without erasing a newer observation', () => {
    const previous = good();
    expect(admitQuestObservation({ ...good(), revision: 2 }, previous, 'Fixture')).toBe(previous);
    expect(admitQuestObservation({ ...good(), player: 'Another' }, previous, 'Fixture')).toBe(previous);
    expect(admitQuestObservation({ ...good(), sessionId: 'old-login' }, previous, 'Fixture')).toBe(previous);
    expect(admitQuestObservation(null, previous, 'Fixture')).toBe(previous);
    const reconnect = { ...good(), sessionId: 'new-login', revision: 1 };
    expect(admitQuestObservation(reconnect, previous, 'Fixture', true)).toBe(reconnect);
    expect(admitQuestObservation(good(), previous, null)).toBeNull();
  });
});
