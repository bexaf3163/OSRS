// Inline-разметка гайда в React без innerHTML: **жирный**, `код`, [ссылка](url) и коды шагов → ссылки.

import type { ReactNode } from 'react';
import { stepById } from '../data';

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\bS[1-6]-\d{2}\b)/g;

export function Inline({ text, linkSteps = true }: { text: string; linkSteps?: boolean }) {
  return <>{render(text, linkSteps)}</>;
}

function render(text: string, linkSteps: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const tok = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    last = m.index! + tok.length;
    if (tok.startsWith('**')) {
      out.push(<strong key={key++}>{render(tok.slice(2, -2), linkSteps)}</strong>);
    } else if (tok.startsWith('`')) {
      out.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      const external = /^https?:\/\//.test(lm[2]);
      out.push(external
        ? <a key={key++} href={lm[2]} target="_blank" rel="noopener noreferrer">{lm[1]}</a>
        : <span key={key++}>{lm[1]}</span>);
    } else if (linkSteps && stepById.has(tok)) {
      out.push(<a key={key++} className="step-ref" href={`#/step/${tok}`}>{tok}</a>);
    } else {
      out.push(tok);
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
