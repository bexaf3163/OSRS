import { describe, expect, it } from 'vitest';
import { allSteps, stepById } from '../src/data';
import stagesFile from '../src/data/questStages.json';
import zonesFile from '../src/data/dangerZones.json';
import { buildPlayerState } from '../src/lib/playerState';
import { createReadinessEngine } from '../src/lib/readinessEngine';
import { emptyProgress } from '../src/lib/progress';
import { nameKey, type OwnedItem, type OwnedState } from '../src/lib/checklist';
import { safetyBlockers, SAFETY, type PrepPlan } from '../src/lib/prepPlan';

// Dragon Slayer I (S5-01..S5-09): the stage data, the 32-QP gate, the shield check before the ship, the map pieces.

type Line = { k: string; at?: number[]; has?: string; need?: string; hl?: { npc?: number[]; obj?: number[] } };
type Quest = { var: [string, number]; stages: { at: number; do: Line[]; items?: { name: string; count?: number }[] }[] };
const quests = (stagesFile as unknown as { quests: Record<string, Quest> }).quests;
const linesOf = (id: string) => quests[id].stages.flatMap((s) => s.do);

const owned = (rows: Record<string, Partial<OwnedItem>>, bankSeen = true): OwnedState => {
  const items = new Map<string, OwnedItem>();
  for (const [name, o] of Object.entries(rows)) items.set(nameKey(name), { name, carried: 0, noted: 0, ...o });
  return { bankSeen, items };
};
const planFor = (id: string, rows: Record<string, Partial<OwnedItem>>, opts: { qp?: number; bankSeen?: boolean } = {}): PrepPlan => {
  const state = buildPlayerState({
    mode: 'f2p', stats: null, progress: { levels: {} }, owned: owned(rows, opts.bankSeen ?? true), gear: { equipment: [], inventory: [], coins: 600, bankCoins: 0 }, questsDone: null, connected: true,
  });
  return createReadinessEngine({ steps: allSteps, progress: emptyProgress(), qp: opts.qp ?? 44, mode: 'f2p', state }).plan(stepById.get(id)!);
};

describe('Dragon Slayer I: stage data', () => {
  it('all nine route steps have a stage table on the quest variable 176, with a key on every line', () => {
    for (let n = 1; n <= 9; n++) {
      const id = `S5-0${n}`;
      expect(quests[id], id).toBeTruthy();
      expect(quests[id].var, id).toEqual(['varp', 176]);
      for (const l of linesOf(id)) expect(l.k, `${id}: a line without a key`).toMatch(/^[A-Za-z0-9_.]{1,80}$/);
    }
  });

  it("Melzar's Maze: the key chain climbs the floors and goes down into the basement, plane by plane", () => {
    const lines = linesOf('S5-03');
    const plane = (k: string) => lines.find((l) => l.k === k)!.at![2];
    expect(['killRat', 'openRedDoor', 'goUpRatLadder'].map(plane)).toEqual([0, 0, 0]);
    expect(['killGhost', 'openOrangeDoor', 'goUpGhostLadder'].map(plane)).toEqual([1, 1, 1]);
    expect(['killSkeleton', 'openYellowDoor', 'goDownSkeletonLadder'].map(plane)).toEqual([2, 2, 2]);
    expect(['goDownLadderRoomLadder', 'goDownBasementEntryLadder'].map(plane)).toEqual([1, 0]);
    // The basement is plane 0 again, but 6000 tiles away in y: the arrow must not treat it as the ground floor.
    for (const k of ['killZombie', 'openBlueDoor', 'killMelzar', 'openMagntaDoor', 'killLesserDemon', 'openGreenDoor', 'openMelzarChest']) {
      expect(plane(k), k).toBe(0);
      expect(lines.find((l) => l.k === k)!.at![1], k).toBeGreaterThan(9600);
    }
    // The order of the doors: red, orange, yellow, blue, magenta, green.
    const doors = lines.filter((l) => /^open(Red|Orange|Yellow|Blue|Magnta|Green)Door$/.test(l.k)).map((l) => l.hl!.obj![0]);
    expect(doors).toEqual([2596, 2597, 2598, 2599, 2600, 2601]);
  });

  it('the three map parts merge into the Crandor map: counted in the bag, merged by the last Wormbrain line and again checked before Ned', () => {
    const wormbrain = linesOf('S5-05');
    expect(wormbrain[wormbrain.length - 1]).toMatchObject({ k: 'repairMap', has: 'Crandor map' });
    expect(linesOf('S5-07')[0]).toMatchObject({ k: 'repairMap', has: 'Crandor map' });
    const parts = quests['S5-07'].stages[0].items!.find((i) => i.name === 'Map part');
    expect(parts?.count).toBe(3);
    // The route steps finish on the same facts: Melzar's part, Thalzar's part, the merged map.
    const trigger = (id: string) => (stepById.get(id) as unknown as { inGame: { completionTrigger: { items: { names: string[]; id?: number }[] } } }).inGame.completionTrigger.items[0];
    expect(trigger('S5-03')).toMatchObject({ names: ['Map part'], id: 1535 });
    expect(trigger('S5-04')).toMatchObject({ names: ['Map part'], id: 1537 });
    expect(trigger('S5-05')).toMatchObject({ names: ['Crandor map'] });
  });

  it('the ship is repaired plank by plank, the Oracle door takes four items one by one, Wormbrain is paid', () => {
    expect(linesOf('S5-06').filter((l) => l.need === 'Plank').map((l) => l.k)).toEqual(['repairShip', 'repairShip2', 'repairShip3']);
    expect(linesOf('S5-04').filter((l) => l.need).map((l) => l.need)).toEqual(['Silk', 'Lobster pot', 'Unfired bowl', "Wizard's mind bomb"]);
    const text = (stepById.get('S5-05') as unknown as { quickSteps: string[] }).quickSteps.join(' ');
    expect(text).toMatch(/10,000/);
    expect(text).not.toMatch(/Telekinetic|Magic 33/);
  });

  it("Elvarg: the kill is led by Elvarg's head in the bag; the lair has a danger zone that only counts on S5-08 and goes quiet with the shield on", () => {
    expect(linesOf('S5-08').find((l) => l.k === 'killElvarg')!.has).toBe("Elvarg's head");
    const zones = (zonesFile as unknown as { zones: { id: string; onlySteps?: string[]; unlessWorn?: string[]; unlessHeld?: string[]; hud: string }[] }).zones;
    const lair = zones.find((z) => z.id === 'elvarg-lair')!;
    expect(lair.onlySteps).toEqual(['S5-08']);
    expect(lair.unlessWorn).toContain('Anti-dragon shield');
    expect(lair.hud).toContain('Anti-dragon shield');
    expect(zones.find((z) => z.id === 'crandor-boarding')!.unlessHeld).toContain('Anti-dragon shield');
  });
});

describe('Dragon Slayer I: the checks before the quest and before the ship', () => {
  it('32 quest points are the gate: 31 blocks the Guildmaster, 32 does not', () => {
    const blocked = planFor('S5-01', {}, { qp: 31 });
    expect(blocked.blockers.map((b) => b.label).join(' | ')).toMatch(/quest points|QP/i);
    expect(planFor('S5-01', {}, { qp: 32 }).blockers).toEqual([]);
  });

  it('boarding without the Anti-dragon shield is a hard block, in the bank it says so, in the bag or unknown it does not block', () => {
    const none = planFor('S5-08', { 'Anti-dragon shield': { carried: 0, bank: 0 } });
    const safety = (p: PrepPlan) => p.blockers.filter((b) => b.detail?.startsWith('Do not board'));
    expect(safety(none)).toHaveLength(1);
    const inBank = planFor('S5-08', { 'Anti-dragon shield': { carried: 0, bank: 1 } });
    expect(safety(inBank)[0].label).toMatch(/in the bank/);
    expect(safety(planFor('S5-08', { 'Anti-dragon shield': { carried: 1 } }))).toEqual([]);
    // The bank was never opened and the bag is not known: not checked is not missing.
    expect(safety(planFor('S5-08', {}, { bankSeen: false }))).toEqual([]);
  });

  it('the rule holds only for the voyage step, and any dragonfire shield satisfies it', () => {
    expect(Object.keys(SAFETY)).toEqual(['S5-08']);
    const line = (name: string, where: 'MISSING' | 'INVENTORY') => ({ name, where }) as never;
    expect(safetyBlockers('S5-07', [line('Anti-dragon shield', 'MISSING')])).toEqual([]);
    expect(safetyBlockers('S5-08', [line('Dragonfire shield', 'INVENTORY')])).toEqual([]);
    expect(safetyBlockers('S5-08', [line('Anti-dragon shield', 'MISSING')])).toHaveLength(1);
  });

  it('the recommended loadout is on the step: weapon, food, energy and strength potions', () => {
    const names = (stepById.get('S5-08') as unknown as { itemsRequired: { nameEn: string }[] }).itemsRequired.map((i) => i.nameEn);
    expect(names).toEqual(expect.arrayContaining(['Anti-dragon shield', 'Rune sword', 'Lobster', 'Strength potion(4)']));
  });
});

describe('the supporting F2P quests: Vampyre Slayer and Demon Slayer', () => {
  it('Count Draynor: stake, hammer and garlic are checked at the manor, each with its own warning, only while on the step', () => {
    const zones = (zonesFile as unknown as { zones: { id: string; onlySteps?: string[]; unlessHeld?: string[] }[] }).zones;
    const held = (id: string) => zones.find((z) => z.id === id)!;
    expect(held('draynor-manor-stake')).toMatchObject({ onlySteps: ['S2-08'], unlessHeld: ['Stake'] });
    expect(held('draynor-manor-hammer')).toMatchObject({ onlySteps: ['S2-08'], unlessHeld: ['Hammer'] });
    expect(held('draynor-manor-garlic')).toMatchObject({ onlySteps: ['S2-08'], unlessHeld: ['Garlic'] });
    const lines = quests['S2-08'].stages.flatMap((s) => s.do);
    expect(lines.find((l) => l.k === 'cGetGarlic')!.has).toBe('Garlic');
    expect(lines.find((l) => l.k === 'talkToHarlowAgain')).toMatchObject({ has: 'Stake', need: 'Beer' });
    expect(lines.find((l) => l.k === 'openCoffin')!.at).toEqual([3078, 9776, 0]);
  });

  it("Demon Slayer: the three keys are tracked and Delrith's incantation order is read in the game (varbits 2562..2566)", () => {
    const text = quests['S3-03'].stages.flatMap((s) => s.do).map((l) => l.k);
    expect(text).toEqual(expect.arrayContaining(['talkToRovin', 'useFilledBucketOnDrain', 'pickupSecondKey', 'talkToTraiborn', 'returnToPrysin', 'killDelrithStep']));
  });
});
