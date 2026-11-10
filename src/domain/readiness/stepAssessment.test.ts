import { describe, expect, it } from 'vitest';
import type { Step } from '../../types';
import { buildPlayerState } from '../player/playerState';
import { emptyProgress } from '../persistence/progress';
import { gearPieceByName } from '../combat/gearAdvisor';
import { createReadinessEngine } from './readinessEngine';
import { assessStepReadiness } from './stepAssessment';
import type { GearState } from '../../services/runeliteBridge';

const stats = { attack: 99, strength: 99, defence: 99, hitpoints: 99, magic: 99 };
const gear = { equipment: ['Rune scimitar', 'Rune full helm', 'Rune platebody', 'Rune platelegs', 'Rune kiteshield'].map(name => {
  const piece = gearPieceByName(name)!;
  return { name, id: piece.id, slot: piece.slot };
}), inventory: [{ id: 333, name: 'Trout', count: 20 }], coins: 5000, bankCoins: 0 };
const owned = { bankSeen: true, items: new Map([['trout', { name: 'Trout', carried: 20, bank: 0, noted: 0 }]]) };
const progress = emptyProgress();
function assess(name: string, worn: GearState = gear, levels: Partial<typeof stats> = stats) {
  // A new authored step inherits model boundaries without an ID-specific UI or planner exception.
  const step: Step = { id: 'S99-01', title: 'Synthetic encounter', type: 'quest', stage: 1, requires: [], doneWhen: 'Observed',
    foes: [name], itemsRequired: [{ nameEn: 'Trout', amount: 5, heals: 7, howToGet: '' }] };
  const state = buildPlayerState({ mode: 'f2p', connected: true, stats: levels, gear: worn, owned, progress, questsDone: [] });
  const engine = createReadinessEngine({ steps: [step], state, progress, mode: 'f2p', qp: 99 });
  return assessStepReadiness({ step, plan: engine.plan(step), connected: true, owned, stats: levels, gear: worn, view: null });
}

describe('shared combat capability boundaries', () => {
  it('does not certify regeneration, unmodelled attacks, alternate strategies or an unknown foe from ordinary kit checks', () => {
    // Count Draynor here is a step without the stake and hammer his killing blow needs: that is not his modelled fight.
    for (const name of ['Count Draynor', 'Lesser demon', 'Ancient Guardian', 'Synthetic new monster']) {
      const result = assess(name);
      expect(result.unassessedFights, name).toContain(name);
      expect(result.verdict.level, name).toBe('UNKNOWN');
      expect(result.verdict.reasons.some(reason => reason.group === 'unknown' && reason.text.includes(name)), name).toBe(true);
    }
  });
  it('assesses a fight whose mechanics are in the data: Elvarg behind the Anti-dragon shield, never without it', () => {
    const shielded = { ...gear, equipment: [...gear.equipment.filter(item => item.slot !== 'shield'), { id: 1540, name: 'Anti-dragon shield', slot: 'shield' }] };
    const result = assess('Elvarg', shielded);
    expect(result.unassessedFights).toEqual([]);
    expect(result.verdict.level).not.toBe('UNKNOWN');
    expect(result.verdict.reasons.some(reason => reason.text.startsWith('Elvarg: about'))).toBe(true);
    // Without the shield the safety rule blocks the step whatever the levels are.
    expect(['NOT_MET', 'PREP_NEEDED']).toContain(assess('Elvarg').verdict.level);
  });
  it('still assesses an ordinary supported encounter with observed levels and gear', () => {
    const result = assess('Black Knight');
    expect(result.unassessedFights).toEqual([]);
    expect(result.verdict.level).toBe('READY');
  });
  it('uses the same UNKNOWN boundary for unread worn bonuses and Magic defence', () => {
    const unknown = { ...gear, equipment: [...gear.equipment, { id: 999999, name: 'Synthetic unmodelled amulet', slot: 'amulet' }] };
    expect(assess('Black Knight', unknown).verdict.level).toBe('UNKNOWN');
    const { magic: _magic, ...unreadMagic } = stats;
    expect(assess('Ithoi the Navigator', gear, unreadMagic).verdict.level).toBe('UNKNOWN');
  });
});
