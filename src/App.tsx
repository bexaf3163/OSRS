// The frame: the header, the page switch (hash routing), the global observers of preparation and of the RuneLite link.
import { useEffect, useState, type ComponentType } from 'react';
import { findSkill, reference } from './data';
import { useStore } from './store';
import { useRoute, type Page } from './lib/router';
import { IconBook, IconGoals, IconPath, IconQuests, IconSearch, IconSettings, IconSkills } from './components/Icons';
import { SearchBox } from './components/SearchBox';
import { ModeToggle } from './components/ModeToggle';
import { DensityToggle } from './components/DensityToggle';
import { HeaderProgress } from './components/HeaderProgress';
import { BridgeIndicator } from './components/BridgeIndicator';
import { ToastView } from './components/ToastView';
import { PrepAuto, PrepWatcher } from './components/PrepRoute';
import { PageBoundary } from './components/PageBoundary';
import { GearHintSync } from './components/GearHintSync';
import { PrepSync } from './components/PrepSync';
import { PathPage } from './pages/Path';
import { SkillsPage } from './pages/Skills';
import { SkillDetailPage } from './pages/SkillDetail';
import { GoalsPage } from './pages/Goals';
import { QuestsPage } from './pages/Quests';
import { ReferencePage } from './pages/Reference';
import { SettingsPage } from './pages/Settings';
import { ShoppingPage } from './pages/Shopping';
import { GearPage } from './pages/Gear';
import { ProfileBanner } from './components/ProfileBanner';
import { UpdateBanner } from './components/UpdateBanner';

const TABS: { page: Page; href: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { page: 'path', href: '#/', label: 'Path', Icon: IconPath },
  { page: 'skills', href: '#/skills', label: 'Skills', Icon: IconSkills },
  { page: 'goals', href: '#/goals', label: 'Goals', Icon: IconGoals },
  { page: 'quests', href: '#/quests', label: 'Quests', Icon: IconQuests },
  { page: 'reference', href: '#/reference', label: 'Reference', Icon: IconBook },
];

function pageTitle(page: Page, param?: string): string {
  if (page === 'skills' && param) return findSkill(param)?.name ?? 'Skills';
  if (page === 'reference' && param) return reference.sections.find((s) => s.id === param)?.title ?? 'Reference';
  if (page === 'settings') return 'Settings';
  if (page === 'shopping') return 'GE shopping list';
  if (page === 'gear') return 'Gear';
  return TABS.find((t) => t.page === page)!.label;
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

  let content;
  switch (route.page) {
    case 'path': content = <PathPage focusStep={route.step} focusKey={route.key} />; break;
    case 'skills': content = route.param ? <SkillDetailPage key={route.param} id={route.param} /> : <SkillsPage />; break;
    case 'goals': content = <GoalsPage />; break;
    case 'quests': content = <QuestsPage />; break;
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
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <img src="./icon.svg" alt="" width="28" height="28" />
            <span>OSRS Path</span>
          </a>
          <nav className="tabs tabs-top" aria-label="Sections">
            {TABS.map(({ page, href, label, Icon }) => (
              <a key={page} href={href} className={`tab ${route.page === page ? 'is-active' : ''}`} title={label}
                aria-current={route.page === page ? 'page' : undefined}>
                <Icon /><span className="tab-label">{label}</span>
              </a>
            ))}
          </nav>
          <div className="topbar-actions">
            <HeaderProgress />
            <BridgeIndicator />
            <DensityToggle />
            <ModeToggle />
            <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search" aria-keyshortcuts="/">
              <IconSearch />
              <span className="search-trigger-text">Search</span>
              <kbd>/</kbd>
            </button>
            <a href="#/gear" className={`icon-btn icon-btn-emoji ${route.page === 'gear' ? 'is-active' : ''}`}
              aria-label="Gear: what to wear and buy to hit faster" title="Gear: what to wear and buy to hit faster"
              aria-current={route.page === 'gear' ? 'page' : undefined}>
              <span aria-hidden="true">⚔️</span>
            </a>
            <a href="#/shopping" className={`icon-btn icon-btn-emoji ${route.page === 'shopping' ? 'is-active' : ''}`}
              aria-label="Grand Exchange shopping list" title="Grand Exchange shopping list"
              aria-current={route.page === 'shopping' ? 'page' : undefined}>
              <span aria-hidden="true">🛒</span>
            </a>
            <a href="#/settings" className={`icon-btn ${route.page === 'settings' ? 'is-active' : ''}`} aria-label="Settings"
              aria-current={route.page === 'settings' ? 'page' : undefined}>
              <IconSettings />
            </a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <UpdateBanner />
        <ProfileBanner />
        <PageBoundary resetKey={`${route.page}/${route.param ?? ''}`}>{content}</PageBoundary>
      </main>

      <nav className="tabs tabs-bottom" aria-label="Sections">
        {TABS.map(({ page, href, label, Icon }) => (
          <a key={page} href={href} className={`tab ${route.page === page ? 'is-active' : ''}`}
            aria-current={route.page === page ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <PrepWatcher />
      <PrepAuto />
      <ToastView />
      <GearHintSync />
      <PrepSync />
      <SearchBox open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
