import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allSteps } from '../src/data';

// Items a quest itself hands out or the player gathers on the way: the route never buys them.
const QUEST_GIVEN = new Set(['Ghostspeak amulet', "Rat's tail", 'Burnt meat', 'Research package', 'Blurite ore', 'Stake', 'Karamjan rum',
  'Maze key', "Glarial's pebble", 'Khazard helmet', 'Khazard armour', 'Hangover cure', 'Picture', 'Red vine worm', 'Excalibur', 'Ecto-token',
  'Druid pouch', 'Silver sickle (b)', 'Dramen staff', 'Rotten tomato', 'Asgarnian ale', 'Raw karambwanji', 'Phoenix feather', 'Dusty key', 'Pet kitten', 'Bucket of slime', 'Nettle tea', 'Ogre bow', 'Ogre bellows', 'Silverlight', 'Ring of Charos', 'Catspeak amulet', 'Ice gloves', 'Boots of lightness', 'Ice arrows', 'Pigeon cage', 'Trowel', 'Specimen brush', 'Ammo mould']);

describe('route gate prices', () => {
  it('every item a route step or a training method asks for has a fixed gate price, so the route gate does not stop 25 minutes in', () => {
    const prices = JSON.parse(readFileSync('tests/fixtures/gePrices.json', 'utf8')).prices as Record<string, unknown>;
    const kit = (JSON.parse(readFileSync('src/data/authored/trainingMethods.json', 'utf8')) as { methods: { needs?: { type: string; name?: string }[] }[] }).methods
      .flatMap((m) => (m.needs ?? []).filter((n) => n.type === 'item').map((n) => n.name ?? ''));
    const missing = [...new Set([...allSteps.flatMap((s) => (s.itemsRequired ?? []).map((i) => i.nameEn)), ...kit])]
      .filter((name) => name !== 'Coins' && !prices[name] && !QUEST_GIVEN.has(name));
    expect(missing).toEqual([]);
  });
});
