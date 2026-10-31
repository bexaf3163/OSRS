// The frame: the Ledger (title strip, HUD, spine and the open book), the page switch (hash routing),
// the global observers of preparation and the RuneLite link.
import { useEffect, useState } from 'react';
import { findSkill, reference } from './data';
import { useStore } from './store';
import { useRoute, type Page } from './lib/router';
import { desktop } from './lib/desktop';
import { SearchBox } from './components/SearchBox';
import { BridgeIndicator } from './components/BridgeIndicator';
import { LaunchRuneLiteButton } from './components/LaunchRuneLiteButton';
import { ToastView } from './components/ToastView';
import { PrepAuto, PrepWatcher } from './components/PrepRoute';
import { PageBoundary } from './components/PageBoundary';
import { GearHintSync } from './components/GearHintSync';
import { CleanupSync } from './components/CleanupSync';
import { FundingSync } from './components/FundingSync';
import { PrepSync } from './components/PrepSync';
import { SkillSync } from './components/TrackedSkillCard';
import { PathPage } from './pages/Path';
import { SkillsPage } from './pages/Skills';
import { JournalPage } from './pages/Journal';
import { ReferencePage } from './pages/Reference';
import { SettingsPage } from './pages/Settings';
import { ShoppingPage } from './pages/Shopping';
import { GearPage } from './pages/Gear';
import { MoneyPage } from './pages/Money';
import { ProfileBanner } from './components/ProfileBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { Book, Hud, LedgerStage, Spine, TitleBar, LEDGER_NAV } from './ledger';
import { usePlayerSummary } from './ledger/adapters';

/** The section a route belongs to: the old #/quests and #/goals hashes live inside the Journal. */
function sectionOf(page: Page): string {
  return page === 'quests' ? 'journal' : page;
}

function pageTitle(page: Page, param?: string): string {
  if (page === 'skills' && param) return findSkill(param)?.name ?? 'Skills';
  if (page === 'reference' && param) return reference.sections.find((s) => s.id === param)?.title ?? 'Reference';
  if (page === 'reference') return 'Reference';
  if (page === 'settings') return 'Settings';
  if (page === 'shopping') return 'Shopping';
  if (page === 'gear') return 'Gear';
  if (page === 'money') return 'Money';
  if (page === 'path') return 'Path';
  return LEDGER_NAV.find((t) => t.section === sectionOf(page))?.label ?? 'OSRS Path';
}

export function App() {
  const route = useRoute();
  const { mode, setMode, persistenceWarning } = useStore();
  const player = usePlayerSummary();
  const [searchOpen, setSearchOpen] = useState(false);
  const desk = desktop();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    void desk?.getWindowPrefs().then((z) => setPinned(z.alwaysOnTop));
  }, [desk]);

  // "/" opens the search if the focus is not in an input field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    document.title = `${pageTitle(route.page, route.param)} — OSRS Path`;
  }, [route]);

  const section = sectionOf(route.page);
  const togglePin = () => {
    if (!desk) return;
    desk.setAlwaysOnTop(!pinned);
    setPinned(!pinned);
  };

  let content;
  switch (route.page) {
    case 'path': content = <PathPage focusStep={route.step} focusKey={route.key} />; break;
    case 'skills': content = <SkillsPage param={route.param} selectedSkill={route.skill} goal={route.goal} />; break;
    case 'quests':
    case 'journal': content = <JournalPage session={route.param === 'session'} />; break;
    case 'reference': content = <ReferencePage key={route.param ?? ''} section={route.param} />; break;
    case 'settings': content = <SettingsPage />; break;
    case 'shopping': content = <ShoppingPage />; break;
    case 'gear': content = <GearPage />; break;
    case 'money': content = <MoneyPage />; break;
  }

  return (
    <LedgerStage>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <TitleBar pinned={pinned} onTogglePin={desk ? togglePin : undefined} />
      <Hud
        player={player}
        members={mode === 'members'}
        onMembers={(m) => setMode(m ? 'members' : 'f2p')}
        status={<><BridgeIndicator /><LaunchRuneLiteButton /></>}
        onOpenSearch={() => setSearchOpen(true)}
        settingsActive={route.page === 'settings'}
      />
      <div className="la-body">
        <Spine section={section} />
        <main id="main" tabIndex={-1} className="la-main">
          <UpdateBanner />
          <ProfileBanner />
          {persistenceWarning && <div className="plaque plaque-warning progress-storage-warning" role="alert">{persistenceWarning} <a href="#/settings">Settings</a></div>}
          <Book>
            <PageBoundary resetKey={`${route.page}/${route.param ?? ''}`}>{content}</PageBoundary>
          </Book>
          <div id="la-hotbar-slot" />
        </main>
      </div>

      <PrepWatcher />
      <PrepAuto />
      <ToastView />
      <GearHintSync />
      <CleanupSync />
      <FundingSync />
      <PrepSync />
      <SkillSync />
      <SearchBox open={searchOpen} onClose={() => setSearchOpen(false)} />
    </LedgerStage>
  );
}
