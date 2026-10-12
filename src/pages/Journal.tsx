// The Journal: one place for the progress records. Quests, the stage goals table and the session / resource journal.
// It is only an entry point: each tab is the page that already existed (#/quests, #/goals) or the session block from Settings.
// No progress is stored here.

import { QuestsPage } from './Quests';
import { GoalsPage } from './Goals';
import { SessionSection } from './SettingsExtra';

export type JournalTab = 'quests' | 'goals' | 'session';

const TABS: { id: JournalTab; label: string; href: string }[] = [
  { id: 'quests', label: 'Quests', href: '#/quests' },
  { id: 'goals', label: 'Stage goals', href: '#/goals' },
  { id: 'session', label: 'Session', href: '#/journal/session' },
];

/** The Journal tab a route stands for: the old hashes keep opening their own tab. */
export function journalTabOf(page: string, param?: string): JournalTab {
  if (page === 'goals') return 'goals';
  if (page === 'journal' && param === 'session') return 'session';
  if (page === 'journal' && param === 'goals') return 'goals';
  return 'quests';
}

export function JournalPage({ tab }: { tab: JournalTab }) {
  return (
    <div className="page journal">
      <header className="page-head">
        <h1>Journal</h1>
        <p className="muted">Track your progress and plan ahead.</p>
      </header>
      <nav className="subtabs" aria-label="Journal sections">
        {TABS.map((t) => (
          <a key={t.id} href={t.href} className={`subtab ${tab === t.id ? 'is-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      {tab === 'quests' && <QuestsPage embedded />}
      {tab === 'goals' && <GoalsPage embedded />}
      {tab === 'session' && (
        <div className="journal-pane">
          <h2 className="visually-hidden">Session</h2>
          <SessionSection />
        </div>
      )}
    </div>
  );
}
