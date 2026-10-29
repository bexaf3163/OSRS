import type { ReactNode } from 'react';

/** The window-sized stage. It is laid out 1:1 (the reference size is 1440x900), so the interface scale,
 *  the font size and Windows display scaling keep working; `.la-root` carries the design tokens. */
export function LedgerStage({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`la-root la-viewport ${className}`}>
      <div className="la-stage">{children}</div>
    </div>
  );
}
