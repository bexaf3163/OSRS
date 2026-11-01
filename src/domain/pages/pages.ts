// The app's pages and their hash links: links are built and parsed only here; src/app/router.ts follows the address bar.

export type Page = 'path' | 'skills' | 'quests' | 'journal' | 'reference' | 'settings' | 'shopping' | 'gear' | 'money';
export interface Route {
  page: Page;
  /** The code of a skill, a reference section or a step (#/step/S3-05 opens Path with the step expanded). */
  param?: string;
  step?: string;
  /** Direct skill selection within a grouped guide, for example ME/defence. */
  skill?: string;
  /** Explicit preparation target; ordinary skill navigation keeps its normal suggested checkpoint. */
  goal?: number;
  /** Grows with every navigation, so that a repeated click on the same link scrolls to the step again. */
  key: number;
}
export function parsePath(hash: string): Omit<Route, 'key'> {
  const [path, query] = hash.replace(/^#\/?/, '').split('?', 2);
  const [first, second, third] = path.split('/').map(decodeURIComponent);
  const rawGoal = new URLSearchParams(query).get('goal');
  const goal = rawGoal && /^\d{1,2}$/.test(rawGoal) && Number(rawGoal) >= 2 ? Number(rawGoal) : undefined;
  switch (first) {
    case 'step': return { page: 'path', step: second };
    case 'skills': return { page: 'skills', param: second, ...(third ? { skill: third } : {}), ...(goal !== undefined ? { goal } : {}) };
    case 'goals': return { page: 'journal', param: 'session' };
    case 'quests': return { page: 'quests' };
    // Old goal links open the surviving Journal; internal planning goals are independent of this retired screen.
    case 'journal': return { page: 'journal', param: second };
    case 'reference': return { page: 'reference', param: second };
    case 'settings': return { page: 'settings' };
    case 'shopping': return { page: 'shopping' };
    case 'gear': return { page: 'gear' };
    case 'money': return { page: 'money' };
    default: return { page: 'path' };
  }
}

const STEP = '#/step/';

/** Hash links to the pages; parsePath reads the same shapes back. */
export const hrefTo = {
  path: () => '#/',
  step: (id: string) => `${STEP}${id}`,
  skills: (param?: string, skill?: string, goal?: number) => `#/skills${param === undefined ? '' : `/${param}`}${skill === undefined ? '' : `/${skill}`}${goal === undefined ? '' : `?goal=${goal}`}`,
  quests: () => '#/quests',
  journal: () => '#/journal',
  reference: (section?: string) => (section === undefined ? '#/reference' : `#/reference/${section}`),
  settings: () => '#/settings',
  shopping: () => '#/shopping',
  gear: () => '#/gear',
  money: () => '#/money',
};

/** The step a step link opens; null for any other link. */
export const stepIdOf = (href: string): string | null => (href.startsWith(STEP) ? href.slice(STEP.length) : null);
