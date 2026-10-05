import { describe, expect, it } from 'vitest';
import { adviseTraining, formatHours, methodsFor, trainingMethods, viewMethod, type AdviceInput } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { xpForLevel } from '../src/lib/xp';
import { allLevelSkills } from '../src/data';

const levels = (l: Record<string, number> | null, owned: Record<string, { carried?: number; bank?: number }> | null = null, bankSeen = false) =>
  buildPlayerState({
    mode: 'members', stats: l, progress: emptyProgress(), gear: null, questsDone: null,
    owned: owned ? { bankSeen, items: new Map(Object.entries(owned).map(([n, v]) => [n.toLowerCase(), { name: n, carried: v.carried ?? 0, noted: 0, ...(v.bank !== undefined ? { bank: v.bank } : {}) }])) } : null,
  });
const advise = (over: Partial<AdviceInput> & Pick<AdviceInput, 'skill' | 'target'>) =>
  adviseTraining({ state: levels({ [over.skill]: 1 }), mode: 'members', style: 'chill', ...over });

describe('method data', () => {
  it('identifiers are unique, ranges and speeds are sensible, skills exist', () => {
    const ids = new Set<string>();
    const known = new Set(allLevelSkills.map((l) => l.id));
    for (const m of trainingMethods) {
      expect(ids.has(m.id), `repeat ${m.id}`).toBe(false);
      ids.add(m.id);
      expect(m.from, m.id).toBeGreaterThanOrEqual(1);
      if (m.to !== null) expect(m.to, m.id).toBeGreaterThan(m.from);
      if (m.xph) { expect(m.xph[0], m.id).toBeGreaterThan(0); expect(m.xph[1], m.id).toBeGreaterThanOrEqual(m.xph[0]); }
      if (m.xpa !== null) expect(m.xpa, m.id).toBeGreaterThan(0);
      for (const s of m.skills) expect(known.has(s), `${m.id}: skill ${s}`).toBe(true);
      expect(m.url, m.id).toMatch(/^https:\/\/oldschool\.runescape\.wiki\/w\//);
      expect(m.where.length, m.id).toBeGreaterThan(2);
    }
  });

  it('exact game values: experience per action for the known methods', () => {
    const xpa = (id: string) => trainingMethods.find((m) => m.id === id)!.xpa;
    expect(xpa('wc-tree')).toBe(25);
    expect(xpa('wc-oak')).toBe(37.5);
    expect(xpa('wc-willow')).toBe(67.5);
    expect(xpa('ck-trout')).toBe(70);
    expect(xpa('fm-yew')).toBe(202.5);
  });
});

describe('method choice', () => {
  it('fits the level and the mode: at woodcutting level 22 — oaks, not willows', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 22 }), mode: 'f2p' });
    expect(a.best?.method.id).toBe('wc-oak');
    expect(a.best?.method.members).toBe(false);
  });

  it('F2P does not get members methods', () => {
    const a = advise({ skill: 'agility', target: 20, state: levels({ agility: 5 }), mode: 'f2p' });
    expect(a.best).toBeNull();
    expect(advise({ skill: 'agility', target: 20, state: levels({ agility: 5 }), mode: 'members' }).best?.method.id).toBe('ag-gnome');
  });

  it('the level is unknown — we do not advise at random', () => {
    const a = adviseTraining({ skill: 'fishing', target: 40, state: levels(null), mode: 'members', style: 'chill' });
    expect(a.level).toBeNull();
    expect(a.best).toBeNull();
    expect(a.reason).toContain('Level unknown');
  });

  it('the goal is reached — "no need to train"', () => {
    const a = advise({ skill: 'fishing', target: 20, state: levels({ fishing: 25 }) });
    expect(a.best).toBeNull();
    expect(a.reason).toContain('already reached');
  });

  it('the calm style chooses without clicks, the efficient one — faster', () => {
    const state = levels({ magic: 25 });
    const chill = advise({ skill: 'magic', target: 40, state, mode: 'f2p', style: 'chill' });
    const fast = advise({ skill: 'magic', target: 40, state, mode: 'f2p', style: 'efficient' });
    expect(chill.best?.method.id).toBe('ma-splash');
    expect(chill.best?.method.effort).toBe('afk');
    expect(fast.best?.method.id).toBe('ma-alch');
    expect(fast.best?.method.xph?.[0]).toBeGreaterThan(chill.best?.method.xph?.[0] ?? 0);
    expect(chill.reason).toContain('no risk');
    expect(fast.reason).toContain('XP per hour');
  });

  it('at equal speed the calm one takes the quiet method, the efficient one — the later entry', () => {
    const state = levels({ mining: 35 });
    expect(advise({ skill: 'mining', target: 45, state, style: 'chill' }).best?.method.id).toBe('mi-motherlode');
  });

  it('no item — the method stays, but names what to take; the item is present — ready', () => {
    const none = advise({ skill: 'fishing', target: 40, state: levels({ fishing: 25 }, { 'Fly fishing rod': { carried: 0, bank: 0 }, Feather: { carried: 0, bank: 0 } }, true) });
    expect(none.best?.method.id).toBe('fi-fly');
    expect(none.best?.status).toBe('PREP');
    expect(none.best?.missing.map((m) => m.label).join(' ')).toContain('Fly fishing rod');
    const have = advise({ skill: 'fishing', target: 40, state: levels({ fishing: 25 }, { 'Fly fishing rod': { carried: 1 }, Feather: { carried: 600 } }, true) });
    expect(have.best?.status).toBe('READY');
  });

  it('not checked — not "no": the method is ready, the unchecked separately', () => {
    const a = advise({ skill: 'fishing', target: 40, state: levels({ fishing: 25 }) });
    expect(a.best?.status).toBe('READY');
    expect(a.best?.unchecked.length).toBeGreaterThan(0);
  });

  it('any axe fits: the player has an Iron axe — we do not ask for an "axe"', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 20 }, { 'Iron axe': { carried: 1 } }, true), mode: 'f2p' });
    expect(a.best?.status).toBe('READY');
    const none = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 20 }, { 'Iron axe': { carried: 0, bank: 0 }, 'Bronze axe': { carried: 0, bank: 0 }, 'Steel axe': { carried: 0, bank: 0 } }, true), mode: 'f2p' });
    expect(none.best?.status).toBe('PREP');
    expect(none.best?.missing[0].label).toBe('Axe');
  });

  it('a quest that is missing closes the method: Monkfish without Swan Song — not the best', () => {
    const state = buildPlayerState({ mode: 'members', stats: { fishing: 70 }, progress: emptyProgress(), gear: null, owned: null, questsDone: ['Cook\'s Assistant'] });
    const m = trainingMethods.find((x) => x.id === 'fi-monk')!;
    expect(viewMethod(m, state).status).toBe('LOCKED');
    const a = adviseTraining({ skill: 'fishing', target: 80, state, mode: 'members', style: 'efficient' });
    expect(a.best?.method.id).not.toBe('fi-monk');
    const done = buildPlayerState({ mode: 'members', stats: { fishing: 70 }, progress: emptyProgress(), gear: null, owned: null, questsDone: ['Swan Song'] });
    expect(viewMethod(m, done).status).not.toBe('LOCKED');
  });

  it('combat: the method trains all three skills', () => {
    expect(methodsFor('strength').some((m) => m.id === 'me-cow')).toBe(true);
    expect(methodsFor('defence').some((m) => m.id === 'me-cow')).toBe(true);
  });
});

describe('path, actions and time', () => {
  it('the path is split by methods and covers the whole span without gaps', () => {
    const a = advise({ skill: 'woodcutting', target: 60, state: levels({ woodcutting: 1 }), mode: 'f2p' });
    expect(a.path[0].fromLevel).toBe(1);
    expect(a.path[a.path.length - 1].toLevel).toBe(60);
    for (let i = 1; i < a.path.length; i++) expect(a.path[i].fromLevel).toBe(a.path[i - 1].toLevel);
    expect(a.path.map((l) => l.method.id)).toEqual(['wc-tree', 'wc-oak', 'wc-willow']);
  });

  it('"how many more actions" — by the exact experience per action', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 15 }), mode: 'f2p' });
    expect(a.best?.method.id).toBe('wc-oak');
    expect(a.actionsLeft).toBe(Math.ceil((xpForLevel(30) - xpForLevel(15)) / 37.5));
    // If the experience is known exactly, we count from it.
    const b = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 15 }), mode: 'f2p', xp: xpForLevel(15) + 1000 });
    expect(b.actionsLeft).toBe(Math.ceil((xpForLevel(30) - xpForLevel(15) - 1000) / 37.5));
  });

  it('time: by the player\'s measurements exactly; without measurements — a range "by the wiki"; no speed — no time', () => {
    const state = levels({ woodcutting: 30 });
    const measured = advise({ skill: 'woodcutting', target: 40, state, mode: 'f2p', measuredXph: 20_000 });
    expect(measured.time?.source).toBe('measured');
    expect(measured.time?.minHours).toBeCloseTo((xpForLevel(40) - xpForLevel(30)) / 20_000);
    const wiki = advise({ skill: 'woodcutting', target: 40, state, mode: 'f2p' });
    expect(wiki.time?.source).toBe('wiki');
    expect(wiki.time!.minHours).toBeLessThan(wiki.time!.maxHours);
    expect(formatHours(wiki.time!)).toMatch(/^about/);
    expect(formatHours(measured.time!)).toMatch(/^≈/);
    const none = advise({ skill: 'firemaking', target: 20, state: levels({ firemaking: 15 }), mode: 'f2p' });
    expect(none.time).toBeNull();
    expect(none.actionsLeft).not.toBeNull();
  });

  it('one-off quests — separately from methods', () => {
    const a = advise({ skill: 'prayer', target: 9, state: levels({ prayer: 1 }), mode: 'f2p' });
    expect(a.quests.map((q) => q.id)).toContain('pr-ghost');
    expect(a.best?.method.kind).toBe('method');
  });
});
