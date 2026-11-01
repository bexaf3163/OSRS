// Hash routes: they work on GitHub Pages and from any folder without server setup.

import { useEffect, useState } from 'react';
import { type Route, parsePath } from '../domain/pages/pages';

let counter = 0;

export function parseHash(hash: string): Route {
  return { ...parsePath(hash), key: ++counter };
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
