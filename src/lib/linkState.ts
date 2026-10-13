// One vocabulary for "is the game guiding me right now": the link state, and what a saved target means with and without it.
// A target saved in the app (or restored after a restart) is a configuration. It becomes live guidance only while RuneLite is connected.

export type LinkState = 'off' | 'connecting' | 'offline' | 'online';

export type LinkStatus = 'connected' | 'waiting-character' | 'connecting' | 'offline' | 'disabled';

/** The header status: connected and in game, client ready but not logged in, connecting, disconnected, or the link is switched off. */
export function linkStatus(state: LinkState, inGame: boolean): LinkStatus {
  if (state === 'off') return 'disabled';
  if (state === 'connecting') return 'connecting';
  if (state === 'offline') return 'offline';
  return inGame ? 'connected' : 'waiting-character';
}

export const LINK_LABEL: Record<LinkStatus, string> = {
  connected: 'RuneLite connected',
  'waiting-character': 'Waiting for character',
  connecting: 'Connecting…',
  offline: 'RuneLite offline',
  disabled: 'RuneLite link off',
};

export const LINK_SHORT: Record<LinkStatus, string> = {
  connected: 'Connected',
  'waiting-character': 'Waiting',
  connecting: '…',
  offline: 'Offline',
  disabled: 'Off',
};

export type TargetStatus = 'none' | 'live' | 'saved';

/**
 * What a target means: nothing selected, leading in the game right now (connected and logged in), or saved and waiting.
 * The saved target is shown as a plan, never as an arrow that exists.
 */
export function targetStatus(hasTarget: boolean, state: LinkState, inGame: boolean): TargetStatus {
  if (!hasTarget) return 'none';
  return state === 'online' && inGame ? 'live' : 'saved';
}

export const TARGET_LABEL: Record<Exclude<TargetStatus, 'none'>, string> = {
  live: 'Shown in the game',
  saved: 'Target saved. Waiting for RuneLite',
};
