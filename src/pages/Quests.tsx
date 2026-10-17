// The "Quests" screen: the route quests, the quest points and what they unlock.
import { useState } from 'react';
import type { Progress, Quest } from '../types';
import { allQuests, BASE_QP, BASE_QUEST, stepById } from '../data';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { useQuestPoints } from '../lib/useQuestPoints';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { IconCheck, IconChevron, IconLock, TypeIcon } from '../components/Icons';
import { ItemIcon } from '../components/WikiDrawer';

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

function questRow(q: Quest, p: Progress, qp: number): Row {
  const final = p.steps[q.stepId];
  const parts = q.parts.length ? q.parts : [q.stepId];
  const partsDone = parts.filter((id) => isClosed(p, id)).length;
  const firstOpen = parts.find((id) => !isClosed(p, id));
  const href = `#/step/${firstOpen ?? q.stepId}`;
  if (final === 'done') return { quest: q, status: 'done', href, partsDone };
  if (final === 'skipped') return { quest: q, status: 'skipped', href, partsDone };
  const open = parts.filter((id) => !isClosed(p, id)).map((id) => stepById.get(id)!);
  const ready = open.find((s) => !blockersOf(s, p, qp));
  if (ready) return { quest: q, status: 'available', href: `#/step/${ready.id}`, partsDone };
  const b = blockersOf(open[0], p, qp);
  return { quest: q, status: 'blocked', href, partsDone, blocked: b ? blockerParts(b).join(', ') : undefined };
}

const matches = (f: Filter, s: Status) => f === 'all' || f === s || (f === 'done' && s === 'skipped');
const questKey = (title: string) => title.trim().toLowerCase().replace(/[’`]/g, "'");

export function QuestsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { progress, mode } = useStore();
  const qp = useQuestPoints();
  const { questsDone } = useBridge();
  // Marked done here but not finished in the game (an optional quest that cannot be finished alone): said, and not in the game's points.
  const gameDone = questsDone ? new Set(questsDone.map(questKey)) : null;
  const notInGame = (r: Row) => r.status === 'done' && gameDone !== null && !gameDone.has(questKey(r.quest.title));
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const rows = allQuests.filter((q) => mode === 'members' || !q.membersOnly).map((q) => questRow(q, progress, qp));
  const base: Status = 'done';
  const count = (f: Filter) => rows.filter((r) => matches(f, r.status)).length + (matches(f, base) ? 1 : 0);
  const visible = rows.filter((r) => matches(filter, r.status));
  const selected = visible.find(r => r.quest.stepId === selectedId) ?? visible.find(r => r.status === 'available') ?? visible[0];
  const selectedStep = selected ? stepById.get(selected.quest.stepId) : undefined;

  return (
    <div className={embedded ? 'journal-pane' : 'page'}>
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

      <div className="quest-workspace">
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
                  Stage {r.quest.stage}{r.quest.membersOnly && ' · Members'}{r.quest.qp > 0 && ` · +${r.quest.qp} QP`}
                  {r.quest.parts.length > 0 && ` · steps ${r.partsDone} / ${r.quest.parts.length}`}
                  {' · '}
                  <span className="quest-state">{{ done: 'done', skipped: 'skipped', available: 'available', blocked: 'blocked' }[r.status]}</span>
                  {notInGame(r) && ' · not finished in the game'}
                </span>
                {r.blocked && <span className="quest-blocked">First: {r.blocked}</span>}
              </span>
              <IconChevron className="chevron" />
            </span></button>
          </li>
        ))}
      </ul>
      {selected && <aside className="card quest-preview" aria-label="Selected quest">
        <div className="quest-preview-heading"><TypeIcon type="quest" /><h2>{selected.quest.title}</h2></div>
        <p className="muted">Stage {selected.quest.stage} · {selected.status}</p>
        {selected.quest.qp > 0 && <p className="badge badge-qp">+{selected.quest.qp} quest points</p>}
        {notInGame(selected) && <p className="notice">Marked done here, but the game does not count it as finished: its quest points are not in your total.</p>}
        {selected.quest.parts.length > 0 && <p>{selected.partsDone} / {selected.quest.parts.length} route steps completed</p>}
        {selected.blocked && <p className="notice">First: {selected.blocked}</p>}
        <a className="btn btn-primary" href={selected.href}>View route <IconChevron /></a>
        <details className="quest-preview-requirements"><summary>Requirements</summary>
          {selectedStep?.itemsRequired?.length ? <ul>{selectedStep.itemsRequired.map((item,i) => <li key={`${item.nameEn}-${i}`}><ItemIcon src={item.iconUrl} alt="" size={28} /><span>{item.nameEn}{item.amount ? ` ×${item.amount}` : ''}</span></li>)}</ul> : <p className="muted small">No preparation items listed.</p>}
          {selectedStep?.doneWhen && <p className="muted small">Done when: {selectedStep.doneWhen}</p>}
        </details>
      </aside>}
      </div>
      {!visible.length && !matches(filter, base) && <p className="muted empty">Nothing here.</p>}
    </div>
  );
}
