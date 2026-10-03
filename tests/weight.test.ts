import { describe, expect, it } from 'vitest';
import { energyUnits, HEAVY_SAVING, isCalm, kgText, runLengthRatio, weightAdvice, weightOf } from '../src/lib/weight';
import { buildPlayerState } from '../src/lib/playerState';
import { parseGear } from '../src/services/runeliteBridge';
import type { Step } from '../src/types';

const calm = { type: 'skill' } as Pick<Step, 'type' | 'foes' | 'threats' | 'targets'>;
const gear = (over: Record<string, unknown> = {}) => ({
  equipment: [
    { id: 1127, name: 'Rune platebody', slot: 'body' },
    { id: 1163, name: 'Rune full helm', slot: 'head' },
    { id: 1079, name: 'Rune platelegs', slot: 'legs' },
    { id: 1205, name: 'Bronze dagger', slot: 'weapon' },
  ],
  inventory: [{ id: 1, name: 'Lobster', count: 10 }, { id: 2, name: 'Coins', count: 5000 }, { id: 3, name: 'Iron bar', count: 8 }],
  coins: 5000, bankCoins: null, weight: 26, ...over,
});
const stateWith = (g: ReturnType<typeof gear> | null) =>
  buildPlayerState({ mode: 'f2p', stats: null, progress: { levels: {} }, owned: null, gear: g as never, questsDone: null, connected: true });

describe('вес и бег (формула OSRS Wiki «Run energy»)', () => {
  it('единицы энергии за тик: 60 при нуле, 127 при 64 кг; ниже нуля и выше 64 — как на границе', () => {
    expect(energyUnits(0)).toBe(60);
    expect(energyUnits(-12)).toBe(60);
    expect(energyUnits(64)).toBe(127);
    expect(energyUnits(500)).toBe(127);
    expect(energyUnits(25)).toBe(86);
  });

  it('самый тяжёлый выдыхается вдвое быстрее лёгкого, а не «в разы»; 18 кг — около трети', () => {
    expect(runLengthRatio(64, 0)).toBeCloseTo(127 / 60, 5);
    expect(runLengthRatio(64, 0)).toBeLessThan(2.2);
    expect(runLengthRatio(18, 0)).toBeCloseTo(78 / 60, 5);
    expect(runLengthRatio(10, 10)).toBe(1);
  });

  it('вес предметов — из вики; нет в базе — неизвестен, а не ноль', () => {
    expect(weightOf('Rune platebody')).toBeCloseTo(9.979, 3);
    expect(weightOf('rune platebody')).toBeCloseTo(9.979, 3);
    expect(weightOf('Нет такого предмета')).toBeUndefined();
  });

  it('вес из игры разбирается; мусор отбрасывается', () => {
    expect(parseGear({ equipment: [], inventory: [], coins: 1, weight: 12 })?.weight).toBe(12);
    expect(parseGear({ equipment: [], inventory: [], coins: 1, weight: 'много' })?.weight).toBeUndefined();
    expect(parseGear({ equipment: [], inventory: [], coins: 1, weight: 5000 })?.weight).toBeUndefined();
    expect(parseGear({ equipment: [], inventory: [], coins: 1 })?.weight).toBeUndefined();
  });
});

describe('совет по весу', () => {
  it('шаг без боя: тяжёлая броня — в банк; вес и «во сколько раз дольше» посчитаны; нужное и деньги не трогаем', () => {
    const a = weightAdvice(calm, stateWith(gear()), new Set(['Lobster']));
    expect(a.level).toBe('HEAVY');
    expect(a.items.map((i) => i.name)).toEqual(['Iron bar', 'Rune platebody', 'Rune platelegs', 'Rune full helm']);
    expect(a.items.find((i) => i.name === 'Iron bar')).toMatchObject({ from: 'INVENTORY', count: 8 });
    expect(a.items.some((i) => i.name === 'Bronze dagger')).toBe(false);
    expect(a.items.some((i) => i.name === 'Coins' || i.name === 'Lobster')).toBe(false);
    expect(a.saving).toBeGreaterThanOrEqual(HEAVY_SAVING);
    expect(a.current).toBe(26);
    expect(a.after).toBeCloseTo(26 - a.saving, 3);
    expect(a.ratio).toBeCloseTo(runLengthRatio(26, 26 - a.saving), 5);
  });

  it('шаг, которому броня нужна (она в списке нужного), — не трогаем', () => {
    const a = weightAdvice(calm, stateWith(gear()), new Set(['Rune platebody', 'Rune full helm', 'Rune platelegs', 'Iron bar']));
    expect(a.items).toEqual([]);
    expect(a.level).toBe('NONE');
  });

  it('бой, угрозы, боевая прокачка и шаг со снаряжением — не «без боя»: ничего не советуем', () => {
    expect(isCalm({ type: 'skill', foes: ['Cow'] } as never)).toBe(false);
    expect(isCalm({ type: 'quest', threats: ['Elvarg'] } as never)).toBe(false);
    expect(isCalm({ type: 'skill', targets: [{ skill: 'strength', level: 20 }] } as never)).toBe(false);
    expect(isCalm({ type: 'gear' } as never)).toBe(false);
    expect(isCalm({ type: 'skill', targets: [{ skill: 'fishing', level: 20 }] } as never)).toBe(true);
    const a = weightAdvice({ type: 'skill', foes: ['Cow'] } as never, stateWith(gear()), new Set());
    expect(a).toMatchObject({ level: 'NONE', items: [], saving: 0, current: 26 });
  });

  it('вес из игры неизвестен: советуем по предметам, но число «было → стало» не выдумываем', () => {
    const a = weightAdvice(calm, stateWith(gear({ weight: undefined })), new Set());
    expect(a.level).toBe('HEAVY');
    expect(a.current).toBeNull();
    expect(a.after).toBeNull();
    expect(a.ratio).toBeNull();
  });

  it('сумка неизвестна (плагин не прислал): лишнее в сумке не угадываем, надетое — видно', () => {
    const a = weightAdvice(calm, stateWith(gear({ inventory: null })), new Set());
    expect(a.items.every((i) => i.from === 'EQUIPPED')).toBe(true);
    expect(a.items.length).toBeGreaterThan(0);
  });

  it('мелочь (меньше 3 кг) — не повод для разговора; 3–10 кг — «можно облегчить»', () => {
    const light = weightAdvice(calm, stateWith(gear({ equipment: [{ id: 1, name: 'Rune full helm', slot: 'head' }], inventory: [] })), new Set());
    expect(light.level).toBe('NONE');
    expect(light.items).toEqual([]);
    const mid = weightAdvice(calm, stateWith(gear({ equipment: [{ id: 1, name: 'Rune kiteshield', slot: 'shield' }, { id: 2, name: 'Rune full helm', slot: 'head' }], inventory: [] })), new Set());
    expect(mid.level).toBe('LIGHT');
  });

  it('килограммы по-русски', () => {
    expect(kgText(9.979)).toBe('10 кг');
    expect(kgText(12.34)).toBe('12,3 кг');
  });
});
