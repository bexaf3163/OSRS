import { useState } from 'react';
import { plugins, reference } from '../data';
import type { Plugin } from '../types';
import { Blocks } from '../components/Blocks';
import { IconBack, IconChevron } from '../components/Icons';
import { Inline } from '../components/Inline';

/** The index is grouped by what the player is trying to do; every section stays in exactly one group. */
const TOPICS: { title: string; ids: string[] }[] = [
  { title: 'Getting started', ids: ['setup', 'membership', 'plugins'] },
  { title: 'Playing the route', ids: ['stuck', 'transport', 'tips'] },
  { title: 'How things connect', ids: ['skill-graph', 'wiki'] },
];

export function ReferencePage({ section }: { section?: string }) {
  if (section) return <ReferenceSection id={section} />;
  const known = new Set(TOPICS.flatMap((t) => t.ids));
  // A section that is not in a group (a new one) still shows up, after the groups.
  const rest = reference.sections.filter((s) => !known.has(s.id));
  const groups = [...TOPICS, ...(rest.length ? [{ title: 'More', ids: rest.map((s) => s.id) }] : [])];
  return (
    <div className="page">
      <header className="page-head">
        <h1>Reference</h1>
        <p className="muted">{reference.description}</p>
      </header>
      {groups.map((g) => {
        const items = g.ids.map((id) => reference.sections.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
        if (!items.length) return null;
        return (
          <section key={g.title} className="section" aria-label={g.title}>
            <h2 className="topic-title">{g.title}</h2>
            <ul className="nav-list card">
              {items.map((s) => (
                <li key={s.id}>
                  <a href={`#/reference/${s.id}`}><span>{s.title}</span><IconChevron className="chevron" /></a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ReferenceSection({ id }: { id: string }) {
  const sec = reference.sections.find((s) => s.id === id);
  return (
    <div className="page">
      <a className="back" href="#/reference"><IconBack />Reference</a>
      {!sec ? <h1>Section not found</h1> : (
        <>
          <header className="page-head"><h1>{sec.title}</h1></header>
          {id === 'plugins' ? <Plugins /> : (
            <div className="prose">
              {id === 'skill-graph' && <SkillGraph />}
              <Blocks blocks={sec.blocks} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A guide diagram (mermaid) as a list with "→", grouped by source. */
function SkillGraph() {
  const groups = new Map<string, string[]>();
  for (const e of reference.graph.edges) groups.set(e.from, [...(groups.get(e.from) ?? []), e.to]);
  return (
    <ul className="flow card" aria-label="How skills feed each other">
      {[...groups].map(([from, to]) => (
        <li key={from} className="flow-row">
          <span className="flow-node">{from}</span>
          <span className="flow-arrow" aria-label="leads to">→</span>
          <span className="flow-targets">{to.map((t) => <span key={t} className="flow-node">{t}</span>)}</span>
        </li>
      ))}
    </ul>
  );
}

type Source = 'all' | Plugin['source'];

function Plugins() {
  const [source, setSource] = useState<Source>('all');
  const options: [Source, string][] = [['all', 'All'], ['builtin', 'Built-in'], ['hub', 'Hub']];
  const count = (s: Source) => plugins.groups.reduce((n, g) => n + g.plugins.filter((p) => s === 'all' || p.source === s).length, 0);

  return (
    <div className="prose">
      <Blocks blocks={plugins.intro} />
      <div className="segmented" role="group" aria-label="Where to get the plugin">
        {options.map(([s, label]) => (
          <button key={s} type="button" aria-pressed={source === s} className={`seg ${source === s ? 'is-active' : ''}`}
            onClick={() => setSource(s)}>
            {label} <span className="seg-count">{count(s)}</span>
          </button>
        ))}
      </div>
      {plugins.groups.map((g) => {
        const list = g.plugins.filter((p) => source === 'all' || p.source === source);
        if (!list.length && !g.notes.length) return null;
        return (
          <section key={g.title} className="section">
            <h2>{g.title}</h2>
            {list.length > 0 && (
              <ul className="plugin-list">
                {list.map((p) => (
                  <li key={p.name} className="plugin">
                    <div className="plugin-head">
                      <span className="plugin-name">{p.name}</span>
                      <span className={`tag ${p.source === 'hub' ? 'tag-hub' : ''}`}>{p.sourceLabel}</span>
                    </div>
                    <div className="muted"><Inline text={p.why} /></div>
                  </li>
                ))}
              </ul>
            )}
            <Blocks blocks={g.notes} />
          </section>
        );
      })}
    </div>
  );
}
