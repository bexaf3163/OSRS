import { useEffect, useState, type ComponentType } from 'react';
import { membersSkills, skillById, reference } from './data';
import { useStore } from './store';
import { useRoute, type Page } from './lib/router';
import { IconBook, IconGoals, IconPath, IconQuests, IconSearch, IconSettings, IconSkills } from './components/Icons';
import { SearchBox } from './components/SearchBox';
import { ModeToggle } from './components/ModeToggle';
import { ToastView } from './components/ToastView';
import { PathPage } from './pages/Path';
import { SkillsPage } from './pages/Skills';
import { SkillDetailPage } from './pages/SkillDetail';
import { GoalsPage } from './pages/Goals';
import { QuestsPage } from './pages/Quests';
import { ReferencePage } from './pages/Reference';
import { SettingsPage } from './pages/Settings';

const TABS: { page: Page; href: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { page: 'path', href: '#/', label: 'Путь', Icon: IconPath },
  { page: 'skills', href: '#/skills', label: 'Навыки', Icon: IconSkills },
  { page: 'goals', href: '#/goals', label: 'Цели', Icon: IconGoals },
  { page: 'quests', href: '#/quests', label: 'Квесты', Icon: IconQuests },
  { page: 'reference', href: '#/reference', label: 'Справка', Icon: IconBook },
];

function pageTitle(page: Page, param?: string): string {
  if (page === 'skills' && param) return skillById.get(param)?.name ?? membersSkills.find((m) => m.id === param)?.name ?? 'Навыки';
  if (page === 'reference' && param) return reference.sections.find((s) => s.id === param)?.title ?? 'Справка';
  if (page === 'settings') return 'Настройки';
  return TABS.find((t) => t.page === page)!.label;
}

export function App() {
  const route = useRoute();
  const { mode } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);

  // «/» открывает поиск, если фокус не в поле ввода.
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
    document.title = `${pageTitle(route.page, route.param)} — OSRS Путь`;
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
  }

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        К содержимому
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <img src="./icon.svg" alt="" width="28" height="28" />
            <span>OSRS Путь</span>
          </a>
          <nav className="tabs tabs-top" aria-label="Разделы">
            {TABS.map(({ page, href, label, Icon }) => (
              <a key={page} href={href} className={`tab ${route.page === page ? 'is-active' : ''}`}
                aria-current={route.page === page ? 'page' : undefined}>
                <Icon />{label}
              </a>
            ))}
          </nav>
          <div className="topbar-actions">
            <ModeToggle />
            <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Поиск" aria-keyshortcuts="/">
              <IconSearch />
              <span className="search-trigger-text">Поиск</span>
              <kbd>/</kbd>
            </button>
            <a href="#/settings" className={`icon-btn ${route.page === 'settings' ? 'is-active' : ''}`} aria-label="Настройки"
              aria-current={route.page === 'settings' ? 'page' : undefined}>
              <IconSettings />
            </a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>{content}</main>

      <nav className="tabs tabs-bottom" aria-label="Разделы">
        {TABS.map(({ page, href, label, Icon }) => (
          <a key={page} href={href} className={`tab ${route.page === page ? 'is-active' : ''}`}
            aria-current={route.page === page ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <ToastView />
      <SearchBox open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
