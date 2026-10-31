// The "Settings" screen: appearance, the RuneLite link, helpers, progress export and import.
import { useEffect, useRef, useState } from 'react';
import { known } from '../data';
import { useStore } from '../store';
import { exportFileName, exportProgress, importProgress, type ImportResult } from '../lib/progress';
import { desktop, type RuneliteCheck } from '../lib/desktop';
import { useBridge } from '../bridge';
import { setFeatures, useFeatures, type Features } from '../lib/features';
import { priorityOf } from '../lib/playStyle';
import { BRIDGE_ORIGIN } from '../services/runeliteBridge';
import { PluginUpdateNote } from '../components/PluginUpdateNote';
import { plural } from '../lib/shopping';
import { AccountSync } from '../components/AccountSync';
import { BackupSection, UpdatesSection, ProfilesSection, SessionSection } from './SettingsExtra';
import { Eyebrow, Page } from '../ledger';

type SettingsTab = 'training' | 'game' | 'progress' | 'app';
const SETTINGS_TABS: [SettingsTab, string][] = [['game', 'RuneLite'], ['training', 'Training'], ['progress', 'Progress and copies'], ['app', 'App']];
const TAB_KEY = 'osrs-put-settings-tab';
function loadTab(): SettingsTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return SETTINGS_TABS.some(([k]) => k === v) ? (v as SettingsTab) : 'game';
  } catch {
    return 'game';
  }
}


function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const { progress, replace, reset } = useStore();
  const [pending, setPending] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bridge = desktop();
  const [tab, setTab] = useState<SettingsTab>(loadTab);
  const chooseTab = (k: SettingsTab) => {
    setTab(k);
    try { localStorage.setItem(TAB_KEY, k); } catch { /* it is remembered until restart */ }
  };

  const done = Object.values(progress.steps).filter((s) => s === 'done').length;

  const onFile = async (f: File | undefined) => {
    setImportError('');
    setPending(null);
    if (!f) return;
    const result = importProgress(await f.text(), known);
    if (result.ok) setPending(result);
    else setImportError(result.error);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
    <Page side="l" basis={340} className="settings-index" label="Settings sections">
    <div className="page la-scroll">
      <Eyebrow>THE SATCHEL</Eyebrow>
      <header className="page-head">
        <h1>Settings</h1>
      </header>
      <div className="mode-toggle settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
        {SETTINGS_TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`mode-btn ${tab === k ? 'is-active' : ''}`} onClick={() => chooseTab(k)}>{label}</button>
        ))}
      </div>
      <p className="muted small">
        OSRS Path {__APP_VERSION__}
        {bridge?.isPortable() ? ' · portable version' : ''}
        {' · '}<a href="https://github.com/bexaf3163/OSRS/releases/latest" target="_blank" rel="noopener noreferrer">New versions</a>
      </p>
    </div>
    </Page>
    <Page side="r" className="settings" label={SETTINGS_TABS.find(([k]) => k === tab)?.[1]}>
      <div className="settings-content la-scroll">
      {tab === 'training' && <PlayStyleSection />}
      {tab === 'game' && (
        <>
          <RuneLiteBridge />
          <Helpers />
        </>
      )}
      {tab === 'progress' && (
        <>
          <ProfilesSection />
          <AccountSync />
          <SessionSection />
          <BackupSection />
        <section className="card section-card">
          <h2 className="card-title">Transferring progress</h2>
          <p className="muted">
            The progress is stored in this app and as a copy — the file <code className="code">progress.json</code> in the data folder.
            To move it to another computer, save the file here and load it there.
          </p>
          {bridge && (
            <p className="muted small">
              {bridge.isPortable() ? 'The portable version: the data is next to the app, in the folder ' : 'The progress copy is in the folder '}
              <code className="code code-path">{bridge.dataDir()}</code>
            </p>
          )}
          <p className="small">Now: {done} {plural(done, 'step done', 'steps done')}.</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => download(exportFileName(), exportProgress(progress))}>
              Export progress
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import progress</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>

          {importError && <p className="notice is-error" role="alert">{importError}</p>}
          {pending && (
            <div className="notice" role="alert">
              <p>
                In the file: {pending.stats.done} done, {pending.stats.skipped} skipped, {pending.stats.levels} levels,
                {pending.stats.notes} notes.
                {pending.stats.migrated && ' A file from the first version of the route — the marks were carried over to V2, the old ones are kept inside.'}
                {pending.stats.dropped > 0 && ` Unknown entries dropped: ${pending.stats.dropped}.`}
              </p>
              <p>The current progress on this device will be replaced.</p>
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={() => { replace(pending.progress, 'Progress loaded'); setPending(null); }}>
                  Replace
                </button>
                <button type="button" className="btn" onClick={() => setPending(null)}>Cancel</button>
              </div>
            </div>
          )}
        </section>

        <section className="card section-card">
          <h2 className="card-title">Reset</h2>
          <p className="muted">It removes the marks, levels and notes on this device. Right after the reset it can be undone.</p>
          {confirmReset ? (
            <div className="actions">
              <button type="button" className="btn btn-danger" onClick={() => { reset(); setConfirmReset(false); }}>Yes, reset everything</button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          ) : (
            <div className="actions">
              <button type="button" className="btn" onClick={() => setConfirmReset(true)}>Reset progress</button>
            </div>
          )}
        </section>
        </>
      )}
      {tab === 'app' && (
        <>
          <UpdatesSection />
        </>
      )}
      </div>
    </Page>
    </>
  );
}

const HELPERS: { key: keyof Features; title: string; text: string }[] = [
  { key: 'autoLocation', title: '📍 Places on the map', text: 'The places in the wiki dossier (where it lies for free, shops, sellers, towns) open on the world map, and 🧭 leads the in-game arrow there.' },
  { key: 'bankTags', title: '🏦 Stage items in the bank', text: 'While a step of the stage is shown in the game, the OSRS Path Bridge plugin softly highlights in the main bank window everything that will be needed at this stage. A separate tab and an import string are not needed.' },
  { key: 'pacing', title: '⏱ Training pace', text: 'How many actions and minutes are left to the step goal — from the XP in the game. Without measurements the time is not invented.' },
  { key: 'levelsFromGame', title: '📈 Levels from the game', text: 'The skill levels from the game go into the level fields on the skill and step pages by themselves (manual entry stays when the game is not nearby). They are written only into the profile of the character who is in the game.' },
  { key: 'upgradeRouter', title: '⚡ Upgrades and gear', text: 'Before a long training — a better axe or pickaxe, if the level already allows. On combat steps — a better weapon, amulet and armor by the OSRS Wiki damage formulas, against the step\'s opponent; the advice is also a line in the game HUD. It buys and wears nothing by itself.' },
];

function PlayStyleSection() {
  const features = useFeatures();
  return (
    <section className="card section-card" aria-label="Play style">
      <h2 className="card-title">Play style and preparation</h2>
      <div className="setting">
        <div className="mode-toggle style-toggle" role="group" aria-label="Training choices">
          {([['balanced', 'Balanced'], ['fastest', 'Fastest'], ['profit', 'Money'], ['relaxed', 'Relaxed']] as const).map(([k, label]) => {
            const on = priorityOf(features) === k;
            return (
              <button key={k} type="button" className={`mode-btn ${on ? 'is-active' : ''}`} aria-pressed={on}
                onClick={() => setFeatures({ efficient: k === 'fastest', relaxedTraining: k === 'relaxed', profitTraining: k === 'profit' })}>
                <span className="style-label">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">
          Balanced weighs time, supplies and earnings. Choose Fastest, Money or Relaxed to change the preference; requirements and safety checks remain active.
        </p>
      </div>
      <div className="setting">
        <label className="switch">
          <input type="checkbox" checked={features.autoPrep} onChange={(e) => setFeatures({ autoPrep: e.target.checked })} />
          <span>🧭 Auto preparation for a step</span>
        </label>
        <p className="muted small">
          Guides you through banking, supplies and training, then returns to the step. Purchases and game actions stay manual.
        </p>
      </div>
      <div className="setting">
        <label className="switch">
          <input type="checkbox" checked={features.keepDefenceOne} onChange={(e) => setFeatures({ keepDefenceOne: e.target.checked })} />
          <span>⚔️ Keep Defence at 1</span>
        </label>
        <p className="muted small">
          Excludes Defence training from suggested combat preparation.
        </p>
      </div>
    </section>
  );
}

function Helpers() {
  const features = useFeatures();
  return (
    <details className="settings-advanced">
      <summary>More helpers: places, bank, training pace, upgrades</summary>
      <section className="card section-card">
        <h2 className="card-title">The helper: places, bank, pace, upgrades</h2>
        <p className="muted small">
          A turned-off feature is not only hidden but does nothing. What is drawn in the game itself (the danger radar,
          the highlight, the sound) is also configured in the OSRS Path Bridge plugin: RuneLite → plugin settings → "Places, radar, pace".
        </p>
        {HELPERS.map((h) => (
          <div className="setting" key={h.key}>
            <label className="switch">
              <input type="checkbox" checked={features[h.key]} onChange={(e) => setFeatures({ [h.key]: e.target.checked })} />
              <span>{h.title}</span>
            </label>
            <p className="muted small">{h.text}</p>
          </div>
        ))}
      </section>
    </details>
  );
}

function RuneLiteBridge() {
  const { enabled, setEnabled, state, inGame, activeStepId, clear, canLaunch, launchRuneLite, autoLaunch, setAutoLaunch, plugin } = useBridge();
  const [check, setCheck] = useState<RuneliteCheck | null>(null);
  const [launching, setLaunching] = useState(false);
  useEffect(() => {
    if (canLaunch) void desktop()?.runelite?.check().then(setCheck).catch(() => setCheck(null));
  }, [canLaunch, state]);

  const status = state === 'off' ? 'off'
    : state === 'online' ? `🟢 the plugin is connected${inGame ? ', the character is in the game' : ', the character is not in the game'}`
      : state === 'connecting' ? 'connecting…' : '⚪ the plugin does not respond';
  const launch = async () => {
    setLaunching(true);
    await launchRuneLite();
    setLaunching(false);
  };
  return (
    <section className="card section-card">
      <h2 className="card-title">RuneLite</h2>
      <p className="muted">
        The OSRS Path plugin for RuneLite shows the current step in the game: an arrow to the place, highlighted NPCs and objects, and the items to bring.
        It also ticks a step by itself when the game confirms it. Everything stays on this computer (<code className="code">{BRIDGE_ORIGIN}</code>).
      </p>
      {canLaunch ? (
        <div className="setting">
          <label className="switch">
            <input type="checkbox" checked={autoLaunch} disabled={!enabled} onChange={(e) => setAutoLaunch(e.target.checked)} />
            <span>Start RuneLite together with OSRS Path</span>
          </label>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={launch} disabled={launching || !check?.ok || state === 'online'}>
              🎮 {state === 'online' ? 'RuneLite with the bridge is running' : 'Launch RuneLite with the bridge'}
            </button>
          </div>
          {check && (
            <ul className="runelite-checks small">
              {check.ok
                ? <li className="is-ok">✓ RuneLite {check.clientVersion} found — the plugin will start with it</li>
                : check.problems.map((p) => <li key={p} className="is-bad">✗ {p}</li>)}
              {check.credentials
                ? <li className="is-ok">✓ The Jagex Account sign-in is saved</li>
                : <li className="is-warn">! The Jagex Account sign-in is not saved — see below</li>}
            </ul>
          )}
          {check && !check.credentials && (
            <details className="runelite-help">
              <summary>How to sign in with a Jagex Account (once)</summary>
              <p className="small">
                RuneLite started not from the Jagex Launcher does not know your session. It can be saved once — this is what RuneLite
                recommends to developers:
              </p>
              <ol className="small">
                <li>In the Start menu open <strong>RuneLite (configure)</strong>.</li>
                <li>In the <strong>Client arguments</strong> field enter <code className="code">--insecure-write-credentials</code> and press Save.</li>
                <li>Start RuneLite through the <strong>Jagex Launcher</strong> as usual and close it when it opens.</li>
                <li>Leave the Client arguments field empty again — from then on RuneLite with the bridge signs in by itself.</li>
              </ol>
              <p className="small muted">
                The session is stored in the file <code className="code">%USERPROFILE%\.runelite\credentials.properties</code> — it gives access
                to the account, do not send it to anyone. To revoke: "End sessions" in the Jagex Account settings, or delete the file.
                Old accounts without a Jagex Account sign in with a login and password right in the RuneLite window.
              </p>
            </details>
          )}
        </div>
      ) : (
        <p className="muted small">
          RuneLite with the plugin starts with one button (or by itself, together with the app) — this build was not started as the
          desktop app, so there is no button here.
        </p>
      )}

      <div className="setting">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>RuneLite link</span>
        </label>
        <p className="muted small">Now: {status}.{activeStepId && (state === 'online' && inGame
          ? <> The game shows the step <code className="code">{activeStepId}</code>.</>
          : <> The step <code className="code">{activeStepId}</code> will return to the game when {state === 'online' ? 'your character logs in' : 'RuneLite connects'}.</>)}</p>
        {activeStepId && <div className="actions"><button type="button" className="btn" onClick={() => void clear()}>Remove the hints from the game</button></div>}
        {plugin && (plugin.compat === 'ok'
          ? <p className="muted small">✓ The plugin {plugin.version ?? ''} is compatible with the app {__APP_VERSION__} (protocol {plugin.protocol}).</p>
          : <PluginUpdateNote />)}
      </div>

    </section>
  );
}
