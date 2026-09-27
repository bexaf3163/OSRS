// Маршруты на hash: работают на GitHub Pages и из любой папки без настройки сервера.

import { useEffect, useState } from 'react';

export type Page = 'path' | 'skills' | 'goals' | 'quests' | 'reference' | 'settings' | 'shopping';

export interface Route {
  page: Page;
  /** Код навыка, раздела справки или шага (#/step/S3-05 открывает Путь с раскрытым шагом). */
  param?: string;
  step?: string;
  /** Растёт с каждым переходом — чтобы повторный клик по той же ссылке снова прокрутил к шагу. */
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
