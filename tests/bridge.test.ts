import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { allSteps, stepsFor } from '../src/data';
import { emptyProgress, withStep } from '../src/lib/progress';
import { ownedText, triggerText } from '../src/lib/triggers';
import {
  APP_PROTOCOL, backoffMs, BRIDGE_PATHS, checkStatus, clearActiveStep, connectEvents, missingWithPlugin, parseEvent, parseNavTarget, planAutoComplete,
  pluginCompat, syncActiveStep, toInGameTarget, type BridgeEvent, type BridgeTransport,
} from '../src/services/runeliteBridge';
import { mapPlaces, stepPlaces } from '../src/lib/stepPlaces';

const step = (id: string) => allSteps.find((s) => s.id === id)!;
const f2p = stepsFor('f2p');

/** A transport stub: remembers the requests, the event stream opens and breaks on command. */
function fakeTransport(online = true) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const streams: { onEvent: (e: BridgeEvent) => void; onOpen: () => void; onError: () => void; closed: boolean }[] = [];
  const t: BridgeTransport = {
    async request(method, path, body) {
      calls.push({ method, path, body });
      return online ? { ok: true, status: 200, data: { status: 'ok', inGame: true } } : { ok: false, status: 0 };
    },
    openEvents(onEvent, onOpen, onError) {
      const s = { onEvent, onOpen, onError, closed: false };
      streams.push(s);
      return () => { s.closed = true; };
    },
  };
  return { t, calls, streams };
}

describe('the step target for the game', () => {
  it('an explicit inGame wins: the quest, the dialogue and the auto-mark go as they are', () => {
    const p = toInGameTarget(step('S1-03'))!;
    expect(p.stepId).toBe('S1-03');
    expect(p.title).toBe("Cook's Assistant");
    expect(p.npcNames).toContain('Cook');
    expect(p.dialogChoices).toEqual(["What's wrong?", 'Can I help?']);
    expect(p.completionTrigger).toEqual({ type: 'QUEST_COMPLETED', questName: "Cook's Assistant" });
  });

  it('without inGame — the arrow to the start and the gathering tiles from the step map', () => {
    const p = toInGameTarget({ ...step('S2-04'), inGame: undefined })!;
    expect(p.worldPoint).toMatchObject({ x: 3257, y: 3272, plane: 0 });
    expect(p.groundTiles).toHaveLength(3);
    expect(p.completionTrigger).toBeUndefined();
  });

  it('inGame without a point — the point and tiles still come from the step map, the highlight and the auto-mark from inGame', () => {
    const p = toInGameTarget(step('S2-04'))!;
    expect(p.worldPoint).toMatchObject({ x: 3257, y: 3272, plane: 0 });
    expect(p.groundTiles).toHaveLength(3);
    expect(p.npcNames).toEqual(['Cow']);
    expect(p.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'magic', level: 25 }] });
  });

  it('a step without a map and a highlight has nothing to show in the game', () => {
    expect(toInGameTarget(step('S1-01'))).toBeNull();
  });

  it('S1-11: the tiles of both fishing points and the warning about the swamp', () => {
    const s = step('S1-11');
    expect(s.warning).toMatch(/no fishing in the green pools/);
    expect(toInGameTarget(s)!.groundTiles!.map((t) => [t.x, t.y])).toEqual([[3244, 3150], [3086, 3227]]);
  });
});

describe('the auto-mark explanation', () => {
  it('one phrase for any condition', () => {
    expect(triggerText({ type: 'QUEST_COMPLETED', questName: "Cook's Assistant" })).toBe('the quest is counted in the game');
    expect(triggerText({ type: 'SKILL_LEVEL', levels: [{ skill: 'fishing', level: 30 }, { skill: 'cooking', level: 30 }] }))
      .toBe('you reach Fishing 30 and Cooking 30 in the game');
    expect(triggerText({ type: 'SKILL_LEVEL', levels: [{ skill: 'fishing', level: 20 }, { skill: 'cooking', level: 15 }], items: [{ names: ['Shrimps', 'Anchovies'], count: 50 }] }))
      .toBe('you reach Fishing 20 and Cooking 15 in the game, and you will have 50 × Shrimps or Anchovies (bag, equipped and bank together)');
    expect(triggerText({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 20000 }] })).toBe('you will have 20,000 × Coins (bag, equipped and bank together)');
    expect(triggerText({ type: 'QUEST_COMPLETED', questName: 'Monkey Madness I', items: [{ names: ['Dragon scimitar'], count: 1 }] }))
      .toBe('the quest is counted in the game, and you will have Dragon scimitar (bag, equipped and bank together)');
    expect(ownedText({ names: ['Map part'], id: 1535, count: 1 })).toBe('Map part');
  });
});

describe('auto-mark triggers on the route', () => {
  const triggers = allSteps.filter((s) => s.inGame?.completionTrigger).map((s) => ({ s, t: s.inGame!.completionTrigger! }));

  it('a quest is counted by its name from the game', () => {
    const quests = triggers.filter(({ t }) => t.type === 'QUEST_COMPLETED');
    expect(quests.length).toBeGreaterThanOrEqual(30);
    for (const { s, t } of quests) {
      // As the step (a dash is a hyphen, as in RuneLite) or as the wiki article of the step: "Triumph at Oziach" is Dragon Slayer I.
      const article = decodeURIComponent((s.wikiUrl ?? '').replace(/^.*\/w\//, '')).replace(/_/g, ' ');
      expect([s.title.replace(/ — /g, ' - '), article]).toContain(t.questName);
    }
    const names = quests.map(({ t }) => t.questName);
    expect(new Set(names).size).toBe(names.length);
    expect(step('S5-09').inGame!.completionTrigger).toEqual({ type: 'QUEST_COMPLETED', questName: 'Dragon Slayer I', items: [{ names: ['Rune platebody'], count: 1 }] });
    expect(step('S9-05').inGame!.completionTrigger!.questName).toBe("Recipe for Disaster - Another Cook's Quest");
  });

  it('Dragon Slayer I stages — by their own items, map pieces by ID', () => {
    expect(step('S5-01').inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Maze key'], count: 1 }] });
    expect(step('S5-03').inGame!.completionTrigger!.items).toEqual([{ names: ['Map part'], id: 1535, count: 1 }]);
    expect(step('S5-04').inGame!.completionTrigger!.items).toEqual([{ names: ['Map part'], id: 1537, count: 1 }]);
    expect(step('S5-05').inGame!.completionTrigger!.items).toEqual([{ names: ['Crandor map'], count: 1 }]);
    expect(step('S5-08').inGame!.completionTrigger!.items).toEqual([{ names: ["Elvarg's head"], count: 1 }]);
    // The step does not advise paying Wormbrain 10,000 coins — and we do not highlight it in the game.
    expect(step('S5-05').inGame!.dialogChoices ?? []).toEqual([]);
  });

  it('VARBIT_CHANGED is not used without verified varbits', () => {
    expect(triggers.filter(({ t }) => t.type === 'VARBIT_CHANGED')).toEqual([]);
  });

  it('levels are counted by the real levels, exactly the targets from the step title', () => {
    const levels = triggers.filter(({ t }) => t.type === 'SKILL_LEVEL');
    expect(levels.length).toBeGreaterThanOrEqual(13);
    for (const { s, t } of levels) expect(t.levels).toEqual(s.targets);
    // A new-level message does not come if the level was gained before the step was shown, so levels are checked directly.
    expect(triggers.filter(({ t }) => t.type === 'CHAT_MESSAGE')).toEqual([]);
    expect(step('S2-04').inGame!.completionTrigger).toEqual({ type: 'SKILL_LEVEL', levels: [{ skill: 'magic', level: 25 }] });
  });

  it('"Done when" with items — the items are in the condition too', () => {
    expect(step('S1-11').inGame!.completionTrigger!.items).toEqual([{ names: ['Shrimps', 'Anchovies'], count: 50 }]);
    expect(step('S1-12').inGame!.completionTrigger!.items).toEqual([
      { names: ['Copper ore'], count: 5 }, { names: ['Tin ore'], count: 1 }, { names: ['Iron ore'], count: 2 },
    ]);
    expect(step('S4-04').inGame!.completionTrigger!.items).toEqual([{ names: ['Lobster'], count: 20 }]);
    expect(step('S1-13').inGame!.completionTrigger).toEqual({ type: 'ITEM_OWNED', items: [{ names: ['Coins'], count: 20000 }] });
  });

  it('shopping steps are counted when everything in the step list is bought', () => {
    for (const id of ['S2-01', 'S3-07', 'S4-05']) {
      const s = step(id);
      const t = s.inGame!.completionTrigger!;
      expect(t.type).toBe('ITEM_OWNED');
      expect(t.items!.map((i) => i.names[0])).toEqual(s.itemsRequired!.map((i) => i.nameEn));
    }
  });
});

describe('requests to the bridge', () => {
  it('"Show in the game" — POST /active-step with the step target', async () => {
    const { t, calls } = fakeTransport();
    expect(await syncActiveStep(step('S1-06'), t)).toBe(true);
    expect(calls).toEqual([{ method: 'POST', path: '/active-step', body: toInGameTarget(step('S1-06')) }]);
    expect(await clearActiveStep(t)).toBe(true);
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/clear' });
  });

  it('the bridge is off — false, without exceptions', async () => {
    const { t } = fakeTransport(false);
    await expect(syncActiveStep(step('S1-03'), t)).resolves.toBe(false);
  });

  it('a step without a target does not go to the bridge', async () => {
    const { t, calls } = fakeTransport();
    expect(await syncActiveStep(step('S1-01'), t)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('events — only JSON with a type field', () => {
    expect(parseEvent('{"type":"STEP_AUTO_COMPLETED","stepId":"S1-03"}')).toEqual({ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-03' });
    expect(parseEvent('ping')).toBeNull();
    expect(parseEvent('{"stepId":"S1-03"}')).toBeNull();
  });
});

describe('the event stream', () => {
  it('pauses grow up to 30 seconds', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('a break — a pause and a new attempt, a connection — a pause reset, close stops everything', () => {
    const { t, streams } = fakeTransport();
    const timers: { fn: () => void; ms: number; cancelled?: boolean }[] = [];
    const states: boolean[] = [];
    const events: BridgeEvent[] = [];
    const h = connectEvents((e) => events.push(e), (s) => states.push(s), t,
      (fn, ms) => { const x = { fn, ms }; timers.push(x); return x; },
      (x) => { if (x) (x as { cancelled?: boolean }).cancelled = true; });

    expect(streams).toHaveLength(1);
    streams[0].onError();
    streams[0].onError(); // a repeated error of the same stream — not a second attempt
    expect(states).toEqual([false]);
    expect(timers.map((x) => x.ms)).toEqual([1000]);

    timers[0].fn();
    expect(streams).toHaveLength(2);
    streams[1].onOpen();
    streams[1].onEvent({ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-03' });
    expect(states.at(-1)).toBe(true);
    expect(events).toEqual([{ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-03' }]);

    streams[1].onError();
    expect(timers.at(-1)!.ms).toBe(1000); // after a successful connection the pauses start from a second again

    h.close();
    expect(timers.at(-1)!.cancelled).toBe(true);
    streams[1].onEvent({ type: 'STEP_AUTO_COMPLETED', stepId: 'S1-04' });
    expect(events).toHaveLength(1);
  });
});

describe('auto-mark from the game', () => {
  it('marks the step and sends the next one to the game, if this one was in the game', () => {
    const plan = planAutoComplete(f2p, emptyProgress(), 'S1-03', 'S1-03', new Set());
    expect(plan.mark).toBe(true);
    expect(plan.next?.id).toBe('S1-04');
    expect(plan.inGame).toBe('sync-next');
  });

  it('the next step has nothing to show in the game — the hints are cleared', () => {
    // After the last F2P step the next one is S1-01 (client setup): no place, no highlight.
    const plan = planAutoComplete(f2p, emptyProgress(), 'S6-05', 'S6-05', new Set());
    expect(plan.next?.id).toBe('S1-01');
    expect(plan.inGame).toBe('clear');
  });

  it('a repeat of the same event does nothing', () => {
    const plan = planAutoComplete(f2p, emptyProgress(), 'S1-03', 'S1-03', new Set(['S1-03']));
    expect(plan).toEqual({ mark: false, inGame: 'keep' });
  });

  it('an already marked step is left alone', () => {
    const p = withStep(emptyProgress(), 'S1-03', 'done');
    expect(planAutoComplete(f2p, p, 'S1-03', 'S1-03', new Set()).mark).toBe(false);
  });

  it('another step is shown in the game — we mark, but do not override the hints in the game', () => {
    const plan = planAutoComplete(f2p, emptyProgress(), 'S1-04', 'S1-06', new Set());
    expect(plan).toMatchObject({ mark: true, inGame: 'keep' });
  });

  it('a Members step in F2P mode and an unknown code are ignored', () => {
    expect(planAutoComplete(f2p, emptyProgress(), 'S7-04', 'S7-04', new Set()).mark).toBe(false);
    expect(planAutoComplete(f2p, emptyProgress(), 'S0-00', null, new Set()).mark).toBe(false);
  });
});

describe('parsing the event stream in the desktop app', () => {
  const require = createRequire(import.meta.url);
  const { sseParser } = require('../electron/runelite-bridge.cjs') as { sseParser: (on: (d: string) => void) => (chunk: string) => void };

  it('the main process lets all the app addresses through to the plugin, and only them', () => {
    const { PATHS } = require('../electron/runelite-bridge.cjs') as { PATHS: Set<string> };
    expect([...PATHS].sort()).toEqual([...BRIDGE_PATHS].sort());
  });

  it('events in pieces, CRLF, ping comments and multi-line data', () => {
    const out: string[] = [];
    const feed = sseParser((d) => out.push(d));
    feed(': ping\n\ndata: {"type":"STATUS",');
    feed('"inGame":true}\r\n\r\ndata: a\ndata: b\n\n');
    expect(out).toEqual(['{"type":"STATUS","inGame":true}', 'a\nb']);
  });
});

describe('starting RuneLite from the desktop app', () => {
  const require = createRequire(import.meta.url);
  const { findClient, versionOf } = require('../electron/runelite-launcher.cjs') as {
    findClient: (dir: string) => { version: string; jars: string[] } | null;
    versionOf: (name: string) => number[];
  };
  const { mkdtempSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { join, basename } = require('node:path') as typeof import('node:path');

  const repo = (names: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-repo-'));
    for (const n of names) writeFileSync(join(dir, n), '');
    return dir;
  };

  it('the version from the file name', () => {
    expect(versionOf('client-1.12.39.jar')).toEqual([1, 12, 39]);
    expect(versionOf('runelite-api-1.12.39-runtime.jar')).toEqual([1, 12, 39]);
    expect(versionOf('lwjgl-opengl-3.3.2-natives-windows.jar')).toEqual([3, 3, 2]);
  });

  it('takes all the libraries, and of two versions of one — the new one', () => {
    const dir = repo(['client-1.12.39.jar', 'client-1.12.40.jar', 'injected-client-1.12.40.jar', 'injected-client-1.12.39.jar',
      'runelite-api-1.12.40-runtime.jar', 'gson-2.8.5.jar', 'lwjgl-3.3.2.jar', 'lwjgl-3.3.2-natives-windows.jar']);
    const c = findClient(dir)!;
    expect(c.version).toBe('1.12.40');
    expect(c.jars.map((j) => basename(j)).sort()).toEqual(['client-1.12.40.jar', 'gson-2.8.5.jar', 'injected-client-1.12.40.jar',
      'lwjgl-3.3.2-natives-windows.jar', 'lwjgl-3.3.2.jar', 'runelite-api-1.12.40-runtime.jar']);
  });

  it('without a client or with a client of another version — we do not start', () => {
    expect(findClient(repo(['gson-2.8.5.jar']))).toBeNull();
    expect(findClient(repo(['client-1.12.40.jar', 'injected-client-1.12.39.jar']))).toBeNull();
    expect(findClient(join(tmpdir(), 'no-such-folder'))).toBeNull();
  });
});

describe('the handshake of the app and plugin versions', () => {
  it('the plugin comes with the same version and protocol that the app expects', async () => {
    const { readFileSync } = await import('node:fs');
    const java = readFileSync(new URL('../runelite-bridge/src/main/java/com/osrspath/bridge/BridgeServer.java', import.meta.url), 'utf8');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(java.match(/PLUGIN_VERSION = "([^"]+)"/)?.[1]).toBe(pkg.version);
    expect(Number(java.match(/int PROTOCOL = (\d+);/)?.[1])).toBe(APP_PROTOCOL);
  });

  it('compatibility: no field — an old plugin, lower — outdated, higher — newer than the app', () => {
    expect(pluginCompat(null)).toBe('legacy');
    expect(pluginCompat(APP_PROTOCOL - 1)).toBe('older');
    expect(pluginCompat(APP_PROTOCOL)).toBe('ok');
    expect(pluginCompat(APP_PROTOCOL + 1)).toBe('newer');
  });
});

describe('the arrow target chosen in the game (protocol 4)', () => {
  it('NAV_SET and /status: a target is accepted only whole and verified', () => {
    expect(parseNavTarget({ label: 'Ned — a house in Draynor Village', x: 3099, y: 3259, plane: 0, npcNames: ['Ned'], stepId: 'S2-10' }))
      .toEqual({ label: 'Ned — a house in Draynor Village', x: 3099, y: 3259, plane: 0, npcNames: ['Ned'], stepId: 'S2-10' });
    expect(parseNavTarget(null)).toBeNull();
    expect(parseNavTarget({ label: '', x: 1, y: 2, plane: 0 })).toBeNull();
    expect(parseNavTarget({ label: 'X', x: 1.5, y: 2, plane: 0 })).toBeNull();
    expect(parseNavTarget({ label: 'X', x: 1, y: 2, plane: 0, npcNames: [5] })).toEqual({ label: 'X', x: 1, y: 2, plane: 0 });
  });

  it('/status: the target in the game — in the app state; an old plugin has no field', async () => {
    const t = (data: unknown): BridgeTransport => ({ request: async () => ({ ok: true, status: 200, data }), openEvents: () => () => {} });
    const now = await checkStatus(t({ status: 'ok', protocol: 4, pluginVersion: '2.11.0', navTarget: { label: 'Joe', x: 3124, y: 3244, plane: 0 } }));
    expect(now.navTarget).toEqual({ label: 'Joe', x: 3124, y: 3244, plane: 0 });
    expect((await checkStatus(t({ status: 'ok', protocol: 3 }))).navTarget).toBeNull();
  });

  it('an old plugin: the app says what it lacks', () => {
    expect(missingWithPlugin(3)).toEqual([
      'a single state snapshot and the preparation plan on the game screen (readiness percent, "do not take now", recovery mode)',
      'XP, quests and the character name from the game (account sync, profiles, time to the goal)',
      'the "What you need" list on the game screen (a click on a row gives an arrow and the path there)',
    ]);
    expect(missingWithPlugin(4)).toHaveLength(2);
    expect(missingWithPlugin(5)).toHaveLength(1);
    expect(missingWithPlugin(null)).toHaveLength(5);
    expect(missingWithPlugin(APP_PROTOCOL)).toEqual([]);
  });
});

describe('step places: where the quest items and NPCs come from — the same in the app and in the game', () => {
  it('Prince Ali Rescue: the quest NPCs and Ned behind the rope, the step point first', () => {
    const p = stepPlaces(step('S2-10'));
    expect(p[0]).toMatchObject({ npc: 'Chancellor Hassan', x: 3298, y: 3163 });
    expect(p.find((q) => q.npc === 'Ned')).toMatchObject({ x: 3099, y: 3259, items: ['Rope'] });
    expect(p.map((q) => q.npc)).toEqual(['Chancellor Hassan', 'Ned', 'Osman', 'Aggie', 'Lady Keli', 'Leela', 'Joe', 'Prince Ali']);
    expect(mapPlaces(step('S2-10')).map((q) => q.label)).toEqual(p.map((q) => q.label));
  });

  it('an item from the step\'s own NPC — at its point, not a second point nearby; one name — different NPCs by step', () => {
    const horacio = stepPlaces(step('S2-06'));
    expect(horacio[0]).toMatchObject({ npc: 'Duke Horacio', items: ['Air talisman'] });
    expect(horacio.filter((q) => q.npc === 'Duke Horacio')).toHaveLength(1);
    // Cook in Below Ice Mountain is the cook of the Blue Moon Inn pub in Varrock, not the cook of Lumbridge Castle.
    expect(stepPlaces(step('S3-04')).find((q) => q.npc === 'Cook')).toMatchObject({ x: 3230, y: 3400 });
    // Drezel in Priest in Peril is in the cell at the top of the temple, in Nature Spirit — under the temple.
    expect(stepPlaces(step('S8-01')).find((q) => q.npc === 'Drezel')).toMatchObject({ x: 3416, y: 3487, plane: 2 });
  });

  it('"gather in the world" items from 2.11.2 have a place: Goblin mail, bones, Glarial\'s pebble; quest NPCs — from the wiki map', () => {
    const at = (id: string, name: string) => stepPlaces(step(id)).find((q) => q.items?.includes(name));
    expect(at('S2-12', 'Goblin mail')).toMatchObject({ label: 'Goblin Village', plane: 0 });
    expect(at('S3-03', 'Bones')).toMatchObject({ x: 3257, y: 3272, npc: 'Cow' });
    expect(at('S7-01', "Glarial's pebble")).toMatchObject({ npc: 'Golrie', x: 2515, y: 9581 });
    expect(stepPlaces(step('S8-05')).find((q) => q.npc === 'Malcolm')).toMatchObject({ x: 3629, y: 3528 });
  });

  it('a shop from the dictionary has a seller — Shop keeper; the step map keeps the earlier order of points', () => {
    expect(stepPlaces(step('S1-02')).find((q) => q.items?.includes('Tinderbox'))).toMatchObject({ label: 'Lumbridge General Store', npc: 'Shop keeper' });
    expect(mapPlaces(step('S4-04')).slice(0, 2).map((q) => q.label)).toEqual(['The Grand Exchange', 'Optional: fly fishing at Barbarian Village']);
  });
});

describe('the "OSRS Path" panel in RuneLite: what is needed and the step points (protocol 3)', () => {
  it('S2-03: items with "where to get", points with NPCs and items, the step point is not duplicated', () => {
    const g = toInGameTarget(step('S2-03'))!.guide!;
    expect(g.items.map((i) => i.name)).toEqual(['Onion', 'Eye of newt', "Rat's tail", 'Burnt meat']);
    expect(g.items.find((i) => i.name === 'Eye of newt')).toMatchObject({ id: 221, count: 1, inStep: true });
    expect(g.items.every((i) => i.where)).toBe(true);
    expect(g.places.map((p) => p.label)).toEqual([
      'Hetty — her house in Rimmington', "Rat — Brian's Archery Supplies", 'Onion — the patch north of Rimmington',
      'Eye of newt — Betty, Port Sarim', 'Giant rat — by the Port Sarim chapel',
    ]);
    expect(g.places[0]).toMatchObject({ npc: 'Hetty', x: 2968, y: 3204 });
    expect(g.places[3]).toMatchObject({ npc: 'Betty', items: ['Eye of newt'] });
  });

  it('every step with items or several points has a panel; the plugin limits are respected', () => {
    for (const s of allSteps) {
      const g = toInGameTarget(s)?.guide;
      if ((s.itemsRequired?.length ?? 0) > 0) expect(g, s.id).toBeTruthy();
      if (!g) continue;
      expect(g.items.length).toBeLessThanOrEqual(64);
      for (const i of g.items) expect((i.where ?? '').length, `${s.id} ${i.name}`).toBeLessThanOrEqual(500);
      for (const p of g.places) expect(p.label.length).toBeLessThanOrEqual(200);
    }
  });

  it('a quick option changes the main point and does not assign the step NPC to it', () => {
    const s = step('S2-05');
    const branch = s.branches!.find((b) => b.id === 'varrock-teleport')!;
    const g = toInGameTarget(s, branch)!.guide!;
    expect(g.places[0]).toMatchObject({ x: branch.replacementTarget!.x, y: branch.replacementTarget!.y });
    expect(g.places[0].npc).toBeUndefined();
  });
});
