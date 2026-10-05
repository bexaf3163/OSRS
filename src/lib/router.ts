// Hash routes: they work on GitHub Pages and from any folder without server setup.

import { useEffect, useState } from 'react';

export type Page = 'path' | 'skills' | 'goals' | 'quests' | 'reference' | 'settings' | 'shopping' | 'gear';

export interface Route {
  page: Page;
  /** The code of a skill, a reference section or a step (#/step/S3-05 opens Path with the step expanded). */
  param?: string;
  step?: string;
  /** Grows with every navigation, so that a repeated click on the same link scrolls to the step again. */
  key: number;
}

let counter = 0;

export function parseHash(hash: string): Route {
  return { ...parsePath(hash), key: ++counter };
}

function parsePath(hash: string): Omit<Route, 'key'> {
  const [first, second] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (first) {
    case 'step': return { page: 'path', step: second };
    case 'skills': return { page: 'skills', param: second };
    case 'goals': return { page: 'goals' };
    case 'quests': return { page: 'quests' };
    case 'reference': return { page: 'reference', param: second };
    case 'settings': return { page: 'settings' };
    case 'shopping': return { page: 'shopping' };
    case 'gear': return { page: 'gear' };
    default: return { page: 'path' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function go(href: string): void {
  if (location.hash === href) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = href;
}
