// A step view (Preparation, Travel, Details) as a panel that slides over the workspace: the main screen shows everything the step needs at once,
// the long reference views are one key away and never push the page down.

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

export function StepDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return createPortal(
    <dialog ref={dialog} className="drawer step-drawer" aria-label={title}
      onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="drawer-panel">
        <header className="step-drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={`Close ${title}`}><IconClose /></button>
        </header>
        <div className="drawer-body step-drawer-body">{open ? children : null}</div>
      </div>
    </dialog>,
    document.body,
  );
}
