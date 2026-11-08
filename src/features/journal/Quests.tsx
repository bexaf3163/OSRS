// The "Quests" screen: the route quests, the quest points and what they unlock.
import { useState, type ReactNode } from 'react';
import type { Progress, Quest } from '../../types';
import { allQuests, BASE_QP, BASE_QUEST, stepById } from '../../data';
import { useBridge } from '../../state/bridge';
import { useDecision } from '../../state/decision';
import { useStore } from '../../state/store';
import { useQuestPoints } from '../../state/hooks/useQuestPoints';
import { blockerParts, blockersOf, isClosed, type DependencyFact } from '../../domain/quests/next-step';
import { useReadinessEngine } from '../../state/readinessContext';
import { IconCheck, IconChevron, IconLock, TypeIcon } from '../../ui/Icons';
import { ItemIcon } from '../reference/WikiDrawer';
import { hrefTo, stepIdOf } from '../../domain/pages/pages';

type Status = 'done' | 'skipped' | 'available' | 'blocked';
type Filter = 'all' | 'done' | 'available' | 'blocked';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['done', 'Done'],
  ['available', 'Available'],
  ['blocked', 'Blocked'],
];

interface Row {
  quest: Quest;
  status: Status;
  href: string;
  partsDone: number;
  blocked?: string;
}

function questRow(q: Quest, p: Progress, qp: number, fact: DependencyFact): Row {
  const final = p.steps[q.stepId];
  const parts = q.parts.length ? q.parts : [q.stepId];
  const partsDone = parts.filter((id) => isClosed(p, id)).length;
  const firstOpen = parts.find((id) => !isClosed(p, id));
  const href = hrefTo.step(firstOpen ?? q.stepId);
  if (final === 'done') return { quest: q, status: 'done', href, partsDone };
  if (final === 'skipped') return { quest: q, status: 'skipped', href, partsDone };
  const open = parts.filter((id) => !isClosed(p, id)).map((id) => stepById.get(id)!);
  const ready = open.find((s) => !blockersOf(s, p, qp, fact));
  if (ready) return { quest: q, status: 'available', href: hrefTo.step(ready.id), partsDone };
  const b = blockersOf(open[0], p, qp, fact);
  return { quest: q, status: 'blocked', href, partsDone, blocked: b ? blockerParts(b).join(', ') : undefined };
}

const matches = (f: Filter, s: Status) => f === 'all' || f === s || (f === 'done' && s === 'skipped');
const questKey = (title: string) => title.trim().toLowerCase().replace(/[’`]/g, "'");

export function QuestsPage({ embedded = false, render }: { embedded?: boolean; render?: (list: ReactNode, detail: ReactNode) => ReactNode } = {}) {
  const { progress, mode, steps } = useStore();
  const qp = useQuestPoints();
  const { dependencies } = useReadinessEngine();
  const { questsDone } = useBridge();
  // The planner's live rank orders the list; quests it did not rank (done, members) keep the guide's order after them.
  const decision = useDecision();
  const planned = new Map((decision?.candidates ?? []).map((row) => [questKey(row.id), row]));
  const planOf = (r: Row) => planned.get(questKey(r.quest.title));
  // Marked done here but not finished in the game (an optional quest that cannot be finished alone): said, and not in the game's points.
  const gameDone = questsDone ? new Set(questsDone.map(questKey)) : null;
  const notInGame = (r: Row) => r.status === 'done' && gameDone !== null && !gameDone.has(questKey(r.quest.title));
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const rows = allQuests.filter((q) => mode === 'members' || !q.membersOnly).map((q) => questRow(q, progress, qp, dependencies))
    .sort((a, b) => (planOf(a)?.rank ?? 1e9) - (planOf(b)?.rank ?? 1e9));
  const base: Status = 'done';
  const count = (f: Filter) => rows.filter((r) => matches(f, r.status)).length + (matches(f, base) ? 1 : 0);
  const visible = rows.filter((r) => matches(filter, r.status));
  const selected = visible.find(r => r.quest.stepId === selectedId) ?? visible.find(r => r.status === 'available') ?? visible[0];
  // The planned step (personal food plan), never the raw guide step.
  const selectedStep = selected ? steps.find((s) => s.id === stepIdOf(selected.href)) : undefined;

  const list = (<div className={embedded ? 'journal-pane' : 'page'}>
      <header className="page-head">
        {embedded ? <h2>Quests</h2> : <h1>Quests</h1>}
        <p className="muted">{count('done')} of {rows.length + 1} · quest points {qp}</p>
      </header>

      <div className="segmented" role="group" aria-label="Quest filter">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f}
            className={`seg ${filter === f ? 'is-active' : ''}`} onClick={() => setFilter(f)}>
            {label} <span className="seg-count">{count(f)}</span>
          </button>
        ))}
      </div>

      <ul className="quest-list">
        {matches(filter, base) && (
          <li className="quest is-done">
            <div className="quest-link is-static">
              <span className="quest-status"><IconCheck /></span>
              <span className="quest-body">
                <span className="quest-title">{BASE_QUEST}</span>
                <span className="quest-meta">Tutorial Island · +{BASE_QP} QP · already completed</span>
              </span>
            </div>
          </li>
        )}
        {visible.map((r) => (
          <li key={r.quest.stepId} className={`quest is-${r.status} ${selected === r ? 'is-selected' : ''}`}>
            <button type="button" className="quest-select" aria-pressed={selected === r} onClick={() => setSelectedId(r.quest.stepId)}><span className="quest-link">
              <span className="quest-status">
                {r.status === 'done' ? <IconCheck /> : r.status === 'blocked' ? <IconLock /> : null}
              </span>
              <span className="quest-body">
                <span className="quest-title">{r.quest.title}</span>
                <span className="quest-meta">
                  {r.quest.membersOnly ? 'Members' : 'Free'}{r.quest.qp > 0 && ` · +${r.quest.qp} QP`}
                  {r.quest.parts.length > 0 && ` · steps ${r.partsDone} / ${r.quest.parts.length}`}
                  {' · '}
                  <span className="quest-state">{{ done: 'done', skipped: 'skipped', available: 'available', blocked: 'blocked' }[r.status]}</span>
                  {planOf(r) && <span className="quest-plan"> · planner #{planOf(r)!.rank}</span>}
                  {notInGame(r) && ' · not finished in the game'}
                </span>
                {r.blocked && <span className="quest-blocked">First: {r.blocked}</span>}
              </span>
              <IconChevron className="chevron" />
            </span></button>
          </li>
        ))}
      </ul>
      {!visible.length && !matches(filter, base) && <p className="muted empty">Nothing here.</p>}
  </div>);
  const detail = (<>
      {selected && <section className="card quest-preview" aria-label="Selected quest">
        <div className="quest-preview-heading"><TypeIcon type="quest" /><h2>{selected.quest.title}</h2></div>
        <p className="muted">{selected.status}</p>
        {selected.quest.qp > 0 && <p className="badge badge-qp">+{selected.quest.qp} quest points</p>}
        {notInGame(selected) && <p className="notice">Marked done here, but the game does not count it as finished: its quest points are not in your total.</p>}
        {selected.quest.parts.length > 0 && <p>{selected.partsDone} / {selected.quest.parts.length} route steps completed</p>}
        {planOf(selected) && <p className="muted small">Planner #{planOf(selected)!.rank}: {planOf(selected)!.verdict}</p>}
        {selected.blocked && <p className="notice">First: {selected.blocked}</p>}
        <a className={`btn ${selected.status === 'done' || selected.status === 'skipped' ? 'btn-ghost' : 'btn-primary'}`} href={selected.href}>{selected.status === 'done' || selected.status === 'skipped' ? 'Review route' : selected.partsDone > 0 ? 'Continue quest' : 'View route'} <IconChevron /></a>
        <details className="quest-preview-requirements"><summary>Requirements</summary>
          {selectedStep?.itemsRequired?.length ? <ul>{selectedStep.itemsRequired.map((item,i) => <li key={`${item.nameEn}-${i}`}><ItemIcon src={item.iconUrl} alt="" size={28} /><span>{item.nameEn}{item.amount ? ` ×${item.amount}` : ''}</span></li>)}</ul> : <p className="muted small">No preparation items listed.</p>}
          {selectedStep?.doneWhen && <p className="muted small">Done when: {selectedStep.doneWhen}</p>}
        </details>
      </section>}

    {!selected && <p className="muted empty">Select a quest from the list, or change the filter.</p>}
    {rows.length > 0 && rows.every(row => row.status === 'done' && !notInGame(row)) && <section className="card" aria-label="Quest route complete">
      <h2 className="subhead">Quest route complete</h2>
      <p className="small muted">{gameDone ? 'These route quests are complete in the game.' : 'These route quests are marked complete in your saved progress.'} Choose a skill for your next activity.</p>
      <a className="btn btn-primary" href={hrefTo.skills()}>Choose training</a>
    </section>}
  </>);
  return render ? render(list, detail) : <div className="quest-workspace">{list}{detail}</div>;
}
