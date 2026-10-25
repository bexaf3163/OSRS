// A tracked leveling plan and the engine name one activity once (2.79.2): the guide step is linked to its catalogue method by what is trained, the card
// shows the followed method with this player's figures (XP and coins an hour), and every method listed carries the same summary.

import { describe, expect, it } from 'vitest';
import { guideFor } from '../src/data/skillGuideRegistry';
import { adviseTraining, methodOfGuideStep } from '../src/lib/trainingRouter';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { market } from './funding/market';

const step = (skill: string, title: string) => guideFor(skill as never).steps.find((s) => s.title === title)!;

describe('a guide step is the catalogue method that trains the same thing', () => {
  it('by the opponent for combat and by the object for gathering', () => {
    expect(methodOfGuideStep(step('strength', 'Giant frogs'))?.id).toBe('me-frog');
    expect(methodOfGuideStep(step('defence', 'Brutus'))?.id).toBe('me-brutus');
    expect(methodOfGuideStep(step('woodcutting', 'Oak trees'))?.id).toBe('wc-oak');
  });
  it('none when it cannot be told apart (every fishing spot is the same NPC)', () => {
    expect(methodOfGuideStep(step('fishing', 'Lobsters'))).toBeNull();
  });
});

describe('the followed method is shown with this player\'s figures', () => {
  // A connected fighter (levels and a worn weapon): the combat model rates every method, as in the live report (Brutus picked, the frogs followed).
  const levels = { attack: 30, strength: 30, defence: 30, hitpoints: 30 };
  const state = buildPlayerState({ mode: 'f2p', stats: levels as never, progress: { ...emptyProgress(), levels }, owned: { bankSeen: true, items: new Map() },
    gear: { equipment: [{ id: 1323, name: 'Iron scimitar', slot: 'weapon' }], inventory: [], coins: 0, bankCoins: 0 } as never, questsDone: [], connected: true });
  it('a followed method that is not the pick leads with its own XP and coins an hour; the pick stays the recommendation', () => {
    const plain = adviseTraining({ skill: 'strength', target: 40, state, mode: 'f2p', style: 'chill', priority: 'balanced', prices: market(), restriction: 'LIFTED' });
    const other = plain.others[0].method.id;
    const a = adviseTraining({ skill: 'strength', target: 40, state, mode: 'f2p', style: 'chill', priority: 'balanced', prices: market(), restriction: 'LIFTED', followed: other });
    expect(a.followed?.method.id).toBe(other);
    expect(a.followed?.reason).toMatch(/XP per hour for you/);
    expect(a.best?.method.id).toBe(plain.best?.method.id);
    expect(a.others.some((v) => v.method.id === other)).toBe(false);
  });
  it('every other method listed has the same kind of summary as the pick', () => {
    const a = adviseTraining({ skill: 'strength', target: 40, state, mode: 'f2p', style: 'chill', priority: 'balanced', prices: market(), restriction: 'LIFTED' });
    expect(a.best?.reason).toBe(a.reason);
    for (const v of a.others) expect(v.reason, v.method.id).toBeTruthy();
    // The frogs' Big bones are named with their coins an hour wherever the frogs are listed (the pick or another method).
    const frogs = [a.best!, ...a.others].find((v) => v.method.id === 'me-frog');
    expect(frogs?.reason).toMatch(/Big bones ≈ \+[\d,k]+ gp per hour/);
  });
  it('a followed method that is the pick itself is not repeated', () => {
    const pick = adviseTraining({ skill: 'strength', target: 40, state, mode: 'f2p', style: 'chill', priority: 'balanced' }).best!.method.id;
    expect(adviseTraining({ skill: 'strength', target: 40, state, mode: 'f2p', style: 'chill', priority: 'balanced', followed: pick }).followed).toBeNull();
  });
});
