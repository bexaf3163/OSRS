// The frame: the header, the page switch (hash routing), the global observers of preparation and of the RuneLite link.
import { useEffect, useState, type ComponentType } from 'react';
import { findSkill, reference } from './data';
import { useStore } from './store';
import { useRoute, type Page } from './lib/router';
import { IconCart, IconCompact, IconGear, IconJournal, IconPath, IconSearch, IconSettings, IconSkills } from './components/Icons';
import { SearchBox } from './components/SearchBox';
import { HeaderMode } from './components/ModeToggle';
import { CompassMark } from './components/CompassMark';
import { HeaderProgress } from './components/HeaderProgress';
import { BridgeIndicator } from './components/BridgeIndicator';
import { ToastView } from './components/ToastView';
import { PrepAuto, PrepWatcher } from './components/PrepRoute';
import { PageBoundary } from './components/PageBoundary';
import { GearHintSync } from './components/GearHintSync';
import { CleanupSync } from './components/CleanupSync';
import { PrepSync } from './components/PrepSync';
import { SkillSync } from './components/TrackedSkillCard';
import { PathPage } from './pages/Path';
import { PathCompact } from './pages/PathCompact';
import { setFeatures, useFeatures } from './lib/features';
import { SkillsPage } from './pages/Skills';
import { SkillDetailPage } from './pages/SkillDetail';
import { JournalPage, journalTabOf } from './pages/Journal';
import { ReferencePage } from './pages/Reference';
import { SettingsPage } from './pages/Settings';
import { ShoppingPage } from './pages/Shopping';
import { GearPage } from './pages/Gear';
import { ProfileBanner } from './components/ProfileBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { SectionShell } from './components/SectionShell';

const TABS: { page: Page; href: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { page: 'path', href: '#/', label: 'Path', Icon: IconPath },
  { page: 'skills', href: '#/skills', label: 'Skills', Icon: IconSkills },
  { page: 'gear', href: '#/gear', label: 'Gear', Icon: IconGear },
  { page: 'shopping', href: '#/shopping', label: 'Shopping', Icon: IconCart },
  { page: 'journal', href: '#/journal', label: 'Journal', Icon: IconJournal },
];

/** The section a route belongs to: the old #/quests and #/goals hashes live inside the Journal. */
function sectionOf(page: Page): Page {
  return page === 'quests' || page === 'goals' ? 'journal' : page;
}

function pageTitle(page: Page, param?: string): string {
  if (page === 'skills' && param) return findSkill(param)?.name ?? 'Skills';
  if (page === 'reference' && param) return reference.sections.find((s) => s.id === param)?.title ?? 'Reference';
  if (page === 'reference') return 'Reference';
  if (page === 'settings') return 'Settings';
  if (page === 'shopping') return 'Shopping';
  if (page === 'gear') return 'Gear';
  return TABS.find((t) => t.page === sectionOf(page))!.label;
}

export function App() {
  const route = useRoute();
  const { mode } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);

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
    if (!route.step) window.scrollTo(0, 0);
  }, [route]);

  const section = sectionOf(route.page);
  // The compact view is a presentation of Path only; every other page opens as usual.
  const compact = useFeatures().compact && route.page === 'path';
  let content;
  switch (route.page) {
    case 'path': content = compact ? <PathCompact focusStep={route.step} /> : <PathPage focusStep={route.step} focusKey={route.key} />; break;
    case 'skills': content = route.param ? <SkillDetailPage key={route.param} id={route.param} /> : <SkillsPage />; break;
    case 'goals':
    case 'quests':
    case 'journal': content = <JournalPage tab={journalTabOf(route.page, route.param)} />; break;
    case 'reference': content = <ReferencePage key={route.param ?? ''} section={route.param} />; break;
    case 'settings': content = <SettingsPage />; break;
    case 'shopping': content = <ShoppingPage />; break;
    case 'gear': content = <GearPage />; break;
  }

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <div className={`app-shell ${compact ? 'is-compact' : ''}`}>
        <aside className="app-sidebar" aria-label="Workspace navigation">
          <div className="sidebar-identity">
          <a className="brand" href="#/">
            <CompassMark />
            <span>OSRS Path</span>
          </a>
          <HeaderMode />
          </div>
          <nav className="tabs tabs-top" aria-label="Sections">
            {TABS.map(({ page, href, label, Icon }) => (
              <a key={page} href={href} className={`tab ${section === page ? 'is-active' : ''}`} title={label}
                aria-current={section === page ? 'page' : undefined}>
                <Icon /><span className="tab-label">{label}</span>
              </a>
            ))}
          </nav>
          <div id="app-route-slot" />
          <div className="sidebar-utilities">
            <HeaderProgress />
            <a href="#/settings" className={`sidebar-settings ${route.page === 'settings' ? 'is-active' : ''}`} aria-current={route.page === 'settings' ? 'page' : undefined}><IconSettings />Settings</a>
          </div>
        </aside>
        <div className="app-content">
      <header className={`topbar ${compact ? 'is-compact' : ''}`}>
        <div className="topbar-inner">
          <a className="mobile-brand brand" href="#/" aria-label="OSRS Path"><CompassMark /><span>OSRS Path</span></a>
          <div className="mobile-mode"><HeaderMode /></div>
          <span className="workspace-breadcrumb">{pageTitle(route.page, route.param)}</span>
          <div className="topbar-actions">
            {compact && (
              <button type="button" className="btn btn-sm" onClick={() => setFeatures({ compact: false })}>Full workspace</button>
            )}
            <BridgeIndicator />
            {!compact && (
              <button type="button" className="icon-btn compact-btn" aria-label="Compact view: keep the current action next to the game"
                title="Compact view: keep the current action next to the game"
                onClick={() => { setFeatures({ compact: true }); if (route.page !== 'path') location.hash = '#/'; }}>
                <IconCompact />
              </button>
            )}
            <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search" aria-keyshortcuts="/">
              <IconSearch />
              <span className="search-trigger-text">Search</span>
              <kbd>/</kbd>
            </button>
            <a href="#/settings" className={`icon-btn ${route.page === 'settings' ? 'is-active' : ''}`} aria-label="Settings"
              aria-current={route.page === 'settings' ? 'page' : undefined}>
              <IconSettings /><span className="settings-link-label">Settings</span>
            </a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={compact ? 'is-compact' : undefined}>
        <UpdateBanner />
        <ProfileBanner />
        <PageBoundary resetKey={`${route.page}/${route.param ?? ''}`}><SectionShell key={route.page} page={route.page} param={route.param}>{content}</SectionShell></PageBoundary>
      </main>
        </div>
      </div>

      <nav className={`tabs tabs-bottom ${compact ? 'is-compact' : ''}`} aria-label="Sections">
        {TABS.map(({ page, href, label, Icon }) => (
          <a key={page} href={href} className={`tab ${section === page ? 'is-active' : ''}`}
            aria-current={section === page ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <PrepWatcher />
      <PrepAuto />
      <ToastView />
      <GearHintSync />
      <CleanupSync />
      <PrepSync />
      <SkillSync />
      <SearchBox open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
