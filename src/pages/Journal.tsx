// One selection drives both book pages; session data remains available without occupying a whole leaf.
import { QuestsPage } from './Quests';
import { SessionSection } from './SettingsExtra';
import { Eyebrow, Page } from '../ledger';

export function JournalPage({ session = false }: { session?: boolean } = {}) {
  return <QuestsPage embedded render={(list, detail) => <>
    <Page side="l" basis={560} className="journal" label="Quests">
      <div className="page la-scroll">
        <Eyebrow>JOURNAL</Eyebrow>
        <header className="page-head"><h1>Journal</h1><p className="muted">Choose a quest to see its status and next action.</p></header>
        {list}
      </div>
    </Page>
    <Page side="r" className="journal" label="Quest details">
      <div className="page la-scroll">
        <Eyebrow>QUEST DETAILS</Eyebrow>
        {detail}
        <details className="journal-session" open={session || undefined}><summary className="small">Session statistics</summary><SessionSection /></details>
      </div>
    </Page>
  </>} />;
}
