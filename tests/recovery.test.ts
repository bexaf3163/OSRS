import { describe, expect, it } from 'vitest';
import { detectRecovery, DEATH_WINDOW_MS, FAR, inHub, NEAR, RECOVERY_TTL_MS, RESPAWN, recoverySteps, stepPoint, type MoveEvent, type Point } from '../src/lib/recovery';
import { parseMove } from '../src/services/runeliteBridge';

const NOW = 1_800_000_000_000;
const at = (x: number, y: number, plane = 0): Point => ({ x, y, plane });
const step = (p: Point | null) => ({ mapLocation: p ? { ...p, label: 'шаг' } : undefined }) as never;
const tp = (to: Point, from: Point | null, ago = 1000): MoveEvent => ({ kind: 'TELEPORT', from, to, at: NOW - ago });
const death = (where: Point, ago = 5000): MoveEvent => ({ kind: 'DEATH', from: where, to: null, at: NOW - ago });

// Шаг в подземелье под Melzar's Maze и шаг у Varrock — далеко от Lumbridge.
const MELZAR = at(2929, 3248);
const VARROCK = at(3213, 3428);

describe('режим восстановления: срыв или нормальный путь', () => {
  it('смерть и возрождение в Lumbridge вдали от шага — срыв «DEATH»; вещи ищет игрок', () => {
    const r = detectRecovery({ moves: [death(at(2929, 3250), 8000), tp(RESPAWN, at(2929, 3250), 1000)], step: step(MELZAR), now: NOW });
    expect(r).toMatchObject({ reason: 'DEATH', landedAt: RESPAWN, diedAt: at(2929, 3250) });
    expect(r?.distance).toBeGreaterThan(NEAR);
    expect(r?.target).toEqual(MELZAR);
  });

  it('смерть без возрождения (ещё не возродился) — тоже срыв', () => {
    const r = detectRecovery({ moves: [death(at(2929, 3250), 1000)], step: step(MELZAR), now: NOW });
    expect(r?.reason).toBe('DEATH');
    expect(r?.landedAt).toBeNull();
  });

  it('Home Teleport посреди шага — срыв «TELEPORT»; телепорт к шагу — нормальный путь', () => {
    expect(detectRecovery({ moves: [tp(RESPAWN, MELZAR)], step: step(MELZAR), now: NOW })?.reason).toBe('TELEPORT');
    // Varrock Teleport к шагу в Varrock — не срыв.
    expect(detectRecovery({ moves: [tp(at(3213, 3424), RESPAWN)], step: step(VARROCK), now: NOW })).toBeNull();
    // Телепорт в Lumbridge, а шаг в Lumbridge, — тоже не срыв.
    expect(detectRecovery({ moves: [tp(RESPAWN, VARROCK)], step: step(at(3230, 3225)), now: NOW })).toBeNull();
  });

  it('телепорт куда угодно, кроме Lumbridge, срывом не считается (человек знает, куда летит)', () => {
    expect(detectRecovery({ moves: [tp(at(2964, 3378), RESPAWN)], step: step(MELZAR), now: NOW })).toBeNull();
  });

  it('игрок уже у шага — восстановление окончено', () => {
    const moves = [death(MELZAR, 8000), tp(RESPAWN, MELZAR, 1000)];
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW, here: at(2930, 3249) })).toBeNull();
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW, here: at(3222, 3218) })).not.toBeNull();
  });

  it('«Это не срыв» гасит то, что было раньше; новое событие включает снова', () => {
    const moves = [tp(RESPAWN, MELZAR, 5000)];
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW, dismissedAt: NOW - 1000 })).toBeNull();
    expect(detectRecovery({ moves: [...moves, tp(RESPAWN, MELZAR, 100)], step: step(MELZAR), now: NOW, dismissedAt: NOW - 1000 })).not.toBeNull();
  });

  it('через 30 минут режим гаснет сам; без событий — нет режима', () => {
    expect(detectRecovery({ moves: [tp(RESPAWN, MELZAR, RECOVERY_TTL_MS + 1)], step: step(MELZAR), now: NOW })).toBeNull();
    expect(detectRecovery({ moves: [], step: step(MELZAR), now: NOW })).toBeNull();
  });

  it('смерть и возрождение далеко друг от друга по времени — разные события: одинокий телепорт судится сам', () => {
    const moves = [death(MELZAR, DEATH_WINDOW_MS + 60_000), tp(RESPAWN, VARROCK, 1000)];
    expect(detectRecovery({ moves, step: step(MELZAR), now: NOW })?.reason).toBe('TELEPORT');
  });

  it('у шага нет точки или он под землёй: расстояние неизвестно; смерть — срыв, одинокий телепорт — нет', () => {
    expect(detectRecovery({ moves: [death(MELZAR), tp(RESPAWN, MELZAR)], step: step(null), now: NOW })?.distance).toBeNull();
    expect(detectRecovery({ moves: [tp(RESPAWN, MELZAR)], step: step(null), now: NOW })).toBeNull();
    const dungeon = at(3049, 9566);
    expect(detectRecovery({ moves: [tp(RESPAWN, dungeon)], step: step(dungeon), now: NOW })).toBeNull();
    const d = detectRecovery({ moves: [death(dungeon), tp(RESPAWN, dungeon)], step: step(dungeon), now: NOW });
    expect(d?.reason).toBe('DEATH');
    expect(d?.distance).toBeNull();
  });

  it('точка возрождения и «в Лумбридже»', () => {
    expect(inHub(RESPAWN)).toBe(true);
    expect(inHub(at(3222 + 14, 3218))).toBe(true);
    expect(inHub(at(3222 + 30, 3218))).toBe(false);
    expect(inHub(at(3222, 3218 + 6400))).toBe(false);
    expect(inHub(null)).toBe(false);
    expect(FAR).toBeGreaterThan(NEAR);
  });

  it('точка шага: явная точка игры главнее карты', () => {
    expect(stepPoint({ inGame: { worldPoint: { x: 1, y: 2, plane: 0, label: 'a' } }, mapLocation: { x: 3, y: 4, plane: 0, label: 'b' } } as never)).toEqual({ x: 1, y: 2, plane: 0 });
    expect(stepPoint({ mapLocation: { x: 3, y: 4, plane: 1, label: 'b' } } as never)).toEqual({ x: 3, y: 4, plane: 1 });
    expect(stepPoint({} as never)).toBeNull();
  });
});

describe('режим восстановления: что сказать', () => {
  const base = { since: NOW, landedAt: RESPAWN, diedAt: null, distance: 300, target: MELZAR };
  it('после смерти — вещи, недостающее, возвращение; после телепорта вещей искать не надо', () => {
    const d = recoverySteps({ ...base, reason: 'DEATH' }, 2, 'S5-03');
    expect(d.map((x) => x.label)).toEqual(['Забери вещи, которые остались после смерти', 'Возьми недостающее: 2 пункта', 'Вернись к шагу S5-03']);
    expect(d[0].detail).toContain('могиле');
    const t = recoverySteps({ ...base, reason: 'TELEPORT' }, 0, 'S5-03');
    expect(t[0].label).toBe('Проверь сумку и снаряжение');
    expect(t[1].label).toContain('Недостающего нет');
  });
});

describe('событие MOVED из плагина', () => {
  it('разбирается; мусор — null', () => {
    expect(parseMove({ type: 'MOVED', kind: 'TELEPORT', from: { x: 3000, y: 3200, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } })).toEqual({ kind: 'TELEPORT', from: { x: 3000, y: 3200, plane: 0 }, to: { x: 3222, y: 3218, plane: 0 } });
    expect(parseMove({ kind: 'DEATH', from: { x: 3000, y: 3200, plane: 0 }, to: null })).toEqual({ kind: 'DEATH', from: { x: 3000, y: 3200, plane: 0 }, to: null });
    expect(parseMove({ kind: 'FLY' })).toBeNull();
    expect(parseMove(null)).toBeNull();
    expect(parseMove({ kind: 'DEATH', from: { x: -1, y: 'a', plane: 9 } })).toEqual({ kind: 'DEATH', from: null, to: null });
  });
});
