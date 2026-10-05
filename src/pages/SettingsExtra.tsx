// The 2.12 settings: character profiles, a scheduled progress copy, the session summary and "Diagnostics".

import { useEffect, useState } from 'react';
import { levelById } from '../data';
import { useBridge } from '../bridge';
import { desktop, type BackupState } from '../lib/desktop';
import { addProfile, MAIN_ID, readProfiles, removeProfile, renameProfile, switchProfile, useProfiles, writeProfiles } from '../lib/profiles';
import { sessionSummary } from '../lib/session';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { formatGp } from '../lib/shopping';
import { percent, useUpdates } from '../lib/useUpdates';

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
      <h2 className="card-title">Character profiles</h2>
      <p className="muted small">
        Each character has its own progress. The app recognises the character by the name from the game and offers to switch; the levels and marks
        from the game are written only into that character's profile. The first character seen is bound to a profile by itself.
      </p>
      <ul className="profile-list">
        {profiles.list.map((p) => {
          const active = p.id === profiles.active;
          return (
            <li key={p.id} className={`profile ${active ? 'is-active' : ''}`}>
              {renaming?.id === p.id
                ? (
                  <form onSubmit={(e) => { e.preventDefault(); writeProfiles(renameProfile(readProfiles(), p.id, renaming.name)); setRenaming(null); }}>
                    <input aria-label="Profile name" value={renaming.name} maxLength={30} autoFocus onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} />
                    <button type="submit" className="btn btn-sm">Save</button>
                  </form>
                )
                : <span><strong>{p.name}</strong>{active && ' · open'}<span className="muted small"> · {p.player ? `character ${p.player}` : 'no character bound yet'}</span></span>}
              <span className="profile-actions">
                {!active && <button type="button" className="btn btn-sm" onClick={() => switchProfile(p.id)}>Open</button>}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</button>
                {p.id !== MAIN_ID && (confirm === p.id
                  ? <button type="button" className="btn btn-sm btn-danger" onClick={() => { writeProfiles(removeProfile(readProfiles(), p.id)); setConfirm(null); if (active) switchProfile(MAIN_ID); }}>Delete for sure (the progress stays in the file)</button>
                  : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(p.id)}>Delete</button>)}
              </span>
            </li>
          );
        })}
      </ul>
      <form className="actions" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input aria-label="New profile name" placeholder="New profile name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn" disabled={profiles.list.length >= 8}>Create</button>
      </form>
      {player && <p className="muted small">In the game now: {player}{gate.kind === 'ok' ? ' ✓ the profile matches' : ''}.</p>}
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
      <h2 className="card-title">Progress copies</h2>
      <p className="muted small">
        Every hour the progress is copied outside the app folder, so deleting the program and its data folder does not lose it: a fresh install
        takes the newest copy back by itself. You can also copy into a folder of your own, for example into OneDrive. One file per profile and day,
        the last 14 are kept, plus the latest state. To restore by hand — "Transferring progress" → "Import progress".
      </p>
      <p className="small">
        {state?.autoDir ? <>Automatic folder: <code className="code">{state.autoDir}</code></> : 'The automatic copy is off.'}
        {state?.dir && <><br />Your folder: <code className="code">{state.dir}</code></>}
        {state?.last && <><br />Last copy: {new Date(state.last).toLocaleString('en-US')}.</>}
      </p>
      {state?.error && <p className="notice is-error small" role="alert">Could not write to the folder ({state.error}). Choose another.</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={() => run(api.choose)}>{state?.dir ? 'Change my folder' : 'Also copy to my folder'}</button>
        {(state?.dir || state?.autoDir) && <button type="button" className="btn" onClick={() => run(api.now)}>Make a copy now</button>}
        {state?.dir && <button type="button" className="btn btn-ghost" onClick={() => run(api.clear)}>Stop copying to my folder</button>}
        {state && <button type="button" className="btn btn-ghost" onClick={() => run(() => api.setAuto(!state.autoDir))}>{state.autoDir ? 'Turn off the automatic copy' : 'Turn on the automatic copy'}</button>}
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
      <h2 className="card-title">This session</h2>
      <p className="small">
        Running {s.minutes} min · steps closed: <strong>{s.stepsDone}</strong>
      </p>
      {state === 'online' && !session.xp0 && <p className="muted small">XP and levels will start being counted when the plugin (2.12+) sends them from the game.</p>}
      {s.xpGained.length > 0 && (
        <ul className="small">
          {s.xpGained.slice(0, 8).map((g) => (
            <li key={g.skill}>{levelById.get(g.skill)?.name ?? g.skill}: +{g.xp.toLocaleString('en-US')} XP{g.levels > 0 ? ` · +${g.levels} lvl` : ''}</li>
          ))}
        </ul>
      )}
      <LedgerBlock />
    </section>
  );
}

/** The resource journal: kept between sessions (30 days) separately for each character; here it can be cleared. */
function LedgerBlock() {
  const { summary, session, since, clearLedger } = usePlayerState();
  const [confirm, setConfirm] = useState(false);
  if (!summary.entries) {
    return <p className="muted small">The resource journal is empty: it fills while RuneLite is connected and is kept between sessions.</p>;
  }
  return (
    <div className="ledger-block">
      <p className="small">
        <strong>Resource journal</strong> — entries {summary.entries}{since !== null ? `, since ${new Date(since).toLocaleDateString('en-US')}` : ''}. Coins +{formatGp(summary.coinsEarned)}, spent {formatGp(summary.coinsSpent)}
        {summary.estimatedLootValue > 0 ? `, loot ≈${formatGp(summary.estimatedLootValue)} gp (an estimate, not money)` : ''}.
        {session.entries > 0 && summary.entries > session.entries ? ` This session — ${session.entries}.` : ''}
      </p>
      {confirm ? (
        <div className="actions">
          <button type="button" className="btn btn-danger" onClick={() => { clearLedger(); setConfirm(false); }}>Yes, clear the journal</button>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setConfirm(true)}>Clear the journal</button>
      )}
    </div>
  );
}

export function UpdatesSection() {
  const u = useUpdates();
  if (!u) return null;
  const { state: s } = u;
  const text = s.state === 'checking' ? 'Checking…'
    : s.state === 'current' ? 'The latest version is installed.'
      : s.state === 'available' ? `Version ${s.latest} is out.`
        : s.state === 'downloading' ? `Downloading version ${s.latest}… ${percent(s.progress)}%`
          : s.state === 'ready' ? `Version ${s.latest} is downloaded — only a restart is left.`
            : s.state === 'error' ? `Failed: ${s.error ?? 'no connection'}. Try later.` : '';
  return (
    <section className="card section-card">
      <h2 className="card-title">Updates</h2>
      <p className="muted">
        The app checks the GitHub releases, downloads the new portable version next to the old one and restarts into it.
        The progress and settings are next to the app — nothing needs to be moved; the previous exe is deleted after the switch.
        Nothing is installed without your button.
      </p>
      <p className="small">Now: <strong>{s.current}</strong>{text ? ` · ${text}` : ''}</p>
      <label className="switch">
        <input type="checkbox" checked={s.auto !== false} onChange={(e) => u.setAuto(e.target.checked)} />
        <span>Check at launch and every few hours</span>
      </label>
      <div className="actions">
        <button type="button" className="btn" onClick={u.check} disabled={s.state === 'checking' || s.state === 'downloading'}>Check now</button>
        {s.canInstall && s.state === 'available' && <button type="button" className="btn btn-primary" onClick={u.download}>Download</button>}
        {s.state === 'ready' && <button type="button" className="btn btn-primary" onClick={u.install}>Restart into the new version</button>}
      </div>
      {!s.canInstall && <p className="muted small">This build was not started from the portable exe — it only reports a new version.</p>}
    </section>
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
      setNote(`Copied to the clipboard (${report.split('\n').length} lines) — paste it into the chat.`);
    } catch {
      setNote('The clipboard is unavailable — select the text below and copy it yourself.');
    }
  };
  return (
    <section className="card section-card">
      <h2 className="card-title">Diagnostics</h2>
      <p className="muted small">
        If something is not working, press "Copy the report": the app collects the versions, the RuneLite link state, the last bridge events and a summary of the plugin journal (how much is written, what oddities the watchdog found).
        There are no bag, bank or notes in the report.
      </p>
      <div className="actions"><button type="button" className="btn" onClick={() => void collect()}>Copy the report</button></div>
      {note && <p className="small" role="status">{note}</p>}
      {text && <textarea className="diag" readOnly rows={8} value={text} aria-label="Report" />}
    </section>
  );
}
