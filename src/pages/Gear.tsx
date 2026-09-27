// «⚔️ Снаряжение»: что надето, насколько сильно бьёт и что сделать, чтобы бить быстрее, — надеть лучшее из сумки
// и банка, купить у торговца или на бирже, накопить. Считается по формулам урона OSRS Wiki против противника
// ближайшего шага с боем. Данные о снаряжении — из RuneLite; без него — по уровням из профиля.

import { useBridge } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { useGearAdvice } from '../lib/gearAdvice';
import {
  actionNav, gainText, SLOT_LABEL, SLOTS, statsText, WINDOW, type GearAction, type MeleeResult,
} from '../services/gearAdvisor';
import { ItemIcon } from '../components/WikiDrawer';
import { NavigateButton } from '../components/NavigateButton';
import { PlaceMapView, usePlaceMap } from '../components/PlaceMap';
import { ActionNotes, ActionSource, ActionTitle, foesText } from '../components/GearPrompt';

const TYPE_RU = { stab: 'колющий', slash: 'режущий', crush: 'дробящий' } as const;
const STYLE_RU = { accurate: 'Accurate', aggressive: 'Aggressive' } as const;
const sec = (n: number) => n.toFixed(1).replace('.', ',');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;

function DamageLine({ r }: { r: MeleeResult }) {
  return (
    <>
      удар до <strong>{r.maxHit}</strong>, раз в {sec(r.speed)} с, попаданий {pct(r.hitChance)}
      {' '}— урона в секунду {r.dps.toFixed(2).replace('.', ',')} (стиль {STYLE_RU[r.style]}{r.type ? `, ${TYPE_RU[r.type]} удар` : ''})
    </>
  );
}

function ActionRow({ a, stepId, live, onShow }: { a: GearAction; stepId?: string; live: boolean; onShow: ReturnType<typeof usePlaceMap>['show'] }) {
  const nav = actionNav(a, stepId);
  return (
    <li className="gear-row">
      <ItemIcon src={a.item.iconUrl} alt="" size={28} />
      <div className="gear-main">
        <p><ActionTitle a={a} /> <span className="muted small">({a.item.nameRu}, {SLOT_LABEL[a.slot].toLowerCase()})</span></p>
        <p className="small">{capital(live ? gainText(a) : statsText(a))}{a.short !== undefined ? <> · <strong>не хватает {formatGp(a.short)} gp</strong></> : null}.<ActionNotes a={a} /></p>
        {a.how === 'buy' && <p className="small upgrade-where"><ActionSource a={a} onShow={onShow} /></p>}
      </div>
      {nav && a.short === undefined && <NavigateButton target={nav} compact />}
    </li>
  );
}

export function GearPage() {
  const { state, stats } = useBridge();
  const { mode } = useStore();
  const { advice, fightStep, pricesReady, pricesFailed } = useGearAdvice();
  const places = usePlaceMap();
  const lv = advice.levels;
  const fromGame = Boolean(stats?.attack);
  const coins = advice.coins;

  const bridgeNote = !advice.live
    ? state === 'off'
      ? 'Связь с RuneLite выключена — советы по уровням из профиля, без того, что надето и сколько монет.'
      : 'RuneLite не подключён или ты не в игре — советы по уровням из профиля.'
    : coins.bank === null
      ? 'Снаряжение и сумка — из игры. Открой банк в игре: программа учтёт монеты и вещи оттуда.'
      : 'Снаряжение, сумка и банк — из игры.';

  return (
    <div className="page gear-page">
      <header className="page-head">
        <h1>⚔️ Снаряжение</h1>
        <p className="muted">
          Что надето, как сильно оно бьёт и что сделать, чтобы бить быстрее: сначала бесплатное (надеть лучшее из сумки
          и банка), потом покупки по карману. Программа ничего не покупает и не надевает — только считает и ведёт стрелку.
        </p>
      </header>

      <section className="card gear-summary" aria-label="Сейчас">
        <p>
          <strong>Уровни {fromGame ? 'из игры' : 'из профиля'}:</strong> Attack {lv.attack} · Strength {lv.strength} · Defence {lv.defence}
          {lv.prayer ? <> · Prayer {lv.prayer}</> : null}
          {!fromGame && <span className="muted"> — вводятся на странице <a href="#/skills">Навыки</a></span>}
        </p>
        <p>
          <strong>Сравнение {foesText(advice.foes)}</strong>
          {fightStep
            ? <span className="muted"> — противник шага <a href={`#/step/${fightStep.id}`}>{fightStep.id}</a> «{fightStep.title}»</span>
            : <span className="muted"> — шагов с боем впереди нет</span>}
        </p>
        {advice.live ? (
          <p>
            <strong>Сейчас:</strong> {advice.weaponUnknown ? <>в руке {advice.weaponUnknown} — его бонусов нет в базе программы, посчитано без него: </> : null}
            <DamageLine r={advice.weaponNow} />
            {advice.weaponNow.dps > 0 && (
              <> · ≈ {Math.round(advice.foes[0].hitpoints / advice.weaponNow.dps)} с на одного: {advice.foes[0].name}, {advice.foes[0].hitpoints} HP</>
            )}
          </p>
        ) : (
          <p><strong>Сейчас:</strong> что в руке, программа не видит — нужна связь с RuneLite.</p>
        )}
        {coins.total !== null && (
          <p><strong>Монеты:</strong> {formatGp(coins.total)} gp <span className="muted">(в сумке {formatGp(coins.bag ?? 0)}{coins.bank !== null ? `, в банке ${formatGp(coins.bank)}` : ', банк ещё не открывали'})</span></p>
        )}
        <p className="muted small">
          {bridgeNote}
          {pricesFailed ? ' Цены биржи недоступны (нет интернета?) — покупки на бирже без цены.' : !pricesReady ? ' Загружаю цены биржи…' : ''}
        </p>
      </section>

      <section className="card section-card" aria-labelledby="gear-now">
        <h2 id="gear-now" className="card-title">Сделать сейчас — бить быстрее</h2>
        {advice.actions.length ? (
          <ul className="gear-list">{advice.actions.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        ) : (
          <p className="small">
            {advice.live
              ? 'Оружие и амулет — лучшее, что можно сейчас при твоих уровнях и деньгах.'
              : 'Без данных из игры программа не знает, что надето и сколько монет, — смотри цели ниже: это лучшее по уровню.'}
          </p>
        )}
      </section>

      {advice.goals.length > 0 && (
        <section className="card section-card" aria-labelledby="gear-goals">
          <h2 id="gear-goals" className="card-title">{advice.live ? 'Накопить — лучше, чем по карману сейчас' : 'Лучшее по уровню'}</h2>
          <ul className="gear-list">{advice.goals.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        </section>
      )}

      {advice.armour.length > 0 && (
        <section className="card section-card" aria-labelledby="gear-armour">
          <h2 id="gear-armour" className="card-title">Броня по карману — по желанию</h2>
          <p className="small muted">
            Бой она не ускоряет — бережёт здоровье и еду. В закупки маршрута не входит: деньги на шаги (S2-01, S2-04) важнее.
          </p>
          <ul className="gear-list">{advice.armour.map((a) => <ActionRow key={`${a.slot}-${a.item.id}`} a={a} stepId={fightStep?.id} live={advice.live} onShow={places.show} />)}</ul>
        </section>
      )}

      <section className="card section-card" aria-labelledby="gear-next">
        <h2 id="gear-next" className="card-title">Что откроется дальше</h2>
        <ul className="small gear-plain">
          {advice.unlocks.map((u) => (
            <li key={u.item.id}>
              <strong>{u.item.name}</strong> ({u.item.nameRu}) — с {u.level} {u.skill === 'attack' ? 'Attack' : u.skill === 'defence' ? 'Defence' : 'Strength'}
              <span className="muted"> · у тебя {u.have}</span>
            </li>
          ))}
          {advice.prayers.map((p) => (
            <li key={p.name}>
              Молитва <strong>{p.name}</strong> ({p.effect}) уже открыта — включай в бою{p.maxHit ? <>: удар до {p.maxHit}</> : null}.
            </li>
          ))}
          {!advice.prayers.length && (
            <li>С 4 Prayer откроется <strong>Burst of Strength</strong> (+5% к силе) — закапывай кости (Bury), они падают с коров.</li>
          )}
        </ul>
      </section>

      <section className="card section-card" aria-labelledby="gear-slots">
        <h2 id="gear-slots" className="card-title">Надето</h2>
        {advice.live ? (
          <ul className="gear-slots">
            {SLOTS.map((slot) => {
              const e = advice.equipped[slot];
              return (
                <li key={slot}>
                  <span className="muted">{SLOT_LABEL[slot]}</span>
                  <span>
                    {e ? (
                      <>
                        {e.piece && <ItemIcon src={e.piece.iconUrl} alt="" />} {e.name}
                        {!e.piece && <span className="muted small"> (нет в базе)</span>}
                      </>
                    ) : <span className="muted">пусто</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small muted">Появится, когда программа будет на связи с RuneLite и ты в игре.</p>
        )}
      </section>

      <p className="muted small">
        Урон — по формулам OSRS Wiki (Damage per second/Melee), защита противника — из его карточки на вики. Проценты — в среднем
        на ближайших {WINDOW} уровнях силы: меч покупают на всю прокачку, а максимальный удар растёт ступеньками.
        Советуем, если урон вырастет хотя бы на 3% или защита — хотя бы на 3. Предметы, требования и цены магазинов — OSRS Wiki,
        цены биржи — prices.runescape.wiki.
        {mode === 'members' && ' В базе пока только оружие и броня бесплатного мира.'}
      </p>
      <PlaceMapView view={places.view} onClose={places.close} />
    </div>
  );
}
