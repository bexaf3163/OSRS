import type { CSSProperties, ReactNode } from 'react';

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="la-eyebrow" style={style}>
      {children}
    </div>
  );
}

/** A page of the open book. `side` picks the left or right leaf; "w" is one page across the whole book. */
export function Page({ side, basis, className = '', label, children }: { side: 'l' | 'r' | 'w'; basis?: number; className?: string; label?: string; children: ReactNode }) {
  return (
    <div className={`la-pg la-${side} ${className}`} style={basis ? { flex: `0 0 ${basis}px` } : undefined} role={label ? 'region' : undefined} aria-label={label}>
      {children}
    </div>
  );
}

export function Book({ children }: { children: ReactNode }) {
  return <div className="la-book">{children}</div>;
}
