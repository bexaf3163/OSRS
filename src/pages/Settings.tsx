// The "Settings" screen: appearance, the RuneLite link, helpers, progress export and import.
import { useEffect, useId, useRef, useState } from 'react';
import { known } from '../data';
import { useStore } from '../store';
import { exportFileName, exportProgress, importProgress, type ImportResult } from '../lib/progress';
import { applyTheme, loadTheme, type Theme } from '../lib/theme';
import { applyLook, applySolid, loadLook, loadSolid, type Look } from '../lib/look';
import { desktop, type RuneliteCheck, type ZoomState } from '../lib/desktop';
import { applyTextScale, loadTextScale, percent, stepScale, TEXT_EVENT, TEXT_STEPS, ZOOM_STEPS } from '../lib/ui-scale';
import { useBridge } from '../bridge';
import { setFeatures, useFeatures, type Features } from '../lib/features';
import { DensityPills } from '../components/DensityToggle';
import { BRIDGE_ORIGIN } from '../services/runeliteBridge';
import { PluginUpdateNote } from '../components/PluginUpdateNote';
import { plural } from '../lib/shopping';
import { AccountSync } from '../components/AccountSync';
import { BackupSection, DiagnosticsSection, UpdatesSection, ProfilesSection, SessionSection } from './SettingsExtra';

type SettingsTab = 'look' | 'game' | 'progress' | 'app';
const SETTINGS_TABS: [SettingsTab, string][] = [['look', 'Look'], ['game', 'RuneLite'], ['progress', 'Progress and copies'], ['app', 'App']];
const TAB_KEY = 'osrs-put-settings-tab';
function loadTab(): SettingsTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return SETTINGS_TABS.some(([k]) => k === v) ? (v as SettingsTab) : 'look';
  } catch {
    return 'look';
  }
}

const THEMES: [Theme, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];

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
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <div className="mode-toggle settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`mode-btn ${tab === k ? 'is-active' : ''}`} onClick={() => chooseTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'look' && (
        <>
          <Appearance />
          <PlayStyleSection />
        </>
      )}
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
          <p className="small">Now: {done} {plural(done, 'step done', 'steps done')}, changed {new Date(progress.updatedAt).toLocaleString('en-US')}.</p>
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
                {pending.stats.notes} notes; saved {new Date(pending.progress.updatedAt).toLocaleString('en-US')}.
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
          <DiagnosticsSection />
        </>
      )}

      <p className="muted small">
        OSRS Path {__APP_VERSION__}
        {bridge?.isPortable() ? ' · portable version' : ''}
        {' · '}<a href="https://github.com/bexaf3163/OSRS/releases/latest" target="_blank" rel="noopener noreferrer">New versions</a>
      </p>
    </div>
  );
}

function Stepper({ id, label, value, steps, onChange }: { id: string; label: string; value: number; steps: number[]; onChange: (v: number) => void }) {
  return (
    <div className="scale-setting" role="group" aria-labelledby={id}>
      <span className="setting-label" id={id}>{label}</span>
      <span className="scale-row">
        <span className="stepper">
          <button type="button" className="stepper-btn" onClick={() => onChange(stepScale(steps, value, -1))}
            disabled={value <= steps[0]} aria-label={`${label}: less`}>−</button>
          <output className="stepper-value" aria-live="polite">{percent(value)}</output>
          <button type="button" className="stepper-btn" onClick={() => onChange(stepScale(steps, value, 1))}
            disabled={value >= steps[steps.length - 1]} aria-label={`${label}: more`}>+</button>
        </span>
        {value !== 1 && <button type="button" className="btn btn-ghost" onClick={() => onChange(1)}>Reset to 100%</button>}
      </span>
    </div>
  );
}

function Appearance() {
  const bridge = desktop();
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [look, setLook] = useState<Look>(loadLook);
  const [solid, setSolid] = useState(loadSolid);
  const [text, setText] = useState(loadTextScale);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const ids = { theme: useId(), look: useId(), text: useId(), zoom: useId() };

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    bridge.getZoom().then((z) => alive && setZoom(z));
    const off = bridge.onZoom(setZoom);
    return () => { alive = false; off(); };
  }, [bridge]);

  // The font size could have been changed with the keys — we keep the switch in agreement.
  useEffect(() => {
    const on = () => setText(loadTextScale());
    window.addEventListener(TEXT_EVENT, on);
    return () => window.removeEventListener(TEXT_EVENT, on);
  }, []);

  const pickTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };
  const pickLook = (l: Look) => {
    setLook(l);
    applyLook(l);
  };
  const pickText = (v: number) => {
    setText(v);
    applyTextScale(v);
  };
  const pickZoom = (next: { zoom?: number; autoZoom?: boolean }) => {
    if (!bridge || !zoom) return;
    const z = { zoom: next.zoom ?? zoom.zoom, autoZoom: next.autoZoom ?? zoom.autoZoom };
    setZoom({ ...zoom, ...z });
    bridge.setZoom(z);
  };

  return (
    <section className="card section-card">
      <h2 className="card-title">Appearance</h2>

      <div className="setting">
        <span className="setting-label" id={ids.theme}>Theme</span>
        <div className="segmented" role="group" aria-labelledby={ids.theme}>
          {THEMES.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={theme === t} className={`seg ${theme === t ? 'is-active' : ''}`} onClick={() => pickTheme(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting">
        <span className="setting-label" id={ids.look}>Look</span>
        <div className="segmented" role="group" aria-labelledby={ids.look}>
          {([['glass', 'Glass'], ['classic', 'Classic']] as const).map(([l, label]) => (
            <button key={l} type="button" aria-pressed={look === l} className={`seg ${look === l ? 'is-active' : ''}`} onClick={() => pickLook(l)}>
              {label}
            </button>
          ))}
        </div>
        {look === 'glass' && (
          <label className="switch">
            <input type="checkbox" checked={solid} onChange={(e) => { setSolid(e.target.checked); applySolid(e.target.checked); }} />
            <span>Solid panels (no blur) — for weak graphics</span>
          </label>
        )}
      </div>

      {bridge && zoom && (
        <div className="setting">
          <Stepper id={ids.zoom} label="Interface scale" value={zoom.zoom} steps={ZOOM_STEPS} onChange={(v) => pickZoom({ zoom: v })} />
          <label className="switch">
            <input type="checkbox" checked={zoom.autoZoom} onChange={(e) => pickZoom({ autoZoom: e.target.checked })} />
            <span>Adapt to the window size</span>
          </label>
          <p className="muted small">
            Now {percent(zoom.effective)}{zoom.autoZoom && Math.abs(zoom.effective - zoom.zoom) > 0.005 ? ' taking the window width into account' : ''}.
            Keys: <kbd>Ctrl</kbd> + <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd> + <kbd>0</kbd> — reset, or <kbd>Ctrl</kbd> + the mouse wheel.
          </p>
        </div>
      )}

      <div className="setting">
        <Stepper id={ids.text} label="Font size" value={text} steps={TEXT_STEPS} onChange={pickText} />
        <p className="muted small">It changes only the text — the spacing and layout stay the same.</p>
      </div>

      {bridge && zoom && (
        <div className="setting">
          <label className="switch">
            <input type="checkbox" checked={zoom.alwaysOnTop}
              onChange={(e) => { setZoom({ ...zoom, alwaysOnTop: e.target.checked }); bridge.setAlwaysOnTop(e.target.checked); }} />
            <span>On top of all windows — handy to keep next to the game</span>
          </label>
        </div>
      )}
    </section>
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
        <DensityPills />
        <p className="muted small">
          <strong>Zen</strong> — the screen has the step, one status line, the "Done" button and critical warnings; the rest — under "More".
          {' '}<strong>Inspector</strong> — all the step blocks are expanded: formulas, XP calculators, branches, item dossiers, economy.
          In the game the list and the HUD are always visible; the plugin setting "Smart reveal" (off by default) hides the extra on the way.
        </p>
      </div>
      <div className="setting">
        <div className="mode-toggle style-toggle" role="group" aria-label="Play style">
          {([['chill', '🌿', 'Calm'], ['efficient', '⚡', 'Efficient']] as const).map(([k, icon, label]) => {
            const on = (k === 'efficient') === features.efficient;
            return (
              <button key={k} type="button" className={`mode-btn ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => setFeatures({ efficient: k === 'efficient' })}>
                <span aria-hidden="true">{icon}</span> <span className="style-label">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">
          <strong>Calm</strong> — less on the screen, nothing is pushed; training methods — without risk and without extra clicks; messages only about the main thing.
          {' '}<strong>Efficient</strong> — more hints and comparisons; methods — the fastest of the available, with a time estimate; "one trip" sees further. The step requirements and safety do not depend on the style.
        </p>
      </div>
      <div className="setting">
        <label className="switch">
          <input type="checkbox" checked={features.autoPrep} onChange={(e) => setFeatures({ autoPrep: e.target.checked })} />
          <span>🧭 Auto preparation for a step</span>
        </label>
        <p className="muted small">
          The app itself lines up what to take or do before a step and leads the arrow in the game: to the bank for an item, to the exchange for a purchase, to a training place.
          When a task is done, it leads to the next one, and at the end returns to the step. It does not take over the arrow if a target is already set in the game, and goes quiet if you clear it yourself.
          It buys and does nothing for you.
        </p>
      </div>
    </section>
  );
}

function Helpers() {
  const features = useFeatures();
  return (
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
        The OSRS Path Bridge plugin for RuneLite shows the current step right in the game: an arrow to the place, a highlight of NPCs, objects,
        tiles, the needed dialogue option and inventory items — and it marks the step itself when the quest is counted.
        The link stays inside the computer: <code className="code">{BRIDGE_ORIGIN}</code>.
      </p>
      <div className="setting">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>RuneLite link</span>
        </label>
        <p className="muted small">Now: {status}.{activeStepId && (state === 'online'
          ? <> The game shows the step <code className="code">{activeStepId}</code>.</>
          : <> The step <code className="code">{activeStepId}</code> will return to the game when RuneLite connects.</>)}</p>
        {activeStepId && <div className="actions"><button type="button" className="btn" onClick={() => void clear()}>Remove the hints from the game</button></div>}
        {plugin && (plugin.compat === 'ok'
          ? <p className="muted small">✓ The plugin {plugin.version ?? ''} is compatible with the app {__APP_VERSION__} (protocol {plugin.protocol}).</p>
          : <PluginUpdateNote />)}
      </div>

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
    </section>
  );
}
