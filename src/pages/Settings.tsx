import { useRef, useState } from 'react';
import { known } from '../data';
import { useStore } from '../store';
import { exportFileName, exportProgress, importProgress, type ImportResult } from '../lib/progress';
import { applyTheme, loadTheme, type Theme } from '../lib/theme';

/** Программа для ПК открывает сборку с диска (file://). */
const isDesktop = location.protocol === 'file:';

const THEMES: [Theme, string][] = [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная']];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const { progress, replace, reset } = useStore();
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [pending, setPending] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = Object.values(progress.steps).filter((s) => s === 'done').length;
  const file = () => new File([exportProgress(progress)], exportFileName(), { type: 'application/json' });
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file()] });

  const share = async () => {
    try {
      await navigator.share({ files: [file()], title: 'Прогресс OSRS Путь' });
    } catch {
      // Отмена в окне «Поделиться» — не ошибка.
    }
  };

  const onFile = async (f: File | undefined) => {
    setImportError('');
    setPending(null);
    if (!f) return;
    const result = importProgress(await f.text(), known);
    if (result.ok) setPending(result);
    else setImportError(result.error);
    if (fileRef.current) fileRef.current.value = '';
  };

  const pickTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Настройки</h1>
      </header>

      <section className="card section-card">
        <h2 className="card-title">Перенос прогресса</h2>
        {isDesktop ? (
          <p className="muted">
            Прогресс хранится в этой программе на компьютере — отдельно от браузера и телефона. Чтобы перенести его,
            сохрани файл здесь и загрузи его на другом устройстве.
          </p>
        ) : (
          <p className="muted">
            Прогресс хранится только в этом браузере. Чтобы перенести его между ноутбуком и телефоном, сохрани файл здесь
            и загрузи его там. На iPhone приложение с экрана «Домой» хранит данные отдельно от Safari — переносить тоже файлом.
          </p>
        )}
        <p className="small">Сейчас: {done} шагов сделано, изменено {new Date(progress.updatedAt).toLocaleString('ru-RU')}.</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => download(exportFileName(), exportProgress(progress))}>
            Экспорт прогресса
          </button>
          {canShare && <button type="button" className="btn" onClick={share}>Поделиться файлом</button>}
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Импорт прогресса</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        {importError && <p className="notice is-error" role="alert">{importError}</p>}
        {pending && (
          <div className="notice" role="alert">
            <p>
              В файле: сделано {pending.stats.done}, пропущено {pending.stats.skipped}, уровней {pending.stats.levels},
              заметок {pending.stats.notes}; сохранён {new Date(pending.progress.updatedAt).toLocaleString('ru-RU')}.
              {pending.stats.dropped > 0 && ` Неизвестных записей отброшено: ${pending.stats.dropped}.`}
            </p>
            <p>Текущий прогресс на этом устройстве будет заменён.</p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={() => { replace(pending.progress, 'Прогресс загружен'); setPending(null); }}>
                Заменить
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>Отмена</button>
            </div>
          </div>
        )}
      </section>

      <section className="card section-card">
        <h2 className="card-title" id="theme-h">Тема</h2>
        <div className="segmented" role="group" aria-labelledby="theme-h">
          {THEMES.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={theme === t} className={`seg ${theme === t ? 'is-active' : ''}`} onClick={() => pickTheme(t)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card section-card">
        <h2 className="card-title">Сброс</h2>
        <p className="muted">Удалит отметки, уровни и заметки на этом устройстве. Сразу после сброса его можно отменить.</p>
        {confirmReset ? (
          <div className="actions">
            <button type="button" className="btn btn-danger" onClick={() => { reset(); setConfirmReset(false); }}>Да, сбросить всё</button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Отмена</button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="btn" onClick={() => setConfirmReset(true)}>Сбросить прогресс</button>
          </div>
        )}
      </section>

      <p className="muted small">
        OSRS Путь {__APP_VERSION__}
        {isDesktop ? ' · программа для ПК' : ''}
        {' · '}<a href="https://github.com/bexaf3163/OSRS/releases/latest" target="_blank" rel="noopener noreferrer">Новые версии</a>
      </p>
    </div>
  );
}
