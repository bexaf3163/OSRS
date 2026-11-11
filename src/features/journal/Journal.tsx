// One selection drives both book pages: the list on the left, the chosen quest on the right. Session statistics live in Settings →
// Progress and copies (2.93: they said nothing about the chosen quest here).
import { QuestsPage } from './Quests';
import { Eyebrow, Page } from '../../ledger';

export function JournalPage() {
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
      </div>
    </Page>
  </>} />;
}
