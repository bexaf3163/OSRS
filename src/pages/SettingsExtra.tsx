// Настройки 2.12: профили персонажей, копия прогресса по расписанию, сводка сеанса и «Диагностика».

import { useEffect, useState } from 'react';
import { levelById } from '../data';
import { useBridge } from '../bridge';
import { desktop, type BackupState } from '../lib/desktop';
import { addProfile, MAIN_ID, readProfiles, removeProfile, renameProfile, switchProfile, useProfiles, writeProfiles } from '../lib/profiles';
import { sessionSummary } from '../lib/session';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { formatGp } from '../lib/shopping';

export function ProfilesSection() {
  const profiles = useProfiles();
  const { gate, player } = useBridge();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const add = () => {
    const r = addProfile(readProfiles(), name);
    if (!r) return;
    writeProfiles(r.state);
    setName('');
    switchProfile(r.id);
  };

  return (
    <section className="card section-card">
      <h2 className="card-title">Профили персонажей</h2>
      <p className="muted small">
        У каждого персонажа свой прогресс. Программа узнаёт персонажа по имени из игры и предложит переключиться; уровни и отметки
        из игры пишутся только в профиль этого персонажа. Первый увиденный персонаж привязывается к профилю сам.
      </p>
      <ul className="profile-list">
        {profiles.list.map((p) => {
          const active = p.id === profiles.active;
          return (
            <li key={p.id} className={`profile ${active ? 'is-active' : ''}`}>
              {renaming?.id === p.id
                ? (
                  <form onSubmit={(e) => { e.preventDefault(); writeProfiles(renameProfile(readProfiles(), p.id, renaming.name)); setRenaming(null); }}>
                    <input aria-label="Название профиля" value={renaming.name} maxLength={30} autoFocus onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} />
                    <button type="submit" className="btn btn-sm">Сохранить</button>
                  </form>
                )
                : <span><strong>{p.name}</strong>{active && ' · открыт'}<span className="muted small"> · {p.player ? `персонаж ${p.player}` : 'персонаж ещё не привязан'}</span></span>}
              <span className="profile-actions">
                {!active && <button type="button" className="btn btn-sm" onClick={() => switchProfile(p.id)}>Открыть</button>}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRenaming({ id: p.id, name: p.name })}>Переименовать</button>
                {p.id !== MAIN_ID && (confirm === p.id
                  ? <button type="button" className="btn btn-sm btn-danger" onClick={() => { writeProfiles(removeProfile(readProfiles(), p.id)); setConfirm(null); if (active) switchProfile(MAIN_ID); }}>Точно удалить (прогресс останется в файле)</button>
                  : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(p.id)}>Удалить</button>)}
              </span>
            </li>
          );
        })}
      </ul>
      <form className="actions" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input aria-label="Название нового профиля" placeholder="Новый профиль, например «Второй»" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn" disabled={profiles.list.length >= 8}>Создать</button>
      </form>
      {player && <p className="muted small">Сейчас в игре: {player}{gate.kind === 'ok' ? ' ✓ профиль совпадает' : ''}.</p>}
    </section>
  );
}

export function BackupSection() {
  const api = desktop()?.backup;
  const [state, setState] = useState<BackupState | null>(null);
  useEffect(() => {
    let alive = true;
    void api?.get().then((s) => alive && setState(s));
    return () => { alive = false; };
  }, [api]);
  if (!api) return null;
  const run = (f: () => Promise<BackupState>) => void f().then(setState);
  return (
    <section className="card section-card">
      <h2 className="card-title">Копия прогресса по расписанию</h2>
      <p className="muted small">
        Раз в сутки (и при запуске) прогресс копируется в выбранную папку, например в OneDrive: файл на каждый профиль и день,
        хранятся последние 14. Восстановить — «Перенос прогресса» → «Загрузить из файла».
      </p>
      <p className="small">
        {state?.dir ? <>Папка: <code className="code">{state.dir}</code></> : 'Копии выключены.'}
        {state?.last && <> Последняя копия: {new Date(state.last).toLocaleString('ru-RU')}.</>}
      </p>
      {state?.error && <p className="notice is-error small" role="alert">Не вышло записать в папку ({state.error}). Выбери другую.</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={() => run(api.choose)}>{state?.dir ? 'Сменить папку' : 'Выбрать папку'}</button>
        {state?.dir && <button type="button" className="btn" onClick={() => run(api.now)}>Сделать копию сейчас</button>}
        {state?.dir && <button type="button" className="btn btn-ghost" onClick={() => run(api.clear)}>Выключить</button>}
      </div>
    </section>
  );
}

export function SessionSection() {
  const { progress } = useStore();
  const { session, xp, stats, state } = useBridge();
  const closed = Object.entries(progress.steps).filter(([, v]) => v === 'done' || v === 'skipped').map(([k]) => k);
  const s = sessionSummary(session, Date.now(), xp, stats, closed);
  return (
    <section className="card section-card">
      <h2 className="card-title">Этот сеанс</h2>
      <p className="small">
        Идёт {s.minutes} мин · закрыто шагов: <strong>{s.stepsDone}</strong>
      </p>
      {state === 'online' && !session.xp0 && <p className="muted small">Опыт и уровни начнут считаться, когда плагин (2.12+) пришлёт их из игры.</p>}
      {s.xpGained.length > 0 && (
        <ul className="small">
          {s.xpGained.slice(0, 8).map((g) => (
            <li key={g.skill}>{levelById.get(g.skill)?.name ?? g.skill}: +{g.xp.toLocaleString('ru-RU')} опыта{g.levels > 0 ? ` · +${g.levels} ур.` : ''}</li>
          ))}
        </ul>
      )}
      <LedgerBlock />
    </section>
  );
}

/** Журнал ресурсов: хранится между сеансами (30 дней) отдельно для каждого персонажа; здесь его можно очистить. */
function LedgerBlock() {
  const { summary, session, since, clearLedger } = usePlayerState();
  const [confirm, setConfirm] = useState(false);
  if (!summary.entries) {
    return <p className="muted small">Журнал ресурсов пуст: он наполняется, пока RuneLite подключён, и хранится между сеансами.</p>;
  }
  return (
    <div className="ledger-block">
      <p className="small">
        <strong>Журнал ресурсов</strong> — записей {summary.entries}{since !== null ? `, с ${new Date(since).toLocaleDateString('ru-RU')}` : ''}. Монеты +{formatGp(summary.coinsEarned)}, потрачено {formatGp(summary.coinsSpent)}
        {summary.estimatedLootValue > 0 ? `, добыча ≈${formatGp(summary.estimatedLootValue)} gp (оценка, не деньги)` : ''}.
        {session.entries > 0 && summary.entries > session.entries ? ` За этот сеанс — ${session.entries}.` : ''}
      </p>
      {confirm ? (
        <div className="actions">
          <button type="button" className="btn btn-danger" onClick={() => { clearLedger(); setConfirm(false); }}>Да, очистить журнал</button>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>Отмена</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setConfirm(true)}>Очистить журнал</button>
      )}
    </div>
  );
}

export function DiagnosticsSection() {
  const { diagnostics } = useBridge();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const collect = async () => {
    const report = await diagnostics();
    setText(report);
    try {
      await navigator.clipboard.writeText(report);
      setNote(`Скопировано в буфер (${report.split('\n').length} строк) — вставь в чат.`);
    } catch {
      setNote('Буфер недоступен — выдели текст ниже и скопируй сам.');
    }
  };
  return (
    <section className="card section-card">
      <h2 className="card-title">Диагностика</h2>
      <p className="muted small">
        Если что-то работает не так: нажми — программа соберёт версии, состояние связи с RuneLite, последние события моста и сводку журнала плагина (сколько записано, какие странности нашёл сторож).
        Сумки, банка и заметок в отчёте нет.
      </p>
      <div className="actions"><button type="button" className="btn" onClick={() => void collect()}>Скопировать отчёт</button></div>
      {note && <p className="small" role="status">{note}</p>}
      {text && <textarea className="diag" readOnly rows={8} value={text} aria-label="Отчёт" />}
    </section>
  );
}
