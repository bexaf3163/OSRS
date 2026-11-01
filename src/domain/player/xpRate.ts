// The XP rate from the plugin's measurements: skill XP arrives every ~3 seconds while training goes on.
// The speed is the gain over the measurement window (up to 10 minutes), only when the player is really training:
// after two minutes without a gain the measurements are reset, otherwise a bank break would understate the rate.

const WINDOW_MS = 10 * 60_000;
const IDLE_MS = 2 * 60_000;
const MIN_SPAN_MS = 30_000;

interface Sample { t: number; xp: number }

export class XpTracker {
  private samples = new Map<string, Sample[]>();
  private lastGain = new Map<string, number>();

  /** A new XP snapshot {skill: xp}. now — milliseconds (Date.now()). */
  push(xp: Readonly<Record<string, number>>, now: number): void {
    for (const [skill, value] of Object.entries(xp)) {
      if (!Number.isFinite(value)) continue;
      const list = this.samples.get(skill) ?? [];
      const last = list[list.length - 1];
      if (last && value < last.xp) { list.length = 0; } // another character or a reset — start over
      if (last && value > last.xp) this.lastGain.set(skill, now);
      else if (last && now - (this.lastGain.get(skill) ?? last.t) > IDLE_MS) list.length = 0;
      if (!list.length) this.lastGain.set(skill, now);
      // Identical consecutive measurements are not accumulated — the first and the last are enough.
      if (list.length >= 2 && list[list.length - 1].xp === value && list[list.length - 2].xp === value) list[list.length - 1] = { t: now, xp: value };
      else list.push({ t: now, xp: value });
      while (list.length > 1 && now - list[0].t > WINDOW_MS) list.shift();
      this.samples.set(skill, list);
    }
  }

  /** XP per hour for a skill or null — too few measurements or no gain. */
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

/** Minutes to the goal at this speed; null — there is no speed or the goal is reached. */
export function etaMinutes(remainingXp: number, perHour: number | null): number | null {
  if (!perHour || perHour <= 0 || remainingXp <= 0) return null;
  return Math.ceil((remainingXp / perHour) * 60);
}

/** "≈ 25 min", "≈ 1 h 20 min". */
export function etaText(minutes: number): string {
  if (minutes < 60) return `≈ ${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `≈ ${h} h ${m} min` : `≈ ${h} h`;
}
