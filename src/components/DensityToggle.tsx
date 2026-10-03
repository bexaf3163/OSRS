// Переключатель плотности: в шапке — одна кнопка-значок, в настройках — подписанные варианты.
//   🧘 Дзен (по умолчанию): текущий шаг, одна строка статуса, кнопка «Сделано» и критичные предупреждения.
//   🔍 Инспектор: все блоки карточки шага развёрнуты — формулы, калькуляторы, ветки, досье, экономика.
// Расчёты и связь с игрой работают одинаково в обоих режимах — меняется только то, что попадает на экран.

import { setFeatures, useFeatures } from '../lib/features';

/** Кнопка в шапке: показывает текущий режим, клик — переключает. */
export function DensityToggle() {
  const { inspector } = useFeatures();
  const next = inspector ? 'Дзен' : 'Инспектор';
  const label = `Режим «${inspector ? 'Инспектор' : 'Дзен'}» — переключить на «${next}»`;
  return (
    <button type="button" className="icon-btn icon-btn-emoji density-btn" aria-pressed={inspector} aria-label={label}
      title={`${label}. ${inspector ? 'Сейчас все блоки шага развёрнуты.' : 'Сейчас только шаг, статус и «Сделано».'}`}
      onClick={() => setFeatures({ inspector: !inspector })}>
      <span aria-hidden="true">{inspector ? '🔍' : '🧘'}</span>
    </button>
  );
}

/** Подписанный переключатель для настроек. */
export function DensityPills() {
  const { inspector } = useFeatures();
  return (
    <div className="mode-toggle style-toggle" role="group" aria-label="Плотность экрана">
      {([[false, '🧘', 'Дзен'], [true, '🔍', 'Инспектор']] as const).map(([value, icon, label]) => (
        <button key={label} type="button" className={`mode-btn ${inspector === value ? 'is-active' : ''}`} aria-pressed={inspector === value}
          onClick={() => setFeatures({ inspector: value })}>
          <span aria-hidden="true">{icon}</span> <span className="style-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
