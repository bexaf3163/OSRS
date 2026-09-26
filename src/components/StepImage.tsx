// Схема или скриншот внутри карточки шага: сворачиваемый блок и полноразмерный просмотр.

import { useEffect, useRef, useState } from 'react';
import { IconClose } from './Icons';

export function StepImage({ src, caption }: { src: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const alt = caption ? `Схема: ${caption}` : 'Схема к шагу';

  return (
    <details className="step-image">
      <summary>📷 Показать схему / скриншот</summary>
      <figure className="step-figure">
        {failed ? (
          <div className="image-error" role="img" aria-label={alt}>
            Картинка не загрузилась — нет связи с OSRS Wiki или файл переименован.{' '}
            <a href={src} target="_blank" rel="noopener noreferrer">Открыть в браузере</a>
          </div>
        ) : (
          <button type="button" className="image-open" onClick={() => setZoomed(true)} aria-label={`${alt} — открыть крупно`}>
            <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
          </button>
        )}
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
      {zoomed && <ImageModal src={src} alt={alt} caption={caption} onClose={() => setZoomed(false)} />}
    </details>
  );
}

export function ImageModal({ src, alt, caption, onClose }: { src: string; alt: string; caption?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="image-modal" aria-label={caption ?? alt}
      onClose={onClose} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
      <button type="button" className="icon-btn image-modal-close" onClick={() => dialog.current?.close()} aria-label="Закрыть">
        <IconClose />
      </button>
      <img src={src} alt={alt} referrerPolicy="no-referrer" />
      {caption && <p className="image-modal-caption">{caption}</p>}
    </dialog>
  );
}
