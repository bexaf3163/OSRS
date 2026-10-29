// The frame around the book: title strip, HUD, spine (navigation) and hotbar.
import { useEffect, type ReactNode } from 'react';
import { Icon } from './icons';
import { LEDGER_NAV, type HotbarAction, type HotbarHandlers, type Player } from './model';

interface TitleBarProps {
  pinned: boolean;
  onTogglePin?: () => void;
}

/** The window keeps its native frame, so the strip has no window buttons of its own. */
export function TitleBar({ pinned, onTogglePin }: TitleBarProps) {
  return (
    <div className="la-tb">
      <b>OSRS PATH</b> THE ADVENTURER&apos;S LEDGER
      <span className="la-sp" />
      {onTogglePin && (
        <button type="button" className={`la-pin ${pinned ? 'la-on' : ''}`} title="Always on top" aria-label="Always on top" aria-pressed={pinned} onClick={onTogglePin}>
          <Icon name="pin" size={14} />
        </button>
      )}
    </div>
  );
}

interface HudProps {
  player: Player;
  members: boolean;
  onMembers: (members: boolean) => void;
  /** The RuneLite link: the app's own indicator and launch button. */
  status: ReactNode;
  compact: boolean;
  onToggleCompact: () => void;
  onOpenSearch: () => void;
  settingsActive: boolean;
}

export function Hud({ player, members, onMembers, status, compact, onToggleCompact, onOpenSearch, settingsActive }: HudProps) {
  const R = 2 * Math.PI * 21;
  const offset = R * (1 - player.progress / 100);
  return (
    <header className="la-hud">
      <div className="la-crest">
        <div className="la-sigil" title={player.combat === null ? 'Combat level not known yet' : `Combat level ${player.combat}`}>
          <svg viewBox="0 0 46 46" aria-hidden="true">
            <path d="M23 2l18 7v14c0 11-8 18-18 21C13 41 5 34 5 23V9z" fill="#1a110a" stroke="#c9a24b" strokeWidth="1.5" />
            <path d="M23 6l14 5.5V23c0 8.5-6 14-14 17-8-3-14-8.500-14-17V11.500z" fill="none" stroke="#7b6030" />
          </svg>
          <span>{player.combat ?? '?'}</span>
        </div>
        <div className="la-who">
          <b>{player.name}</b>
          <i>{player.combat === null ? 'Levels not known yet' : `Combat ${player.combat} · Total level ${player.total}`}</i>
        </div>
      </div>
      <span className="la-sp" />
      <div className="la-world" role="group" aria-label="Game mode">
        <button type="button" className={members ? '' : 'la-on'} aria-pressed={!members} title="Free version: stages 1–6" onClick={() => onMembers(false)}>
          FREE
        </button>
        <button type="button" className={members ? 'la-on' : ''} aria-pressed={members} title="Membership: stages 1–9 and members skills" onClick={() => onMembers(true)}>
          MEMBERS
        </button>
      </div>
      <a className="la-stat" href="#/" title={`Done ${player.progress}%, quest points ${player.qp} of ${player.maxQp}`} aria-label={`Done ${player.progress}%, quest points ${player.qp} of ${player.maxQp}`}>
        <div className="la-ring" aria-hidden="true">
          <svg width="48" height="48">
            <circle cx="24" cy="24" r="21" fill="none" stroke="#3a2a18" strokeWidth="4" />
            <circle cx="24" cy="24" r="21" fill="none" stroke="#c9a24b" strokeWidth="4" strokeDasharray={R} strokeDashoffset={offset} strokeLinecap="round" />
          </svg>
          <span>{player.progress}%</span>
        </div>
        <div aria-hidden="true">
          <small>QUEST POINTS</small>
          <b>{player.qp}</b>
        </div>
      </a>
      <div className="la-gem">{status}</div>
      <div className="la-tools">
        <button type="button" className="la-tool" aria-label="Search" aria-keyshortcuts="/" onClick={onOpenSearch}>
          <Icon name="search" size={15} />
          <kbd>/</kbd>
        </button>
        <button type="button" className={`la-tool ${compact ? 'la-on' : ''}`} title={compact ? 'Back to the full workspace' : 'Compact view: keep the current action next to the game'} onClick={onToggleCompact}>
          <Icon name="compact" size={15} />
          {compact ? 'FULL WORKSPACE' : 'COMPACT'}
        </button>
        <a className={`la-tool ${settingsActive ? 'la-on' : ''}`} href="#/settings" title="Settings" aria-label="Settings" aria-current={settingsActive ? 'page' : undefined}>
          <Icon name="sliders" size={15} />
        </a>
      </div>
    </header>
  );
}

export function Spine({ section }: { section: string }) {
  return (
    <nav className="la-spine" aria-label="Sections">
      {LEDGER_NAV.map(({ section: id, href, label, icon }) => (
        <a key={id} href={href} className={`la-rb ${section === id ? 'la-on' : ''}`} aria-current={section === id ? 'page' : undefined}>
          <Icon name={icon} size={24} strokeWidth={1.5} />
          <span>{label.toUpperCase()}</span>
        </a>
      ))}
    </nav>
  );
}

const KEYS: Record<string, HotbarAction> = { q: 'prev', f: 'fix', s: 'start', g: 'game', m: 'map', u: 'remove', e: 'next' };

type IconOf = Parameters<typeof Icon>[0]['name'];

/** `titles` explain what each slot does for this step; `labels` and `icons` rename a slot whose action changes (Fix becomes Preparation). */
export function Hotbar({ handlers, titles = {}, labels = {}, icons = {} }: { handlers: HotbarHandlers; titles?: Partial<Record<HotbarAction, string>>; labels?: Partial<Record<HotbarAction, string>>; icons?: Partial<Record<HotbarAction, IconOf>> }) {
  // The keys printed on the slots; never while typing, with a modifier or while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      const run = handlers[KEYS[e.key.toLowerCase()]];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);

  const slot = (action: HotbarAction, key: string | null, icon: IconOf, label: string, extra = '') => (
    <button type="button" className={`la-slot ${extra}`} disabled={!handlers[action]} title={titles[action]} aria-keyshortcuts={key ?? undefined} onClick={handlers[action]}>
      {key && <kbd>{key}</kbd>}
      <Icon name={icons[action] ?? icon} size={18} />
      <span className="la-slot-label">{labels[action] ?? label}</span>
    </button>
  );
  return (
    <div className="la-hotbar" role="toolbar" aria-label="Step actions">
      {slot('prev', 'Q', 'chevL', 'PREVIOUS')}
      {slot('fix', 'F', 'wrench', 'FIX')}
      {slot('start', 'S', 'bolt', 'START THE STEP', 'la-go')}
      {slot('game', 'G', 'target', 'SHOW IN GAME')}
      <button type="button" className="la-done-seal" disabled={!handlers.done} title={titles.done} onClick={handlers.done}>
        <Icon name="check" size={26} strokeWidth={2.4} />
        DONE
      </button>
      {slot('map', 'M', 'map', 'WORLD MAP')}
      {slot('skip', null, 'skip', 'SKIP STEP')}
      {slot('remove', 'U', 'clock', 'REMOVE MARK')}
      {slot('next', 'E', 'chevR', 'NEXT')}
    </div>
  );
}
