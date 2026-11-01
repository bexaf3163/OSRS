// A step image opened full size over the page.
import { useEffect, useRef } from 'react';
import { IconClose } from '../../ui/Icons';

export function ImageModal({ src, alt, caption, onClose }: { src: string; alt: string; caption?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="image-modal" aria-label={caption ?? alt}
      onClose={onClose} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
      <button type="button" className="icon-btn image-modal-close" onClick={() => dialog.current?.close()} aria-label="Close">
        <IconClose />
      </button>
      <img src={src} alt={alt} referrerPolicy="no-referrer" />
      {caption && <p className="image-modal-caption">{caption}</p>}
    </dialog>
  );
}
