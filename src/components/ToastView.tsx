import { useEffect } from 'react';
import { useStore } from '../store';

const HIDE_AFTER = 6000;

export function ToastView() {
  const { toast, undo, dismissToast } = useStore();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, HIDE_AFTER);
    return () => window.clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="toast-region" aria-live="polite" role="status">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undo && <button type="button" className="toast-undo" onClick={undo}>Отменить</button>}
        </div>
      )}
    </div>
  );
}
