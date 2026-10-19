// Shared section navigation. It only presents existing routes and controls; data stays in each workspace.
import { useState, type ReactNode } from 'react';
import { allLevelSkills as levels, reference, findSkill } from '../data';
import { useStore } from '../store';
import type { Page } from '../lib/router';
import { IconBook, IconCart, IconGear, IconJournal } from './Icons';

export function SkillGlyph({ skill, size = 24 }: { skill: string; size?: number }) {
  return <img className="skill-glyph" src={`./skill-icons/${skill === 'runecrafting' ? 'runecraft' : skill}.png`} width={size} height={size} alt="" />;
}

export function SectionShell({ page, param, children }: { page: Page; param?: string; children: ReactNode }) {
  const { mode } = useStore();
  const [selected, setSelected] = useState(0);
  const skill = page === 'skills';
  const titles: Partial<Record<Page, string>> = { skills: 'Skills', gear: 'Gear', shopping: 'Shopping', money: 'Money', journal: 'Journal', quests: 'Journal', goals: 'Journal', reference: 'Reference' };
  const title = titles[page];
  if (!title) return <>{children}</>;
  const icon = page === 'gear' ? <IconGear /> : page === 'shopping' ? <IconCart /> : page === 'reference' ? <IconBook /> : <IconJournal />;
  const links: ({ label: string; href: string; id: string; glyph?: string } | { label: string; selector: string })[] = skill
    ? [{ label: 'Overall', href: '#/skills', id: '', glyph: 'overall' }, ...levels.filter((l, i) => levels.findIndex(other => other.skill === l.skill) === i && (mode === 'members' || !findSkill(l.skill)?.membersOnly)).map(l => ({ label: l.skill === 'ME' ? 'Melee' : l.name, href: `#/skills/${l.skill}`, id: l.skill, glyph: l.id }))]
    : page === 'journal' || page === 'quests' || page === 'goals'
      ? [{ label: 'Quests', href: '#/journal', id: '' }, { label: 'Stage goals', href: '#/journal/goals', id: 'goals' }, { label: 'Session log', href: '#/journal/session', id: 'session' }]
      : page === 'reference'
        ? [{ label: 'Overview', href: '#/reference', id: '' }, ...reference.sections.map(s => ({ label: s.title, href: `#/reference/${s.id}`, id: s.id }))]
        : page === 'gear'
          // Gear is one short page since 2.68: context, worn, one recommendation, the rest folded.
          ? []
          // Shopping is one list with its own scope control: no jump links.
          : [];
  const activeId = page === 'goals' ? 'goals' : page === 'quests' ? '' : param ?? '';
  if (!links.length) return <div className={`section-shell section-${title.toLowerCase()} no-rail`}><div className="section-content">{children}</div></div>;
  return <div className={`section-shell section-${skill ? 'skills' : title.toLowerCase()}`}>
    <aside className="section-rail">
      <h2>{title}</h2>
      <nav aria-label={`${title} workspace navigation`}>
        {links.map((link, i) => {
          const active = 'id' in link ? link.id === activeId : i === selected;
          const inner = <>{'glyph' in link ? <SkillGlyph skill={link.glyph!} /> : icon}<span>{link.label}</span></>;
          return 'href' in link
            ? <a key={link.label} href={link.href} className={`section-nav-item ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>{inner}</a>
            : <button key={link.label} type="button" className={`section-nav-item ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => {
              setSelected(i);
              const target = document.querySelector(link.selector);
              const fold = target?.closest('details');
              if (fold) fold.open = true;
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>{inner}</button>;
        })}
      </nav>
      <p className="section-rail-foot">OSRS Path · {mode === 'members' ? 'Members' : 'F2P'}</p>
    </aside>
    <div className="section-content">{children}</div>
  </div>;
}
