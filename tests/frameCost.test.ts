// T09: the heartbeats carry the client's FPS and our overlays' draw time; the session report turns them into one line of acceptance data.
import { describe, expect, it } from 'vitest';
import { analyze, formatReport, frameCost, type TelemetryEvent } from '../src/lib/telemetryReport';

const beat = (t: number, fps: number, drawUs: number, drawMaxUs: number): TelemetryEvent => ({ t, kind: 'beat', tick: t, fps, drawUs, drawMaxUs }) as TelemetryEvent;

describe('frame cost from heartbeats', () => {
  it('median and slowest-5% FPS, the average draw time and the worst frame', () => {
    const events = Array.from({ length: 20 }, (_, i) => beat(i * 30_000, i === 0 ? 20 : 50 + (i % 3), 400 + i, 900 + i * 10));
    expect(frameCost(events)).toEqual({ beats: 20, fpsMedian: 51, fpsLow: 20, drawAvgUs: 410, drawWorstUs: 1090, background: 0, onlyBackground: false });
    expect(formatReport(analyze(events))).toMatch(/Frames: 51 FPS median, 20 at the slowest 5%; our overlays 0\.41 ms a frame on average, the worst frame 1\.1 ms/);
  });

  // Live 2.74.15: "5 FPS median" was RuneLite limiting a window in the background, not the guide.
  it('heartbeats with the window in the background are left out, and said so', () => {
    const front = Array.from({ length: 10 }, (_, i) => ({ ...beat(i * 30_000, 70, 1200, 2000), focus: true }) as TelemetryEvent);
    const back = Array.from({ length: 30 }, (_, i) => ({ ...beat(400_000 + i * 30_000, 5, 1200, 1500), focus: false }) as TelemetryEvent);
    expect(frameCost([...front, ...back])).toMatchObject({ beats: 10, fpsMedian: 70, fpsLow: 70, background: 30, onlyBackground: false });
    expect(formatReport(analyze([...front, ...back]))).toMatch(/\(10 heartbeats; 30 with the window in the background left out\)/);
    expect(frameCost(back)).toMatchObject({ beats: 30, fpsMedian: 5, onlyBackground: true });
    expect(formatReport(analyze(back))).toMatch(/all with the game window in the background/);
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
