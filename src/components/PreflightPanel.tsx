// «🧳 Проверка вылета»: что из предметов шага уже в сумке — по данным RuneLite, без ручного обновления.
// Шаг проверяется, когда он показан в игре («Показать в игре»): плагин считает сумку и банк именно для него.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { evaluatePreflight, preflightItems } from '../lib/checklist';

export function PreflightPanel({ step }: { step: Step }) {
  const { state, inGame, activeStepId, owned } = useBridge();
  const items = preflightItems(step);
  if (items.length === 0 || state !== 'online') return null;

  let body;
  if (activeStepId !== step.id) {
    body = <p className="muted small">Нажми «Показать в игре» — сумка для этого шага проверится сама.</p>;
  } else if (!inGame || !owned) {
    body = <p className="muted small">Войди в игру в RuneLite — сумка проверится сама.</p>;
  } else {
    const r = evaluatePreflight(items, owned);
    body = (
      <>
        <ul className="preflight-list">
          {r.rows.map(({ item, have, inBank, state: s }) => (
            <li key={item.nameEn} className={`preflight-row is-${s === 'IN_BAG_READY' ? 'ok' : s === 'MISSING_FROM_BAG' ? 'missing' : 'absent'}`}>
              <span className="preflight-mark" aria-hidden="true">{s === 'IN_BAG_READY' ? '✓' : '✗'}</span>
              <span className="preflight-name">
                {item.nameEn} <span className="muted">({item.nameRu})</span>
                {item.heals ? <span className="badge badge-heal">+{item.heals} HP</span> : null}
              </span>
              <span className="preflight-count">
                {have}/{item.count}{item.exact ? '' : '+'}
                {s !== 'IN_BAG_READY' && inBank !== null && (
                  <span className="muted"> · {inBank > 0 ? `в банке ${inBank}` : 'нет в банке'}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className={`preflight-verdict ${r.ready ? 'is-ready' : ''}`} role="status">
          {r.ready ? '🟢 Всё готово — можно идти'
            : owned.bankSeen ? `Не готов к походу: не хватает ${r.missing}`
              : `Не готов к походу: не хватает ${r.missing}. Открой банк — покажу, что там есть, и подсвечу нужное.`}
        </p>
      </>
    );
  }
  return (
    <div className="preflight" aria-label="Проверка вылета">
      <h4 className="subhead">🧳 Проверка вылета</h4>
      {body}
    </div>
  );
}
