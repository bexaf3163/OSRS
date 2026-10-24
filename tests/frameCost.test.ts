// T09: the heartbeats carry the client's FPS and our overlays' draw time; the session report turns them into one line of acceptance data.
import { describe, expect, it } from 'vitest';
import { analyze, formatReport, frameCost, type TelemetryEvent } from '../src/lib/telemetryReport';

const beat = (t: number, fps: number, drawUs: number, drawMaxUs: number): TelemetryEvent => ({ t, kind: 'beat', tick: t, fps, drawUs, drawMaxUs }) as TelemetryEvent;

describe('frame cost from heartbeats', () => {
  it('median and slowest-5% FPS, the average draw time and the worst frame', () => {
    const events = Array.from({ length: 20 }, (_, i) => beat(i * 30_000, i === 0 ? 20 : 50 + (i % 3), 400 + i, 900 + i * 10));
    expect(frameCost(events)).toEqual({ beats: 20, fpsMedian: 51, fpsLow: 20, drawAvgUs: 410, drawWorstUs: 1090 });
    expect(formatReport(analyze(events))).toMatch(/Frames: 51 FPS median, 20 at the slowest 5%; our overlays 0\.41 ms a frame on average, the worst frame 1\.1 ms/);
  });

  it('an older journal without the fields has no frame line', () => {
    const events = [{ t: 0, kind: 'beat', tick: 1 } as TelemetryEvent];
    expect(frameCost(events)).toBeNull();
    expect(formatReport(analyze(events))).not.toMatch(/Frames:/);
  });
});

describe('long lines on screen', () => {
  const ui = (text: string): TelemetryEvent => ({ t: 1, kind: 'ui', text } as TelemetryEvent);
  it('a warning shown whole is not a finding; an ordinary long line still is', () => {
    const warning = `! No Anti-dragon shield with you — Do not board the ship without it: Elvarg's fire hits up to 70. Duke Horacio gives it free.`;
    expect(analyze([ui(warning)]).findings.some((f) => f.code === 'UI_LONG')).toBe(false);
    expect(analyze([ui('x'.repeat(120))]).findings.some((f) => f.code === 'UI_LONG')).toBe(true);
  });
});
