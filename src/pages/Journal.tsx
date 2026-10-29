// The Journal: one place for the progress records. Quests on the left page; the stage goals table and the session /
// resource journal on the right. It is only an entry point: each view is the page that already existed (#/quests, #/goals)
// or the session block from Settings. No progress is stored here.
import { QuestsPage } from './Quests';
import { GoalsPage } from './Goals';
import { SessionSection } from './SettingsExtra';
import { Eyebrow, Page } from '../ledger';

export type JournalTab = 'quests' | 'goals' | 'session';

/** The Journal tab a route stands for: the old hashes keep opening their own tab. */
export function journalTabOf(page: string, param?: string): JournalTab {
  if (page === 'goals') return 'goals';
  if (page === 'journal' && param === 'session') return 'session';
  if (page === 'journal' && param === 'goals') return 'goals';
  return 'quests';
}

export function JournalPage({ tab }: { tab: JournalTab }) {
  const side = tab === 'session' ? 'session' : 'goals';
  return (
    <>
      <Page side="l" basis={600} className="journal" label="Quests">
        <div className="page la-scroll">
          <Eyebrow>JOURNAL</Eyebrow>
          <header className="page-head">
            <h1>Journal</h1>
            <p className="muted">Track your progress and plan ahead.</p>
          </header>
          <QuestsPage embedded />
        </div>
      </Page>
      <Page side="r" className="journal" label={side === 'goals' ? 'Stage goals' : 'Session'}>
        <nav className="la-seg journal-views" aria-label="Journal views">
          <a href="#/journal/goals" className={side === 'goals' ? 'la-on' : ''} aria-current={side === 'goals' ? 'page' : undefined}>STAGE GOALS</a>
          <a href="#/journal/session" className={side === 'session' ? 'la-on' : ''} aria-current={side === 'session' ? 'page' : undefined}>SESSION</a>
        </nav>
        <div className="la-scroll">
          {side === 'goals' && <GoalsPage embedded />}
          {side === 'session' && (
            <div className="journal-pane">
              <h2 className="visually-hidden">Session</h2>
              <SessionSection />
            </div>
          )}
        </div>
      </Page>
    </>
  );
}
