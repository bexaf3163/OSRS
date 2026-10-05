// A media query as React state. The desktop app's scale changes the width for media queries honestly,
// so the layout switches on both the window size and the interface scale.

import { useEffect, useState } from 'react';

/** The three columns of "Path": the stage strip + the step. */
export const WIDE = '(min-width: 1080px)';
/** The wiki dossier is pinned as the third column rather than sliding over the top. */
export const DOCK = '(min-width: 1260px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
