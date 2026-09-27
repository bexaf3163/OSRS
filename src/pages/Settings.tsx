import { useEffect, useId, useRef, useState } from 'react';
import { known } from '../data';
import { useStore } from '../store';
import { exportFileName, exportProgress, importProgress, type ImportResult } from '../lib/progress';
import { applyTheme, loadTheme, type Theme } from '../lib/theme';
import { desktop, type RuneliteCheck, type ZoomState } from '../lib/desktop';
import { applyTextScale, loadTextScale, percent, stepScale, TEXT_EVENT, TEXT_STEPS, ZOOM_STEPS } from '../lib/ui-scale';
import { useBridge } from '../bridge';
import { setFeatures, useFeatures, type Features } from '../lib/features';
import { BRIDGE_ORIGIN } from '../services/runeliteBridge';

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
  const [pending, setPending] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bridge = desktop();

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

  return (
    <div className="page">
      <header className="page-head">
        <h1>Настройки</h1>
      </header>

      <Appearance />
      <RuneLiteBridge />
      <Helpers />

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
        {bridge && (
          <p className="muted small">
            {bridge.isPortable() ? 'Переносная версия: данные лежат рядом с программой, в папке ' : 'Копия прогресса лежит в папке '}
            <code className="code code-path">{bridge.dataDir()}</code>
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
              {pending.stats.migrated && ' Файл от первой версии маршрута — отметки перенесены на V2, старые сохранены внутри.'}
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
        {isDesktop ? ` · программа для ПК${bridge?.isPortable() ? ', переносная' : ''}` : ''}
        {' · '}<a href="https://github.com/bexaf3163/OSRS/releases/latest" target="_blank" rel="noopener noreferrer">Новые версии</a>
      </p>
    </div>
  );
}

function Stepper({ id, label, value, steps, onChange }: { id: string; label: string; value: number; steps: number[]; onChange: (v: number) => void }) {
  return (
    <div className="scale-setting" role="group" aria-labelledby={id}>
      <span className="setting-label" id={id}>{label}</span>
      <span className="scale-row">
        <span className="stepper">
          <button type="button" className="stepper-btn" onClick={() => onChange(stepScale(steps, value, -1))}
            disabled={value <= steps[0]} aria-label={`${label}: меньше`}>−</button>
          <output className="stepper-value" aria-live="polite">{percent(value)}</output>
          <button type="button" className="stepper-btn" onClick={() => onChange(stepScale(steps, value, 1))}
            disabled={value >= steps[steps.length - 1]} aria-label={`${label}: больше`}>+</button>
        </span>
        {value !== 1 && <button type="button" className="btn btn-ghost" onClick={() => onChange(1)}>Сбросить до 100%</button>}
      </span>
    </div>
  );
}

function Appearance() {
  const bridge = desktop();
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [text, setText] = useState(loadTextScale);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const ids = { theme: useId(), text: useId(), zoom: useId() };

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    bridge.getZoom().then((z) => alive && setZoom(z));
    const off = bridge.onZoom(setZoom);
    return () => { alive = false; off(); };
  }, [bridge]);

  // Размер шрифта мог поменяться клавишами — держим переключатель в согласии.
  useEffect(() => {
    const on = () => setText(loadTextScale());
    window.addEventListener(TEXT_EVENT, on);
    return () => window.removeEventListener(TEXT_EVENT, on);
  }, []);

  const pickTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };
  const pickText = (v: number) => {
    setText(v);
    applyTextScale(v);
  };
  const pickZoom = (next: { zoom?: number; autoZoom?: boolean }) => {
    if (!bridge || !zoom) return;
    const z = { zoom: next.zoom ?? zoom.zoom, autoZoom: next.autoZoom ?? zoom.autoZoom };
    setZoom({ ...zoom, ...z });
    bridge.setZoom(z);
  };

  return (
    <section className="card section-card">
      <h2 className="card-title">Внешний вид</h2>

      <div className="setting">
        <span className="setting-label" id={ids.theme}>Тема</span>
        <div className="segmented" role="group" aria-labelledby={ids.theme}>
          {THEMES.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={theme === t} className={`seg ${theme === t ? 'is-active' : ''}`} onClick={() => pickTheme(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {bridge && zoom ? (
        <div className="setting">
          <Stepper id={ids.zoom} label="Масштаб интерфейса" value={zoom.zoom} steps={ZOOM_STEPS} onChange={(v) => pickZoom({ zoom: v })} />
          <label className="switch">
            <input type="checkbox" checked={zoom.autoZoom} onChange={(e) => pickZoom({ autoZoom: e.target.checked })} />
            <span>Подстраивать под размер окна</span>
          </label>
          <p className="muted small">
            Сейчас {percent(zoom.effective)}{zoom.autoZoom && Math.abs(zoom.effective - zoom.zoom) > 0.005 ? ' с учётом ширины окна' : ''}.
            Клавиши: <kbd>Ctrl</kbd> + <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd> + <kbd>0</kbd> — сброс, или <kbd>Ctrl</kbd> + колесо мыши.
          </p>
        </div>
      ) : (
        <div className="setting">
          <span className="setting-label">Масштаб интерфейса</span>
          <p className="muted small">
            В браузере масштаб меняется его средствами: <kbd>Ctrl</kbd> + <kbd>+</kbd> / <kbd>−</kbd>, <kbd>Ctrl</kbd> + <kbd>0</kbd> — сброс.
            В программе для ПК масштаб ещё и подстраивается под размер окна.
          </p>
        </div>
      )}

      <div className="setting">
        <Stepper id={ids.text} label="Размер шрифта" value={text} steps={TEXT_STEPS} onChange={pickText} />
        <p className="muted small">Меняет только текст — отступы и раскладка остаются прежними.</p>
      </div>

      {bridge && zoom && (
        <div className="setting">
          <label className="switch">
            <input type="checkbox" checked={zoom.alwaysOnTop}
              onChange={(e) => { setZoom({ ...zoom, alwaysOnTop: e.target.checked }); bridge.setAlwaysOnTop(e.target.checked); }} />
            <span>Поверх всех окон — удобно держать рядом с игрой</span>
          </label>
        </div>
      )}
    </section>
  );
}

const HELPERS: { key: keyof Features; title: string; text: string }[] = [
  { key: 'autoLocation', title: '📍 Места на карте', text: 'Места в досье вики (где лежит бесплатно, магазины, продавцы, города) открываются на карте мира, а 🧭 ведёт туда стрелку в игре.' },
  { key: 'bankTags', title: '🏷️ Bank Tags для этапа', text: 'Кнопка со строкой импорта для плагина Bank Tags и мягкая подсветка предметов этапа в банке через плагин OSRS Path Bridge.' },
  { key: 'pacing', title: '⏱ Темп прокачки', text: 'Сколько действий и минут осталось до цели шага — по опыту из игры. Без замеров время не придумывается.' },
  { key: 'upgradeRouter', title: '⚡ Скоростной апгрейд', text: 'Подсказка купить инструмент или оружие получше перед долгой прокачкой, если уровень уже позволяет. Сама ничего не покупает.' },
];

function Helpers() {
  const features = useFeatures();
  return (
    <section className="card section-card">
      <h2 className="card-title">Помощник: места, банк, темп, апгрейды</h2>
      <p className="muted small">
        Выключенная функция не только прячется, но и ничего не делает. То, что рисуется в самой игре (радар опасности,
        подсветка, звук), настраивается ещё и в плагине OSRS Path Bridge: RuneLite → настройки плагина → «Места, радар, темп».
      </p>
      {HELPERS.map((h) => (
        <div className="setting" key={h.key}>
          <label className="switch">
            <input type="checkbox" checked={features[h.key]} onChange={(e) => setFeatures({ [h.key]: e.target.checked })} />
            <span>{h.title}</span>
          </label>
          <p className="muted small">{h.text}</p>
        </div>
      ))}
    </section>
  );
}

function RuneLiteBridge() {
  const { enabled, setEnabled, state, inGame, activeStepId, clear, canLaunch, launchRuneLite, autoLaunch, setAutoLaunch } = useBridge();
  const [check, setCheck] = useState<RuneliteCheck | null>(null);
  const [launching, setLaunching] = useState(false);
  useEffect(() => {
    if (canLaunch) void desktop()?.runelite?.check().then(setCheck).catch(() => setCheck(null));
  }, [canLaunch, state]);

  const status = state === 'off' ? 'выключена'
    : state === 'online' ? `🟢 плагин на связи${inGame ? ', персонаж в игре' : ', персонаж не в игре'}`
      : state === 'connecting' ? 'подключение…' : '⚪ плагин не отвечает';
  const launch = async () => {
    setLaunching(true);
    await launchRuneLite();
    setLaunching(false);
  };
  return (
    <section className="card section-card">
      <h2 className="card-title">RuneLite</h2>
      <p className="muted">
        Плагин OSRS Path Bridge для RuneLite показывает текущий шаг прямо в игре: стрелка к месту, подсветка NPC, объектов,
        клеток, нужного варианта в диалоге и предметов в инвентаре — и сам отмечает шаг, когда квест засчитан.
        Связь только внутри компьютера: <code className="code">{BRIDGE_ORIGIN}</code>.
      </p>
      <div className="setting">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Связь с RuneLite</span>
        </label>
        <p className="muted small">Сейчас: {status}.{activeStepId && <> В игре показан шаг <code className="code">{activeStepId}</code>.</>}</p>
        {activeStepId && <div className="actions"><button type="button" className="btn" onClick={() => void clear()}>Убрать подсказки из игры</button></div>}
      </div>

      {canLaunch ? (
        <div className="setting">
          <label className="switch">
            <input type="checkbox" checked={autoLaunch} disabled={!enabled} onChange={(e) => setAutoLaunch(e.target.checked)} />
            <span>Запускать RuneLite вместе с OSRS Путь</span>
          </label>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={launch} disabled={launching || !check?.ok || state === 'online'}>
              🎮 {state === 'online' ? 'RuneLite с мостом запущен' : 'Запустить RuneLite с мостом'}
            </button>
          </div>
          {check && (
            <ul className="runelite-checks small">
              {check.ok
                ? <li className="is-ok">✓ RuneLite {check.clientVersion} найден — плагин запустится вместе с ним</li>
                : check.problems.map((p) => <li key={p} className="is-bad">✗ {p}</li>)}
              {check.credentials
                ? <li className="is-ok">✓ Вход с Jagex Account сохранён</li>
                : <li className="is-warn">! Вход с Jagex Account не сохранён — см. ниже</li>}
            </ul>
          )}
          {check && !check.credentials && (
            <details className="runelite-help">
              <summary>Как входить с Jagex Account (один раз)</summary>
              <p className="small">
                RuneLite, запущенный не из Jagex Launcher, не знает твою сессию. Её можно сохранить один раз — так RuneLite
                советует разработчикам:
              </p>
              <ol className="small">
                <li>В меню «Пуск» открой <strong>RuneLite (configure)</strong>.</li>
                <li>В поле <strong>Client arguments</strong> впиши <code className="code">--insecure-write-credentials</code> и нажми Save.</li>
                <li>Запусти RuneLite через <strong>Jagex Launcher</strong> как обычно и закрой его, когда откроется.</li>
                <li>Верни поле Client arguments пустым — дальше RuneLite с мостом будет входить сам.</li>
              </ol>
              <p className="small muted">
                Сессия хранится в файле <code className="code">%USERPROFILE%\.runelite\credentials.properties</code> — он даёт вход
                в аккаунт, никому его не отправляй. Отозвать: «End sessions» в настройках Jagex Account или удалить файл.
                Старые аккаунты без Jagex Account входят логином и паролем прямо в окне RuneLite.
              </p>
            </details>
          )}
        </div>
      ) : (
        <p className="muted small">
          В программе для ПК RuneLite с плагином запускается одной кнопкой (или сам, вместе с программой).
          В браузере — вручную, как описано в README репозитория, раздел «RuneLite bridge».
        </p>
      )}
    </section>
  );
}
