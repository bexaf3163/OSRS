// Progress in the header: a ring "how much is done" and quest points. The ring is a link to "Path".

import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';

export function HeaderProgress() {
  const { progress, steps, qp, maxQp } = useStore();
  const closed = steps.filter((s) => isClosed(progress, s.id)).length;
  const pct = steps.length ? Math.round((closed / steps.length) * 100) : 0;
  return (
    <a className="header-progress" href="#/" aria-label={`Done ${pct}%, quest points ${qp} of ${maxQp}`}>
      <span className="ring" style={{ '--p': `${pct}%` } as CSSProperties} aria-hidden="true">
        <span className="ring-value">{pct}%</span>
      </span>
      <span className="header-qp" aria-hidden="true">
        <span className="header-qp-label">Quest points</span>
        <span className="header-qp-value"><b>{qp}</b> / {maxQp}</span>
      </span>
    </a>
  );
}
