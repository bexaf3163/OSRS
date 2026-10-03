// Темп опыта из замеров плагина: опыт по навыкам приходит каждые ~3 секунды, пока идёт прокачка.
// Скорость — прирост за окно замеров (до 10 минут), только когда игрок действительно качается:
// после двух минут без прироста замеры сбрасываются, иначе перерыв на банк занижал бы темп.

const WINDOW_MS = 10 * 60_000;
const IDLE_MS = 2 * 60_000;
const MIN_SPAN_MS = 30_000;

interface Sample { t: number; xp: number }

export class XpTracker {
  private samples = new Map<string, Sample[]>();
  private lastGain = new Map<string, number>();

  /** Новый снимок опыта {навык: опыт}. now — миллисекунды (Date.now()). */
  push(xp: Readonly<Record<string, number>>, now: number): void {
    for (const [skill, value] of Object.entries(xp)) {
      if (!Number.isFinite(value)) continue;
      const list = this.samples.get(skill) ?? [];
      const last = list[list.length - 1];
      if (last && value < last.xp) { list.length = 0; } // другой персонаж или сброс — начинаем заново
      if (last && value > last.xp) this.lastGain.set(skill, now);
      else if (last && now - (this.lastGain.get(skill) ?? last.t) > IDLE_MS) list.length = 0;
      if (!list.length) this.lastGain.set(skill, now);
      // Одинаковые подряд замеры не копим — хватает первого и последнего.
      if (list.length >= 2 && list[list.length - 1].xp === value && list[list.length - 2].xp === value) list[list.length - 1] = { t: now, xp: value };
      else list.push({ t: now, xp: value });
      while (list.length > 1 && now - list[0].t > WINDOW_MS) list.shift();
      this.samples.set(skill, list);
    }
  }

  /** Опыта в час по навыку или null — замеров мало или прироста нет. */
  rate(skill: string): number | null {
    const list = this.samples.get(skill);
    if (!list || list.length < 2) return null;
    const first = list[0];
    const last = list[list.length - 1];
    const span = last.t - first.t;
    const gain = last.xp - first.xp;
    if (span < MIN_SPAN_MS || gain <= 0) return null;
    return Math.round((gain / span) * 3_600_000);
  }

  reset(): void {
    this.samples.clear();
    this.lastGain.clear();
  }
}

/** Минут до цели при такой скорости; null — скорости нет или цель достигнута. */
export function etaMinutes(remainingXp: number, perHour: number | null): number | null {
  if (!perHour || perHour <= 0 || remainingXp <= 0) return null;
  return Math.ceil((remainingXp / perHour) * 60);
}

/** «≈ 25 мин», «≈ 1 ч 20 мин». */
export function etaText(minutes: number): string {
  if (minutes < 60) return `≈ ${Math.max(1, minutes)} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `≈ ${h} ч ${m} мин` : `≈ ${h} ч`;
}
