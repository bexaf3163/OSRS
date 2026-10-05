import { describe, expect, it } from 'vitest';
import { etaMinutes, etaText, XpTracker } from '../src/lib/xpRate';
import { sessionSummary } from '../src/lib/session';
import { earlierUnverified, questKey, syncCandidates, withRequired } from '../src/lib/accountSync';
import { addProfile, defaultProfiles, gateAllows, linkPlayer, MAIN_ID, parseProfiles, profileFileName, profileGate, profileStorageKey, removeProfile, renameProfile } from '../src/lib/profiles';
import { parsePlayer, parsePos, parseQuests, parseXp } from '../src/services/runeliteBridge';
import { emptyProgress } from '../src/lib/progress';
import type { Step } from '../src/types';

describe('XpTracker', () => {
  it('the pace is counted by the gain, but not earlier than half a minute', () => {
    const t = new XpTracker();
    t.push({ woodcutting: 100 }, 0);
    t.push({ woodcutting: 200 }, 10_000);
    expect(t.rate('woodcutting')).toBeNull();
    t.push({ woodcutting: 400 }, 60_000);
    expect(t.rate('woodcutting')).toBe(18_000);
    expect(t.rate('fishing')).toBeNull();
  });
  it('after two minutes without gain the measurements are reset', () => {
    const t = new XpTracker();
    t.push({ mining: 0 }, 0);
    t.push({ mining: 500 }, 60_000);
    t.push({ mining: 500 }, 300_000);
    expect(t.rate('mining')).toBeNull();
  });
  it('less experience (another character) starts the measurements anew', () => {
    const t = new XpTracker();
    t.push({ attack: 5000 }, 0);
    t.push({ attack: 6000 }, 60_000);
    t.push({ attack: 10 }, 70_000);
    expect(t.rate('attack')).toBeNull();
  });
  it('the wait: minutes and text', () => {
    expect(etaMinutes(1000, 600)).toBe(100);
    expect(etaMinutes(0, 600)).toBeNull();
    expect(etaMinutes(10, null)).toBeNull();
    expect(etaText(25)).toBe('≈ 25 min');
    expect(etaText(80)).toBe('≈ 1 h 20 min');
    expect(etaText(120)).toBe('≈ 2 h');
  });
});

describe('sessionSummary', () => {
  const base = { startedAt: 0, levels0: { attack: 10 }, xp0: { attack: 1000, mining: 50 }, closed0: ['S1-01'] };
  it('counts the gain of experience, levels and new steps', () => {
    const s = sessionSummary(base, 15 * 60_000, { attack: 1300, mining: 50, cooking: 9 }, { attack: 12 }, ['S1-01', 'S1-02']);
    expect(s.minutes).toBe(15);
    expect(s.xpGained).toEqual([{ skill: 'attack', xp: 300, levels: 2 }]);
    expect(s.stepsDone).toBe(1);
  });
  it('without the starting experience there is no gain', () => {
    expect(sessionSummary({ ...base, xp0: null }, 1000, { attack: 5 }, null, []).xpGained).toEqual([]);
  });
});

describe('accountSync', () => {
  const quest = { id: 'Q1', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: "Cook's Assistant" } } } as unknown as Step;
  const withItems = { id: 'Q2', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Imp Catcher', items: [{ itemId: 1, quantity: 1 }] } } } as unknown as Step;
  const lvl = { id: 'L1', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 5 }] } } } as unknown as Step;
  it('a quest and levels from the game close steps, steps with items — do not', () => {
    const c = syncCandidates([quest, withItems, lvl], emptyProgress(), ['Cooks Assistant', 'Imp Catcher'], { attack: 5 });
    expect(c.map((x) => x.step.id)).toEqual(['Q1', 'L1']);
  });
  it('a level goal closes the step even when items are listed with it: the levels prove the training', () => {
    const train = { id: 'T1', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'mining', level: 15 }], items: [{ names: ['Copper ore'], count: 5 }] } } } as unknown as Step;
    expect(syncCandidates([train], emptyProgress(), [], { mining: 15 }).map((x) => x.step.id)).toEqual(['T1']);
    expect(syncCandidates([train], emptyProgress(), [], { mining: 14 })).toEqual([]);
  });
  it('earlier steps the game cannot confirm are offered, the ones it contradicts are not', () => {
    const none = { id: 'E1' } as unknown as Step;
    const items = { id: 'E2', inGame: { completionTrigger: { type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 20000 }] } } } as unknown as Step;
    const wrongQuest = { id: 'E3', inGame: { completionTrigger: { type: 'QUEST_COMPLETED', questName: 'Imp Catcher' } } } as unknown as Step;
    const lowLevel = { id: 'E4', inGame: { completionTrigger: { type: 'SKILL_LEVEL', levels: [{ skill: 'attack', level: 40 }] } } } as unknown as Step;
    const later = { id: 'E5' } as unknown as Step;
    const steps = [none, items, wrongQuest, lowLevel, quest, later];
    const confirmed = syncCandidates(steps, emptyProgress(), ['Cooks Assistant'], { attack: 5 });
    expect(confirmed.map((c) => c.step.id)).toEqual(['Q1']);
    // E5 comes after the furthest confirmed step, E3 and E4 are contradicted by the game.
    expect(earlierUnverified(steps, emptyProgress(), confirmed, ['Cooks Assistant'], { attack: 5 }).map((c) => c.step.id)).toEqual(['E1', 'E2']);
    // Nothing is offered without game data or without a confirmed step.
    expect(earlierUnverified(steps, emptyProgress(), confirmed, null, null)).toEqual([]);
    expect(earlierUnverified(steps, emptyProgress(), [], [], null)).toEqual([]);
    // A step the player closed by hand also counts as the frontier (E3, E4 and Q1 stay out: the game says they are not done).
    const p = { ...emptyProgress(), steps: { E5: 'done' as const } };
    expect(earlierUnverified(steps, p, [], [], { attack: 5 }).map((c) => c.step.id)).toEqual(['E1', 'E2']);
  });
  it('what is already closed and the unknown are not offered', () => {
    const p = { ...emptyProgress(), steps: { Q1: 'done' as const } };
    expect(syncCandidates([quest, lvl], p, [], { attack: 4 })).toEqual([]);
    expect(syncCandidates([quest], emptyProgress(), null, null)).toEqual([]);
    expect(questKey("Cook's Assistant")).toBe(questKey('cooks assistant'));
  });
  it('restoring: what a confirmed step requires is added, in route order, once, closed ones are skipped', () => {
    const mk = (id: string, requires: string[]) => ({ id, requires } as unknown as Step);
    const a = mk('A', []);
    const b = mk('B', ['A']);
    const c = mk('C', ['A', 'B']);
    const d = mk('D', ['C', 'MISSING']);
    const confirmed = [{ step: d, why: 'quest' }];
    expect(withRequired([a, b, c, d], confirmed, emptyProgress()).map((x) => x.step.id)).toEqual(['D', 'A', 'B', 'C']);
    const p = { ...emptyProgress(), steps: { B: 'done' as const } };
    // B is closed, but what B itself requires is still followed: A was needed for it.
    expect(withRequired([a, b, c, d], confirmed, p).map((x) => x.step.id)).toEqual(['D', 'A', 'C']);
    expect(withRequired([a, b, c, d], [], emptyProgress())).toEqual([]);
  });
});

describe('profiles', () => {
  it('broken — the default, "Main" is always there, the active one is from the list', () => {
    expect(parseProfiles('garbage')).toEqual(defaultProfiles());
    const s = parseProfiles(JSON.stringify({ active: 'none', list: [{ id: 'ab1', name: 'Second' }, { id: 'ab1', name: 'Duplicate' }, { id: '../x', name: 'Bad' }] }));
    expect(s.list.map((p) => p.id)).toEqual([MAIN_ID, 'ab1']);
    expect(s.active).toBe(MAIN_ID);
  });
  it('the Russian default names saved by older versions become the English defaults', () => {
    // The names are escapes on purpose: no Cyrillic stays in the sources.
    const old = (u: string) => u;
    const main = old('\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439');
    const second = old('\u041f\u0440\u043e\u0444\u0438\u043b\u044c');
    const s = parseProfiles(JSON.stringify({ active: 'main', list: [{ id: 'main', name: main }, { id: 'ab1', name: second }, { id: 'cd2', name: 'Alt' }] }));
    expect(s.list.map((p) => p.name)).toEqual(['Main', 'Profile', 'Alt']);
  });
  it('keys and files: the main one as before', () => {
    expect(profileStorageKey('osrs-put:progress', MAIN_ID)).toBe('osrs-put:progress');
    expect(profileStorageKey('osrs-put:progress', 'ab1')).toBe('osrs-put:progress:p:ab1');
    expect(profileFileName(MAIN_ID)).toBe('progress.json');
    expect(profileFileName('ab1')).toBe('progress-ab1.json');
  });
  it('creation, renaming, deletion', () => {
    const r = addProfile(defaultProfiles(), ' Second <b> ', 'Alt One')!;
    expect(r.state.list[1]).toMatchObject({ name: 'Second b', player: 'Alt One' });
    expect(renameProfile(r.state, r.id, '  ').list[1].name).toBe('Second b');
    expect(removeProfile({ ...r.state, active: r.id }, r.id).active).toBe(MAIN_ID);
    expect(removeProfile(r.state, MAIN_ID)).toBe(r.state);
  });
  it('gateway: unknown, binding, own, foreign, another profile', () => {
    const s0 = defaultProfiles();
    expect(profileGate(s0, null).kind).toBe('unknown');
    expect(profileGate(s0, 'Alpha').kind).toBe('link');
    const s1 = linkPlayer(s0, MAIN_ID, 'Alpha');
    expect(profileGate(s1, 'alpha').kind).toBe('ok');
    expect(profileGate(s1, 'Beta').kind).toBe('new');
    const s2 = addProfile(s1, 'Beta', 'Beta')!.state;
    const g = profileGate(s2, 'Beta');
    expect(g.kind).toBe('switch');
    expect([profileGate(s1, 'Beta'), g].map(gateAllows)).toEqual([false, false]);
    expect([profileGate(s0, null), profileGate(s1, 'Alpha'), profileGate(s0, 'A')].every(gateAllows)).toBe(true);
  });
});

describe('parsing the plugin data 2.12', () => {
  it('experience, quests, name, position — only within bounds', () => {
    expect(parseXp({ attack: 5, 'bad key': 3, mining: -1, magic: 1.5, fishing: 300_000_000 })).toEqual({ attack: 5 });
    expect(parseXp(null)).toBeNull();
    expect(parseQuests(['Rune Mysteries', 5, ''])).toEqual(['Rune Mysteries']);
    expect(parseQuests('x')).toBeNull();
    expect(parsePlayer('Mark One')).toBe('Mark One');
    expect(parsePlayer('Mark One')).toBe('Mark One');
    expect(parsePlayer('<script>')).toBeNull();
    expect(parsePlayer('toolongnamehere')).toBeNull();
    expect(parsePos({ x: 3200, y: 3200, plane: 0 })).toEqual({ x: 3200, y: 3200, plane: 0 });
    expect(parsePos({ x: 3200, y: 3200, plane: 9 })).toBeNull();
  });
});
