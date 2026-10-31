// Quests and the session/resource journal share the existing progress records.
import { QuestsPage } from './Quests';
import { SessionSection } from './SettingsExtra';
import { Eyebrow, Page } from '../ledger';

export function JournalPage() {
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
      <Page side="r" className="journal" label="Session">
        <div className="la-scroll">
            <div className="journal-pane">
              <h2 className="visually-hidden">Session</h2>
              <SessionSection />
            </div>
        </div>
      </Page>
    </>
  );
}
