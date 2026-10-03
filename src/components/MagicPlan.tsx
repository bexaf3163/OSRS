// «Магия до цели: сколько заклинаний и сколько это стоит» — у шагов с `magicPlan` (S2-04). Цены — с биржи, опыт —
// из игры (или по уровню); без цен и связи с игрой расчёт всё равно показывается, но помечен приблизительным.

import { useEffect, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { xpForLevel } from '../lib/xp';
import { getGePrice } from '../services/pricesApi';
import {
  hidesToCover, OPTIONS, planFor, PLAN_PRICE_IDS, SPELLS, SPELLS_CHECKED, STAFFS, staffPayback, type PlanResult, type PriceMap,
} from '../lib/magicPlan';

/** Нужный пользователю уровень Magic из цели шага. */
function targetLevel(step: Step): number {
  return step.magicPlan?.target ?? step.inGame?.completionTrigger?.levels?.find((l) => l.skill === 'magic')?.level ?? 25;
}

export function MagicPlan({ step }: { step: Step }) {
  const { progress } = useStore();
  const { xp, stats, gear, owned } = useBridge();
  const [prices, setPrices] = useState<PriceMap | null>(null);
  const [failed, setFailed] = useState(false);
  const plan = step.magicPlan;

  useEffect(() => {
    if (!plan) return undefined;
    let alive = true;
    void Promise.all(PLAN_PRICE_IDS.map(async (id) => [id, (await getGePrice(id))?.buyPrice] as const))
      .then((rows) => { if (alive) setPrices(new Map(rows.filter((r): r is readonly [number, number] => typeof r[1] === 'number'))); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [plan]);

  if (!plan) return null;
  const target = targetLevel(step);
  const level = stats?.magic ?? progress.levels.magic;
  const gameXp = xp?.magic;
  // Опыт: точный из игры; иначе начало введённого уровня; иначе — после Imp Catcher и Witch's Potion (875 + 325) уровень 10.
  const fromXp = gameXp ?? (level !== undefined ? xpForLevel(level) : 1200);
  const basis = gameXp !== undefined ? 'опыт из игры' : level !== undefined ? `Magic ${level}, опыт с начала уровня` : 'Magic 10 — после Imp Catcher и Witch’s Potion';
  const w = wealthOf(gear);
  const cash = w ? (w.cash.total ?? w.cash.bag ?? 0) : null;
  const has = (name: string) => [...(gear?.equipment ?? []), ...(gear?.inventory ?? [])].some((i) => i.name === name)
    || (owned?.items.get(name.toLowerCase())?.carried ?? 0) > 0;

  if (!prices) {
    return (
      <section className="step-section magic-plan" aria-label="Расчёт магии">
        <h4 className="subhead">🔮 Сколько стоит дойти до Magic {target}</h4>
        <p className="muted small">{failed ? 'Цены биржи недоступны — расчёт по ним невозможен. Таблица заклинаний ниже верная.' : 'Загружаю цены биржи…'}</p>
        <SpellTable />
      </section>
    );
  }

  const results = OPTIONS.map((o) => planFor(o, fromXp, target, prices, o.staff ? has(STAFFS[o.staff].name) : false)).filter((r): r is PlanResult => r !== null);
  if (!results.length) return null;
  const cheapest = results.reduce((a, b) => (b.total < a.total ? b : a));
  const fastest = results.reduce((a, b) => (b.casts < a.casts ? b : a));
  const hides = hidesToCover(cheapest.total, prices);
  const fireSpell = SPELLS.find((s) => s.id === 'fire-strike')!;
  const pay = staffPayback('fire', fireSpell, prices);

  return (
    <section className="step-section magic-plan" aria-label="Расчёт магии">
      <h4 className="subhead">🔮 Сколько стоит дойти до Magic {target}</h4>
      <p className="muted small">
        Отсюда: {basis}. Нужно ещё {Math.max(0, xpForLevel(target) - fromXp).toLocaleString('ru-RU')} опыта.
        Цены — биржа сейчас; заклинания — карточки вики (проверено {SPELLS_CHECKED}).
      </p>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr><th>Вариант</th><th>Заклинаний</th><th>Руны</th><th>Посох</th><th>Итого</th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.option.id} className={r === cheapest ? 'is-current' : ""}>
                <td>{r.option.label}{r === cheapest && ' · дешевле всего'}{r === fastest && r !== cheapest && ' · быстрее всего'}</td>
                <td>{r.casts.toLocaleString('ru-RU')}</td>
                <td>{formatGp(r.runesCost)}</td>
                <td>{r.staffCost ? formatGp(r.staffCost) : '—'}</td>
                <td><strong>{formatGp(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cash !== null && (
        <p className="small">
          У тебя {formatGp(cash)} gp{w?.bankUnknown ? ' в сумке (банк не открывали)' : ''}.{' '}
          {cash >= cheapest.total
            ? <strong className="ok-text">На самый дешёвый вариант хватает.</strong>
            : <>На самый дешёвый вариант не хватает {formatGp(cheapest.total - cash)} gp — но заклинания можно кастовать порциями: деньги вернутся шкурами.</>}
        </p>
      )}
      <ul className="small">
        <li><strong>Бей коров в Lumbridge.</strong> Уровень 2, 8 здоровья, шкура падает с каждой.{hides !== null ? ` Чтобы окупить ${formatGp(cheapest.total)} gp на рунах, нужно продать ≈ ${hides} шкур.` : ''} Шкуры — на биржу или к Ellis в Al Kharid (кожа дороже).</li>
        {pay && (
          <li>Посох огня окупается за ≈ {pay.casts} заклинаний Fire Strike: он экономит {formatGp(pay.perCast)} gp на каждом (руны огня не тратятся). {has(STAFFS.fire.name) ? 'Он у тебя уже есть.' : 'Купи его на первых шкурах.'}</li>
        )}
        <li>Заклинания одного яруса бьют одинаково — Wind Strike с посохом воздуха дешевле, а Fire Strike вдвое быстрее по опыту. Выбирай по тому, чего не хватает: монет или времени.</li>
      </ul>
      <SpellTable />
    </section>
  );
}

function SpellTable() {
  return (
    <details className="small">
      <summary>Заклинания-удары: уровень, опыт, руны</summary>
      <ul>
        {SPELLS.map((s) => (
          <li key={s.id}><strong>{s.name}</strong> — Magic {s.level}, {s.xp} опыта; {Object.entries(s.runes).map(([r, n]) => `${n} ${r}`).join(' + ')}</li>
        ))}
      </ul>
    </details>
  );
}
