import { describe, expect, it } from 'vitest';
import { adviseTraining, formatHours, methodsFor, trainingMethods, viewMethod, type AdviceInput } from './trainingRouter';
import { buildPlayerState } from '../player/playerState';
import { preparationNeeds } from './trainingRouter';
import { emptyProgress } from '../persistence/progress';
import { xpForLevel } from '../player/xp';
import { allLevelSkills } from '../../data';

const levels = (l: Record<string, number> | null, owned: Record<string, { carried?: number; bank?: number }> | null = null, bankSeen = false) =>
  buildPlayerState({
    mode: 'members', stats: l, progress: emptyProgress(), gear: null, questsDone: null,
    owned: owned ? { bankSeen, items: new Map(Object.entries(owned).map(([n, v]) => [n.toLowerCase(), { name: n, carried: v.carried ?? 0, noted: 0, ...(v.bank !== undefined ? { bank: v.bank } : {}) }])) } : null,
  });
const advise = (over: Partial<AdviceInput> & Pick<AdviceInput, 'skill' | 'target'>) =>
  adviseTraining({ state: levels({ [over.skill]: 1 }), mode: 'members', ...over });

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
    const a = adviseTraining({ skill: 'fishing', target: 40, state: levels(null), mode: 'members' });
    expect(a.level).toBeNull();
    expect(a.best).toBeNull();
    expect(a.reason).toContain('Level unknown');
  });

  it('the goal is reached — "no need to train"', () => {
    const a = advise({ skill: 'fishing', target: 20, state: levels({ fishing: 25 }) });
    expect(a.best).toBeNull();
    expect(a.reason).toContain('already reached');
  });

  it('both styles retain manual alternatives without presenting unchecked Magic setups as the default', () => {
    const state = levels({ magic: 25 });
    const chill = advise({ skill: 'magic', target: 40, state, mode: 'f2p' });
    const fast = advise({ skill: 'magic', target: 40, state, mode: 'f2p', priority: 'fastest' });
    expect(chill.best?.method.id).toBe('ma-strike');
    expect(fast.best?.method.id).toBe('ma-strike');
    expect(chill.others.some(v => v.method.id === 'ma-splash' && v.unchecked.length > 0)).toBe(true);
    expect(fast.others.some(v => v.method.id === 'ma-alch' && v.unchecked.length > 0)).toBe(true);
    expect(chill.time).toBeNull();
    expect(fast.time).toBeNull();
  });

  it('at equal speed the calm one takes the quiet method, the efficient one — the later entry', () => {
    const state = levels({ mining: 35 });
    const base = { ...trainingMethods.find(m => m.id === 'mi-iron')!, to: null, needs: [], manualSetup: undefined,
      xph: [20000, 20000] as [number, number], cost: 'free' as const, risk: 'none' as const };
    const methods = [
      { ...base, id: 'synthetic-calm', from: 15, effort: 'afk' as const },
      { ...base, id: 'synthetic-later', from: 30, effort: 'high' as const },
    ];
    expect(advise({ skill: 'mining', target: 45, state, methods }).best?.method.id).toBe('synthetic-calm');
    expect(advise({ skill: 'mining', target: 45, state, methods, priority: 'fastest' }).best?.method.id).toBe('synthetic-later');
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
    const none = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 20 }, { 'Iron axe': { carried: 0, bank: 0 }, 'Bronze axe': { carried: 0, bank: 0 }, 'Steel axe': { carried: 0, bank: 0 }, 'Black axe': { carried: 0, bank: 0 } }, true), mode: 'f2p' });
    expect(none.best?.status).toBe('PREP');
    expect(none.best?.missing[0].label).toBe('Axe');
  });

  it('a quest that is missing closes the method: Monkfish without Swan Song — not the best', () => {
    const state = buildPlayerState({ mode: 'members', stats: { fishing: 70 }, progress: emptyProgress(), gear: null, owned: null, questsDone: ['Cook\'s Assistant'] });
    const m = trainingMethods.find((x) => x.id === 'fi-monk')!;
    expect(viewMethod(m, state).status).toBe('LOCKED');
    const a = adviseTraining({ skill: 'fishing', target: 80, state, mode: 'members', priority: 'fastest' });
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
    expect(a.path.filter((l, i) => i === 0 || l.method.id !== a.path[i - 1].method.id).map(l => l.method.id)).toEqual(['wc-tree', 'wc-oak']); // Dropped logs: oaks beat willows until 60 (OSRS Wiki, F2P Woodcutting training).
    expect(a.path.some(l => l.fromLevel === 21)).toBe(true); // Mithril axe review, even when the tree stays the same.
  });

  it('"how many more actions" — by the exact experience per action', () => {
    const a = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 15 }), mode: 'f2p' });
    expect(a.best?.method.id).toBe('wc-oak');
    expect(a.actionTarget).toBe(21);
    expect(a.actionsLeft).toBe(Math.ceil((xpForLevel(21) - xpForLevel(15)) / 37.5));
    // If the experience is known exactly, we count from it.
    const b = advise({ skill: 'woodcutting', target: 30, state: levels({ woodcutting: 15 }), mode: 'f2p', xp: xpForLevel(15) + 1000 });
    expect(b.actionsLeft).toBe(Math.ceil((xpForLevel(21) - xpForLevel(15) - 1000) / 37.5));
  });

  it('time: by the player\'s measurements exactly; without measurements — a range "by the wiki"; no speed — no time', () => {
    // One axe tier (adamant, 31-40): a later tier would make the plan a forecast with the planned axe.
    const state = levels({ woodcutting: 31 });
    const measured = advise({ skill: 'woodcutting', target: 40, state, mode: 'f2p', measuredXph: 20_000 });
    expect(measured.time?.source).toBe('measured');
    expect(measured.time?.minHours).toBeCloseTo((xpForLevel(40) - xpForLevel(31)) / 20_000);
    const wiki = advise({ skill: 'woodcutting', target: 40, state, mode: 'f2p' });
    expect(wiki.time?.source).toBe('wiki');
    expect(wiki.time!.minHours).toBeLessThan(wiki.time!.maxHours);
    expect(formatHours(wiki.time!)).toMatch(/^about/);
    expect(formatHours(measured.time!)).toMatch(/^≈/);
    // A new method with an action value but no verified rate must not inherit another recipe's speed.
    const unknown = { ...trainingMethods.find((m) => m.id === 'ck-wine')!, id: 'synthetic-unrated-recipe', xph: null };
    const none = advise({ skill: 'cooking', target: 45, state: levels({ cooking: 40 }), mode: 'f2p', methods: [unknown] });
    expect(none.time).toBeNull();
    expect(none.actionsLeft).not.toBeNull();
  });

  it('one-off quests — separately from methods', () => {
    const a = advise({ skill: 'prayer', target: 9, state: levels({ prayer: 1 }), mode: 'f2p' });
    expect(a.quests.map((q) => q.id)).toContain('pr-ghost');
    expect(a.best?.method.kind).toBe('method');
  });
});

describe('a level-up does not flip the running method for a marginal gain (S04)', () => {
  const base = (id: string) => trainingMethods.find((m) => m.id === id)!;
  // Fresh ids keep the synthetic speeds: the live rate model only re-rates catalogue methods it knows.
  const oak = { ...base('wc-oak'), id: 'test-slow', xph: [20_000, 25_000] as [number, number] };
  const willow = (low: number) => ({ ...base('wc-willow'), id: 'test-fast', xph: [low, low + 5_000] as [number, number] });
  const run = (next: ReturnType<typeof willow>) => advise({ skill: 'woodcutting', target: 45, followed: 'test-slow', methods: [oak, next], priority: 'balanced',
    state: levels({ woodcutting: 30 }, { 'Steel axe': { carried: 1 } }, true) });

  it('keeps the running method when the new one is only slightly faster', () => {
    expect(run(willow(22_000)).best?.method.id).toBe('test-slow');
    // Without a running method the same 10% gain does win, so the margin is what keeps it.
    expect(advise({ skill: 'woodcutting', target: 45, methods: [oak, willow(22_000)], priority: 'balanced', state: levels({ woodcutting: 30 }, { 'Steel axe': { carried: 1 } }, true) }).best?.method.id).toBe('test-fast');
  });

  it('switches with an explanation when the new one is materially faster', () => {
    const advice = run(willow(40_000));
    expect(advice.best?.method.id).toBe('test-fast');
    expect(advice.best?.reason).toContain('Switched from');
  });
});

describe('melee training at level 1 (fresh-account simulation, 2.86.1)', () => {
  const fresh = (worn: string, carried: string) => buildPlayerState({ mode: 'f2p', connected: true, player: 'Fresh', progress: emptyProgress(), questsDone: [],
    stats: { attack: 1, strength: 1, defence: 1, hitpoints: 10 },
    owned: { bankSeen: true, items: new Map([[carried.toLowerCase(), { name: carried, carried: 1, bank: 0, noted: 0 }], [worn.toLowerCase(), { name: worn, carried: 0, bank: 0, noted: 0 }]]) },
    gear: { equipment: [{ id: worn === 'Iron scimitar' ? 1323 : 1265, name: worn, slot: 'weapon' }], inventory: [{ id: 1, name: carried, count: 1 }], coins: 0, bankCoins: 0 } });
  it('keeps the better weapon whichever of the two is worn: a worn piece is owned, so no Equip loop between them', () => {
    for (const [worn, carried] of [['Iron scimitar', 'Bronze pickaxe'], ['Bronze pickaxe', 'Iron scimitar']] as const) {
      const state = fresh(worn, carried);
      const advice = adviseTraining({ skill: 'attack', target: 12, state, mode: 'f2p', priority: 'balanced' });
      const weapons = preparationNeeds(advice, state).flatMap(n => n.type === 'item' && n.equip ? [n.name] : []);
      expect(weapons, worn).toEqual(['Iron scimitar']);
    }
  });
  it('locks an opponent that is unsafe at this Hitpoints level instead of ranking it as an unrated method', () => {
    const state = fresh('Iron scimitar', 'Bronze pickaxe');
    const moss = methodsFor('strength').find(m => m.id === 'me-moss')!;
    const view = viewMethod(moss, state);
    expect(view.status).toBe('LOCKED');
    expect(view.missing.map(n => n.label).join(' ')).toMatch(/^More Hitpoints: Moss giant/);
    expect(adviseTraining({ skill: 'strength', target: 7, state, mode: 'f2p', priority: 'balanced' }).best?.method.id).not.toBe('me-moss');
  });
});

