import { describe, expect, it } from 'vitest';
import { acknowledgeBankNotice, bankSessionNotice, parseBankSessions } from './bankSession';

const login = { characterId: 'profile-fixture', gameSessionId: 'login-1' };
describe('one bank refresh notice per verified login', () => {
  it('survives autosave/reload/reconnect and ordinary activity changes without another notice', () => {
    const first = bankSessionNotice({}, login, false);
    expect(first.show).toBe(true);
    let book = acknowledgeBankNotice(first.book, login);
    book = parseBankSessions(JSON.parse(JSON.stringify(book)));
    for (let i = 0; i < 1000; i++) {
      const again = bankSessionNotice(book, login, false);
      expect(again.show).toBe(false);
      expect(again.book).toBe(book);
    }
    expect(bankSessionNotice(book, { ...login, gameSessionId: 'login-2' }, false).show).toBe(true);
  });
  it('suppresses a read bank for the rest of the login while keeping profiles separate', () => {
    const read = bankSessionNotice({}, login, true);
    expect(read.show).toBe(false);
    expect(bankSessionNotice(read.book, login, false).show).toBe(false);
    expect(bankSessionNotice(read.book, { ...login, characterId: 'another-profile' }, false).show).toBe(true);
    expect(bankSessionNotice(read.book, null, false).show).toBe(false);
  });
  it('rejects malformed metadata and bounds retained profiles without storing bank holdings', () => {
    expect(parseBankSessions({ fixture: { sessionId: 'x', acknowledged: 'yes' } })).toEqual({});
    const raw = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`profile-${i}`, { sessionId: 'login', acknowledged: false, liveRead: false, items: ['must not copy'] }]));
    const parsed = parseBankSessions(raw);
    expect(Object.keys(parsed)).toHaveLength(32);
    expect(Object.values(parsed).every(entry => !('items' in entry))).toBe(true);
  });
});
