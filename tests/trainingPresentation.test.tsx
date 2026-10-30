import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdviceInput, TrainingAdvice } from '../src/lib/trainingRouter';
import type { TrackedSkill } from '../src/lib/skillTrack';
import type { PlayerState } from '../src/lib/playerState';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { TrainingCard } from '../src/components/TrainingCard';

const fixture = vi.hoisted(() => ({ advice: null as TrainingAdvice | null, mode: 'f2p' as 'f2p' | 'members',
  state: null as PlayerState | null, tracked: null as TrackedSkill | null, input: null as AdviceInput | null }));
vi.mock('../src/store', () => ({ useStore: () => ({ mode: fixture.mode }) }));
vi.mock('../src/bridge', () => ({ useBridge: () => ({ xp: null, xpRate: () => null }) }));
vi.mock('../src/playerStateContext', () => ({ usePlayerState: () => ({ state: fixture.state ?? {} }) }));
vi.mock('../src/lib/skillTrack', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/skillTrack')>(), useTracked: () => fixture.tracked,
}));
vi.mock('../src/lib/features', () => ({ useFeatures: () => ({}), setFeatures: vi.fn() }));
vi.mock('../src/lib/funding/usePriceView', () => ({ usePriceView: () => null }));
vi.mock('../src/lib/useTradeRestriction', () => ({ useTradeRestriction: () => ({ state: 'unknown' }) }));
vi.mock('../src/lib/trainingNav', () => ({ trainingNav: () => null }));
vi.mock('../src/lib/trainingRouter', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/trainingRouter')>(),
  adviseTraining: (input: AdviceInput) => { fixture.input = input; return fixture.advice; },
}));

function advice(): TrainingAdvice {
  // A newly declared method: presentation must not depend on catalogue IDs or names.
  const method = { id: 'new-compact-method', name: 'New method', where: 'Nearby bank', skills: ['attack'],
    xph: [1000, 2000], rateSource: 'model', lootPerHour: 500, costPerHour: 100,
    rateWarning: 'Aggressive enemies nearby', note: 'Extended method explanation', url: 'https://example.com',
    act: 'kill|kills', needs: [], kind: 'method', members: false, from: 1, to: null,
    xpa: 20, effort: 'low', cost: 'profit', risk: 'low' } as const;
  const best = { method, status: 'PREP', missing: [{ label: 'Food', state: 'MISSING' }],
    unchecked: [{ label: 'Bank supplies', state: 'UNKNOWN' }], fundingShortfall: 250,
    reason: 'Long explanation with calculations' };
  return { skill: 'attack', level: 10, target: 20, best, others: [{ ...best, method: { ...method, id: 'alternative', name: 'Alternative method' } }],
    quests: [], path: [{ method, fromLevel: 10, toLevel: 15 }, { method, fromLevel: 15, toLevel: 20 }],
    xpLeft: 1000, actionsLeft: 50, actionTarget: 15, time: null, reason: best.reason, style: 'chill' } as unknown as TrainingAdvice;
}

describe('compact skill recommendations without hiding required preparation', () => {
  it('the card uses the same restricted planning context as a followed F2P-only step', () => {
    const observed = buildPlayerState({ mode: 'members', connected: true, progress: emptyProgress(), stats: { woodcutting: 61 }, owned: null, gear: null, questsDone: null });
    fixture.advice = advice(); fixture.mode = 'members'; fixture.state = observed;
    fixture.tracked = { skill: 'woodcutting', mode: 'fast', freeOnly: true, target: 65 };
    try {
      renderToStaticMarkup(<TrainingCard skill="woodcutting" target={65} view="summary" />);
      expect(fixture.input?.mode).toBe('f2p');
      expect(fixture.input?.state).toEqual({ ...observed, mode: 'f2p' });
      expect(observed.mode).toBe('members');
    } finally { fixture.mode = 'f2p'; fixture.state = null; fixture.tracked = null; }
  });
  it('shows one method, estimates, risk, missing stock, unread stock and funding need without disclosures', () => {
    fixture.advice = advice();
    const html = renderToStaticMarkup(<TrainingCard skill="attack" target={20} view="summary" />);
    for (const text of ['New method', '1,000–2,000 XP/h', 'Loot ≈ 500 gp/h', 'Supplies ≈ 100 gp/h',
      'Aggressive enemies nearby', 'Food', 'Not checked: Bank supplies', '250 gp']) expect(html).toContain(text);
    for (const text of ['<details', 'Alternative method', 'Extended method explanation', 'Long explanation with calculations']) expect(html).not.toContain(text);
    expect(html.match(/aria-pressed=/g)).toHaveLength(3);
    expect(html).toContain('aria-pressed="true">Balanced');
  });

  it('keeps analysis accessible without duplicating recommendation controls', () => {
    fixture.advice = advice();
    const html = renderToStaticMarkup(<TrainingCard skill="attack" target={20} view="analysis" />);
    for (const text of ['Long explanation with calculations', 'Extended method explanation', 'Alternative method', 'Plan details']) expect(html).toContain(text);
    expect(html).not.toContain('aria-label="Training priority"');
    expect(html).not.toContain('<details');
  });

  it('retains the route card disclosure behaviour for callers using the original presentation', () => {
    fixture.advice = advice();
    const html = renderToStaticMarkup(<TrainingCard skill="attack" target={20} />);
    expect(html).toContain('<details');
    expect(html).toContain('Long explanation with calculations');
  });

  it('uses the followed plan preparation and warning instead of hiding it behind the recommendation', () => {
    const data = advice();
    data.followed = { ...data.best!, method: { ...data.best!.method, name: 'Followed method', rateWarning: 'Followed plan hazard' },
      missing: [{ ...data.best!.missing[0], label: 'Followed food' }], unchecked: [{ ...data.best!.unchecked[0], label: 'Followed bank' }] };
    fixture.advice = data;
    const html = renderToStaticMarkup(<TrainingCard skill="attack" target={20} view="summary" />);
    for (const text of ['Followed method', 'Followed plan hazard', 'Followed food', 'Followed bank']) expect(html).toContain(text);
  });

  it('never replaces an unknown level with an invented recommendation', () => {
    fixture.advice = { ...advice(), level: null };
    const html = renderToStaticMarkup(<TrainingCard skill="attack" target={20} view="summary" />);
    expect(html).toContain('Level not checked');
    expect(html).toContain('Reference');
    expect(html).not.toContain('New method');
  });

  it('labels unknown economics and retains high risk and manual setup in the compact view', () => {
    const data = advice();
    data.best!.method = { ...data.best!.method, lootPerHour: undefined, costPerHour: null, cost: 'cost',
      rateWarning: undefined, risk: 'high', manualSetup: 'Verify the safe position' };
    fixture.advice = data;
    const html = renderToStaticMarkup(<TrainingCard skill="attack" target={20} view="summary" />);
    for (const text of ['Earnings not estimated', 'Supply cost unknown', 'High-risk method', 'Verify the safe position']) expect(html).toContain(text);
    expect(html).not.toContain('0 gp/h');
  });
});
