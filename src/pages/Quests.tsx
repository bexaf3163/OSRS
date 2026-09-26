import { useState } from 'react';
import type { Progress, Quest } from '../types';
import { questsData, stepById } from '../data';
import { useStore } from '../store';
import { blockerParts, blockersOf, isClosed } from '../lib/next-step';
import { IconCheck, IconChevron, IconLock } from '../components/Icons';

type Status = 'done' | 'skipped' | 'available' | 'blocked';
type Filter = 'all' | 'done' | 'available' | 'blocked';

const FILTERS: [Filter, string][] = [
  ['all', 'Все'],
  ['done', 'Сделанные'],
  ['available', 'Доступные'],
  ['blocked', 'Заблокированные'],
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

export function QuestsPage() {
  const { progress, qp } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const rows = questsData.quests.map((q) => questRow(q, progress, qp));
  const base: Status = 'done';
  const count = (f: Filter) => rows.filter((r) => matches(f, r.status)).length + (matches(f, base) ? 1 : 0);
  const visible = rows.filter((r) => matches(filter, r.status));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Квесты</h1>
        <p className="muted">{count('done')} из {rows.length + 1} · очки квестов {qp}</p>
      </header>

      <div className="segmented" role="group" aria-label="Фильтр квестов">
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
                <span className="quest-title">{questsData.base.title}</span>
                <span className="quest-meta">Обучающий остров · +{questsData.base.qp} QP · уже пройден</span>
              </span>
            </div>
          </li>
        )}
        {visible.map((r) => (
          <li key={r.quest.stepId} className={`quest is-${r.status}`}>
            <a className="quest-link" href={r.href}>
              <span className="quest-status">
                {r.status === 'done' ? <IconCheck /> : r.status === 'blocked' ? <IconLock /> : null}
              </span>
              <span className="quest-body">
                <span className="quest-title">{r.quest.title}</span>
                <span className="quest-meta">
                  Этап {r.quest.stage} · +{r.quest.qp} QP
                  {r.quest.parts.length > 0 && ` · шагов ${r.partsDone} / ${r.quest.parts.length}`}
                  {' · '}
                  <span className="quest-state">{{ done: 'сделан', skipped: 'пропущен', available: 'доступен', blocked: 'заблокирован' }[r.status]}</span>
                </span>
                {r.blocked && <span className="quest-blocked">Сначала: {r.blocked}</span>}
              </span>
              <IconChevron className="chevron" />
            </a>
          </li>
        ))}
      </ul>
      {!visible.length && !matches(filter, base) && <p className="muted empty">Здесь пусто.</p>}
    </div>
  );
}
