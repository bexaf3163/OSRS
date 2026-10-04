// «⚔️ Снаряжение»: что надето, насколько сильно бьёт и что сделать, чтобы бить быстрее, — надеть лучшее из сумки
// и банка, купить у торговца или на бирже, накопить. Считается по формулам урона OSRS Wiki против противника
// ближайшего шага с боем. Данные о снаряжении — из RuneLite; без него — по уровням из профиля.

import { useBridge, type LastGear } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { useGearAdvice } from '../lib/gearAdvice';
import {
  actionNav, gainText, SLOT_LABEL, SLOTS, statsText, WINDOW, type GearAction, type LockedItem, type MeleeResult,
  type MissingRequirement,
} from '../services/gearAdvisor';
import type { Step } from '../types';
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

/** Куда вести за недостающим: страница навыка (план прокачки) или шаг с квестом. */
const SKILL_PAGE = { attack: 'ME', strength: 'ME', defence: 'ME', ranged: 'RA', magic: 'MA', prayer: 'PR' } as const;
const SKILL_EN = { attack: 'Attack', strength: 'Strength', defence: 'Defence', ranged: 'Ranged', magic: 'Magic', prayer: 'Prayer' } as const;

export function questStep(steps: Step[], quest: string): Step | undefined {
  return steps.find((s) => s.inGame?.completionTrigger?.type === 'QUEST_COMPLETED' && s.inGame.completionTrigger.questName === quest);
}

function MissingLine({ m, steps }: { m: MissingRequirement; steps: Step[] }) {
  if (m.kind === 'skill') {
    const left = m.need - m.have;
    return (
      <li>
        ✗ {m.need} {SKILL_EN[m.skill]} <span className="muted">— сейчас {m.have}, не хватает {left}</span>
        {' '}<a href={`#/skills/${SKILL_PAGE[m.skill]}`}>⚡ как добрать</a>
      </li>
    );
  }
  const step = questStep(steps, m.quest);
  return (
    <li>
      ✗ квест {m.quest}
      {step ? <> {' '}<a href={`#/step/${step.id}`}>🧭 к шагу {step.id}</a></> : <span className="muted"> — на маршруте его нет</span>}
    </li>
  );
}

/**
 * Замок: одно требование — одна строка. Три стальных предмета «нужно 5 Defence» — одной строкой с тремя
 * названиями, а не тремя одинаковыми карточками. Предмет, который уже лежит в банке, — всегда отдельно.
 */
function LockedRow({ group, live, steps }: { group: LockedItem[]; live: boolean; steps: Step[] }) {
  const l = group[0];
  const skills = l.missing.filter((m) => m.kind === 'skill');
  const title = skills.length
    ? `нужно ${skills.map((m) => `${m.need} ${SKILL_EN[m.skill]}`).join(' и ')}`
    : 'нужен квест';
  return (
    <li className="gear-row gear-locked">
      <ItemIcon src={l.item.iconUrl} alt="" size={28} />
      <div className="gear-main">
        <p>
          <span className="lock-chip">🔒 {title}</span>{' '}
          {group.map((g, i) => (
            <span key={g.item.id}>
              {i > 0 && ', '}<strong>{g.item.name}</strong>{' '}
              <span className="muted small">({g.item.nameRu}, {SLOT_LABEL[g.slot].toLowerCase()})</span>
            </span>
          ))}
        </p>
        {l.owned && (
          <p className="small"><strong>Уже {l.owned === 'bank' ? 'лежит в банке' : 'в сумке'}, но надеть его пока нельзя.</strong> Не продавай — пригодится.</p>
        )}
        {group.length === 1 && <p className="small">{capital(live ? gainText(l) : statsText(l))} — когда откроется.</p>}
        <ul className="small gear-plain lock-missing">
          {l.missing.map((m) => <MissingLine key={m.kind === 'skill' ? m.skill : m.quest} m={m} steps={steps} />)}
        </ul>
      </div>
    </li>
  );
}

function lockGroups(locked: LockedItem[]): LockedItem[][] {
  const out: LockedItem[][] = [];
  const byKey = new Map<string, LockedItem[]>();
  for (const l of locked) {
    if (l.owned) { out.push([l]); continue; }
    const key = JSON.stringify(l.missing);
    const g = byKey.get(key);
    if (g) g.push(l);
    else { const n = [l]; byKey.set(key, n); out.push(n); }
  }
  // Сначала то, что уже есть, — его нельзя пропустить.
  return out.sort((a, b) => Number(Boolean(b[0].owned)) - Number(Boolean(a[0].owned)));
}

export function GearPage() {
  const { state, stats, gear, lastGear } = useBridge();
  const { mode, steps } = useStore();
  const { advice, fightStep, pricesReady, pricesFailed } = useGearAdvice();
  const places = usePlaceMap();
  const lv = advice.levels;
  const fromGame = Boolean(stats?.attack);
  const coins = advice.coins;
  const wealth = wealthOf(gear);

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
          {lv.ranged ? <> · Ranged {lv.ranged}</> : null}
          {lv.magic ? <> · Magic {lv.magic}</> : null}
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
          <p>
            <strong>Монеты:</strong> {formatGp(coins.total)} gp <span className="muted">(в сумке {formatGp(coins.bag ?? 0)}{coins.bank !== null ? `, в банке ${formatGp(coins.bank)}` : ', банк ещё не открывали'})</span>
            {wealth?.items.total != null && wealth.items.total > 0 && (
              <span className="muted"> · предметы ~{formatGp(wealth.items.total)} gp по ценам биржи (оценка, не деньги)</span>
            )}
          </p>
        )}
        <p className="muted small">
          {bridgeNote}
          {pricesFailed ? ' Цены биржи недоступны (нет интернета?) — покупки на бирже без цены.' : !pricesReady ? ' Загружаю цены биржи…' : ''}
        </p>
      </section>

      {!advice.live && lastGear && <LastKnown last={lastGear} />}

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

      {advice.locked.length > 0 && (
        <section className="card section-card" aria-labelledby="gear-locked">
          <h2 id="gear-locked" className="card-title">🔒 Лучше, но пока нельзя надеть</h2>
          <p className="small muted">
            Требования — уровни и квесты — с OSRS Wiki. Такие предметы программа не советует покупать, пока требования не выполнены.
          </p>
          <ul className="gear-list">{lockGroups(advice.locked).map((g) => <LockedRow key={g.map((l) => l.item.id).join('-')} group={g} live={advice.live} steps={steps} />)}</ul>
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

/** Что было у персонажа, когда игру закрыли: не «сейчас», а запись — поэтому с датой и именем. */
function LastKnown({ last }: { last: LastGear }) {
  const g = last.gear;
  const worn = (g.equipment ?? []).map((i) => i.name);
  const bag = (g.inventory ?? []).map((i) => (i.count && i.count > 1 ? `${i.name} ×${i.count}` : i.name));
  return (
    <section className="card section-card" aria-labelledby="gear-last">
      <h2 id="gear-last" className="card-title">Последнее известное — {last.player}, {new Date(last.at).toLocaleString('ru-RU')}</h2>
      <p className="muted small">Запись, пока игра шла. Что изменилось после — программа узнает, когда RuneLite подключится.</p>
      {worn.length > 0 && <p className="small"><strong>Надето:</strong> {worn.join(', ')}</p>}
      {bag.length > 0 && <p className="small"><strong>В сумке:</strong> {bag.join(', ')}</p>}
      {g.coins !== null && (
        <p className="small">
          <strong>Монеты:</strong> {formatGp(g.coins)} gp{g.bankCoins != null ? `, в банке ${formatGp(g.bankCoins)}` : ''}
        </p>
      )}
    </section>
  );
}
