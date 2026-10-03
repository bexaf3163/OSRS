// «Как добраться»: от положения игрока (плагин, /status → pos) до цели шага — пешком, телепортом или каноэ.
// Расстояния — по прямой (преграды неизвестны), поэтому это сравнение вариантов, а не точное время. Что доступно сейчас,
// определяется по уровням и вещам из игры; чего не знаем (банк не открывали) — помечаем, а не придумываем.

import transportJson from '../data/transport.json';
import type { GearItem } from '../services/runeliteBridge';

export interface Point { x: number; y: number; plane: number }
export interface Teleport {
  id: string;
  kind: 'home' | 'spell' | 'item';
  name: string;
  nameRu: string;
  magic?: number;
  runes?: Record<string, number>;
  items?: string[];
  dest: Point & { label: string };
  cooldownMin?: number;
  note?: string;
}
export interface CanoeStation { id: string; name: string; x: number; y: number; plane: number; wakaOnly?: boolean }
export interface CanoeType { name: string; level: number; stops: number }

export interface Boat { id: string; name: string; from: Point & { label: string }; to: Point & { label: string }; cost: number; note?: string }

export const TRANSPORT = transportJson as unknown as {
  checked: string;
  teleports: Teleport[];
  boats: Boat[];
  canoe: { stations: CanoeStation[]; types: CanoeType[]; axes: string[] };
};

/** Бег — 2 клетки за тик (0,6 с): так считается нижняя оценка времени пешком. */
export const TILES_PER_SECOND = 2 / 0.6;

/** Выигрыш меньше этого числа клеток не стоит ни рун, ни зарядов: вариант не показываем. */
export const MIN_SAVING_TILES = 20;

export const dist = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export type Availability = 'ready' | 'maybe' | 'locked';
export interface Need { text: string; ok: boolean | null }

export interface Leg { kind: 'walk' | 'teleport' | 'canoe' | 'boat'; label: string; tiles: number }
export interface TravelOption {
  id: string;
  title: string;
  legs: Leg[];
  /** Клеток пешком по всем отрезкам (прямая). */
  walkTiles: number;
  availability: Availability;
  /** Чего не хватает или что проверить: уровень, руны, книга. */
  needs: Need[];
  note?: string;
}

export interface TravelInput {
  from: Point;
  to: Point;
  /** Уровни из игры или введённые вручную. */
  levels: Readonly<Record<string, number | undefined>>;
  /** Надетое и сумка из игры; null — игры нет. */
  carried: readonly GearItem[] | null;
  /** Банк открывали (предмета нет в сумке — значит, возможно, он в банке). */
  bankSeen: boolean;
}

const count = (items: readonly GearItem[], names: readonly string[]): number =>
  items.filter((i) => names.includes(i.name)).reduce((s, i) => s + (i.count ?? 1), 0);

const STAFF_OF: Record<string, string[]> = {
  air: ['Staff of air', 'Air battlestaff', 'Mystic air staff'],
  fire: ['Staff of fire', 'Fire battlestaff', 'Mystic fire staff', 'Lava battlestaff', 'Mystic lava staff'],
  water: ['Staff of water', 'Water battlestaff', 'Mystic water staff'],
  earth: ['Staff of earth', 'Earth battlestaff', 'Mystic earth staff'],
};
const runeName = (rune: string): string => `${rune[0].toUpperCase()}${rune.slice(1)} rune`;

function teleportNeeds(t: Teleport, inp: TravelInput): { needs: Need[]; availability: Availability } {
  if (t.kind === 'home') return { needs: [], availability: 'ready' };
  if (t.kind === 'item') {
    const have = inp.carried ? count(inp.carried, t.items ?? []) > 0 : null;
    // Нет при себе, а банк открывали — значит, нет нигде рядом; банк не открывали — может лежать там.
    const ok = have === null ? null : have ? true : inp.bankSeen ? false : null;
    return {
      needs: [{ text: `${t.items![0]} при себе (заряды — Check charges)`, ok }],
      availability: ok === false ? 'locked' : 'maybe',
    };
  }
  const needs: Need[] = [];
  const lvl = inp.levels.magic;
  let locked = false;
  let unsure = false;
  if (t.magic) {
    const ok = lvl === undefined ? null : lvl >= t.magic;
    needs.push({ text: `Magic ${t.magic}${lvl !== undefined ? ` (у тебя ${lvl})` : ''}`, ok });
    if (ok === false) locked = true;
    if (ok === null) unsure = true;
  }
  for (const [rune, qty] of Object.entries(t.runes ?? {})) {
    if (inp.carried && STAFF_OF[rune] && count(inp.carried, STAFF_OF[rune]) > 0) {
      needs.push({ text: `${runeName(rune)} ×${qty} — заменяет посох`, ok: true });
      continue;
    }
    const have = inp.carried ? count(inp.carried, [runeName(rune)]) : null;
    const ok = have === null ? null : have >= qty ? true : inp.bankSeen ? false : null;
    needs.push({ text: `${runeName(rune)} ×${qty}${have !== null ? ` (в сумке ${have})` : ''}`, ok });
    if (ok === false) locked = true;
    if (ok === null) unsure = true;
  }
  return { needs, availability: locked ? 'locked' : unsure ? 'maybe' : 'ready' };
}

/** Возможные способы добраться: доступные сначала, внутри — по числу клеток пешком. Бесполезные (не короче пешком) не показываются. */
export function travelOptions(inp: TravelInput): TravelOption[] {
  const out: TravelOption[] = [];
  const direct = dist(inp.from, inp.to);
  out.push({ id: 'walk', title: 'Пешком', legs: [{ kind: 'walk', label: 'бегом по прямой', tiles: direct }], walkTiles: direct, availability: 'ready', needs: [] });

  for (const t of TRANSPORT.teleports) {
    const tail = dist(t.dest, inp.to);
    const { needs, availability } = teleportNeeds(t, inp);
    out.push({
      id: t.id, title: t.nameRu,
      legs: [{ kind: 'teleport', label: `${t.nameRu} → ${t.dest.label}`, tiles: 0 }, { kind: 'walk', label: 'дальше пешком', tiles: tail }],
      walkTiles: tail, availability, needs, ...(t.note ? { note: t.note } : {}),
    });
  }

  // Каноэ: лучшая пара станций — от игрока до станции A, по реке до B (не дальше, чем позволяет тип каноэ), от B до цели.
  const stations = TRANSPORT.canoe.stations;
  const types = TRANSPORT.canoe.types;
  let best: { a: number; b: number; tiles: number; type: CanoeType } | null = null;
  for (let a = 0; a < stations.length; a++) {
    for (let b = 0; b < stations.length; b++) {
      if (a === b) continue;
      const stops = Math.abs(a - b);
      const type = types.find((ty) => ty.stops >= stops && (!stations[b].wakaOnly || ty.name === 'Waka'));
      if (!type) continue;
      const tiles = dist(inp.from, stations[a]) + dist(stations[b], inp.to);
      if (!best || tiles < best.tiles) best = { a, b, tiles, type };
    }
  }
  if (best && best.tiles + MIN_SAVING_TILES <= direct) {
    const wc = inp.levels.woodcutting;
    const hasAxe = inp.carried ? count(inp.carried, TRANSPORT.canoe.axes) > 0 : null;
    const levelOk = wc === undefined ? null : wc >= best.type.level;
    const a = stations[best.a];
    const b = stations[best.b];
    out.push({
      id: 'canoe', title: `Каноэ ${a.name} → ${b.name}`,
      legs: [
        { kind: 'walk', label: `до станции ${a.name}`, tiles: dist(inp.from, a) },
        { kind: 'canoe', label: `${best.type.name}: ${Math.abs(best.a - best.b)} ост.`, tiles: 0 },
        { kind: 'walk', label: `от станции ${b.name} до цели`, tiles: dist(b, inp.to) },
      ],
      walkTiles: best.tiles,
      availability: levelOk === false ? 'locked' : levelOk === null || hasAxe === null ? 'maybe' : 'ready',
      needs: [
        { text: `Woodcutting ${best.type.level} для ${best.type.name}${wc !== undefined ? ` (у тебя ${wc})` : ''}`, ok: levelOk },
        { text: 'любой топор (можно оставить на станции)', ok: hasAxe },
      ],
    });
  }

  // Лодки: пристань до пристани за 30 монет.
  for (const b of TRANSPORT.boats) {
    const tiles = dist(inp.from, b.from) + dist(b.to, inp.to);
    const coins = inp.carried ? count(inp.carried, ['Coins']) : null;
    const ok = coins === null ? null : coins >= b.cost ? true : inp.bankSeen ? false : null;
    out.push({
      id: b.id, title: b.name,
      legs: [
        { kind: 'walk', label: `до ${b.from.label}`, tiles: dist(inp.from, b.from) },
        { kind: 'boat', label: `лодка за ${b.cost} gp`, tiles: 0 },
        { kind: 'walk', label: `от ${b.to.label} до цели`, tiles: dist(b.to, inp.to) },
      ],
      walkTiles: tiles,
      availability: ok === false ? 'locked' : ok ? 'ready' : 'maybe',
      needs: [{ text: `${b.cost} gp монетами${coins !== null ? ` (в сумке ${coins})` : ''}`, ok }],
      ...(b.note ? { note: b.note } : {}),
    });
  }

  const rank = (o: TravelOption) => (o.availability === 'ready' ? 0 : o.availability === 'maybe' ? 1 : 2);
  return out.filter((o) => o.id === 'walk' || o.walkTiles + MIN_SAVING_TILES <= direct).sort((x, y) => rank(x) - rank(y) || x.walkTiles - y.walkTiles);
}

/** «40 кл. · бегом не меньше 12 с»: нижняя оценка — преграды, бой и энергия делают дольше. */
export function walkText(tiles: number): string {
  if (tiles <= 0) return 'на месте';
  const sec = Math.ceil(tiles / TILES_PER_SECOND);
  return `${tiles} кл. · бегом не меньше ${sec < 90 ? `${sec} с` : `${Math.round(sec / 60)} мин`}`;
}
