import { describe, expect, it } from 'vitest';
import { stepById } from '../src/data';
import { buildPlayerState } from '../src/lib/playerState';
import { emptyProgress } from '../src/lib/progress';
import { evaluatePreflight, nameKey, preflightItems } from '../src/lib/checklist';
import { contextOf } from '../src/lib/readiness';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import type { GearItem } from '../src/services/runeliteBridge';

const step = { ...stepById.get('S6-02')!, id: 'TEST-AMMO', requirements: [], itemsRecommended: [],
  itemsRequired: [{ nameEn: 'Bronze arrow', wikiItemId: 882, amount: 100, equip: true, howToGet: 'Equip a starter stack.' }] };
function scenario(worn: GearItem[] | null, carried = 100, bank = 0) {
  const progress = emptyProgress();
  const owned = { bankSeen: true, items: new Map([[nameKey('Bronze arrow'), { name: 'Bronze arrow', carried, noted: 0, bank }]]) };
  const gear = { equipment: worn, inventory: [], coins: 1000, bankCoins: 0 };
  const state = buildPlayerState({ mode: 'f2p', stats: { ranged: 1 }, progress, gear, owned, questsDone: [], connected: true });
  const engine = createReadinessEngine({ ...contextOf({ step, steps: [step], progress, mode: 'f2p', qp: 100, gear, owned, stats: { ranged: 1 } }), state });
  return { state, engine, preflight: evaluatePreflight(preflightItems(step), owned, { ranged: 1 }, worn) };
}
const arrows = (count?: number): GearItem => ({ id: 882, name: 'Bronze arrow', slot: 'ammo', ...(count === undefined ? {} : { count }) });

describe('equipped stack quantities use the same requirement in every consumer', () => {
  it('one worn arrow does not satisfy a hundred-arrow requirement', () => {
    const s = scenario([arrows(1)]);
    expect(s.engine.readiness(step).status).not.toBe('READY');
    expect(s.engine.plan(step).now[0]).toMatchObject({ where: 'INVENTORY', equip: true, action: { kind: 'UPGRADE' } });
    expect(s.preflight.rows[0]).toMatchObject({ have: 1, state: 'NOT_EQUIPPED' });
  });
  it.each([100, 150])('%s worn arrows satisfy the actual stack count', count => {
    const s = scenario([arrows(count)], count);
    expect(s.engine.readiness(step).status).toBe('READY');
    expect(s.engine.plan(step).lines.find(l => l.name === 'Bronze arrow')).toMatchObject({ where: 'EQUIPPED', have: { equipped: count } });
    expect(s.preflight.rows[0]).toMatchObject({ have: count, state: 'IN_BAG_READY' });
  });
  it('a legacy worn item without its stack count stays unknown for a larger quantity', () => {
    const s = scenario([arrows()]);
    expect(s.engine.readiness(step).requirements.find(r => r.kind === 'item')?.state).toBe('UNKNOWN');
    expect(s.engine.plan(step).now[0].where).toBe('UNKNOWN');
    expect(s.preflight.rows[0].state).toBe('UNKNOWN');
  });
  it('an unread equipment container cannot prove absence or readiness', () => {
    const s = scenario(null);
    expect(s.engine.readiness(step).requirements.find(r => r.kind === 'item')?.state).toBe('UNKNOWN');
    expect(s.engine.plan(step).now[0].where).toBe('UNKNOWN');
    expect(s.preflight.rows[0].state).toBe('UNKNOWN');
  });
  it('equipment count changes invalidate the canonical fingerprint even before OWNED changes', () => {
    expect(scenario([arrows(1)]).state.fingerprint).not.toBe(scenario([arrows(100)]).state.fingerprint);
  });
  it('a confirmed shortage cannot become ready just because some ammunition is worn', () => {
    const s = scenario([arrows(5)], 5);
    expect(s.engine.readiness(step).requirements.find(r => r.kind === 'item')?.state).toBe('PARTIAL');
    expect(s.engine.plan(step).lines.find(l => l.name === 'Bronze arrow')?.where).not.toBe('EQUIPPED');
    expect(s.preflight.ready).toBe(false);
  });
});
