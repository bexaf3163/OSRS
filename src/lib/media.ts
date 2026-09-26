// Медиазапрос как состояние React. Масштаб программы для ПК меняет ширину для медиазапросов честно,
// поэтому раскладка переключается и от размера окна, и от масштаба интерфейса.

import { useEffect, useState } from 'react';

/** Три колонки «Пути»: лента этапов + шаг. */
export const WIDE = '(min-width: 1080px)';
/** Досье вики закреплено третьей колонкой, а не выезжает поверх. */
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
