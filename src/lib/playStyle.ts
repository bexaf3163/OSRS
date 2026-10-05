// Play style: "calm" or "efficient". One setting that all the helpers read, instead of separate switches:
//  - calm: less on the screen, nothing is pushed; training methods without risk and without extra clicks;
//  - efficient: more hints and comparisons; the methods are the fastest available, with a time estimate.
// The style changes only the presentation and the order of choice. The step's requirements, safety and "unknown is not none" are always the same.

import type { Features } from './features';

export type PlayStyle = 'chill' | 'efficient';

export interface StyleProfile {
  style: PlayStyle;
  label: string;
  /** Steps ahead after the current one in "one trip". */
  lookAhead: number;
  /** Show "Later" in one trip. */
  showLater: boolean;
  /** Show the time estimate and the comparison of methods. */
  showTime: boolean;
  /** How many other methods to show at once (the rest are under "More"). */
  alternatives: number;
  /** quiet means messages only about the main thing (done, time to go back); full means also "what is next in the queue". */
  announce: 'quiet' | 'full';
}

export const STYLES: Record<PlayStyle, StyleProfile> = {
  chill: { style: 'chill', label: '🌿 Calm', lookAhead: 2, showLater: false, showTime: false, alternatives: 0, announce: 'quiet' },
  efficient: { style: 'efficient', label: '⚡ Efficient', lookAhead: 4, showLater: true, showTime: true, alternatives: 3, announce: 'full' },
};

export const styleOf = (f: Pick<Features, 'efficient'>): StyleProfile => (f.efficient ? STYLES.efficient : STYLES.chill);
