// The route rail as a slide-in panel for windows that are too narrow for a permanent column.

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

export function RouteDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return createPortal(
    <dialog ref={dialog} className="drawer rail-drawer" aria-label="Route: stages and steps"
      onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="drawer-panel">
        <button type="button" className="icon-btn drawer-close" onClick={onClose} aria-label="Close the route"><IconClose /></button>
        <div className="drawer-body">{open ? children : null}</div>
      </div>
    </dialog>,
    document.body,
  );
}
