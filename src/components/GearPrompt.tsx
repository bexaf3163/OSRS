// «⚔️ Сильнее в бою»: на шаге с боем — что надеть или купить, чтобы бить быстрее противника этого шага.
// Разбор — gearAdvisor (формулы урона OSRS Wiki, защита противника с вики). Кнопка ведёт стрелку в игре к продавцу;
// когда предмет окажется в сумке, цель снимется сама. Ничего не покупает и не надевает — только советует.
// «✕ Пропустить» прячет совет на этом шаге (и строку в HUD игры).

import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useFeatures } from '../lib/features';
import { isClosed } from '../lib/next-step';
import { formatGp } from '../lib/shopping';
import { useGearAdvice } from '../lib/gearAdvice';
import { actionNav, gainText, missingText, sourceText, type GearAction, type GearAdvice, type Source } from '../services/gearAdvisor';
import type { Foe } from '../types';
import { NavigateButton } from './NavigateButton';
import { PlaceButton, PlaceMapView, usePlaceMap } from './PlaceMap';

/** «против Cow (2 ур.)», «против Al Kharid warrior (9 ур.) и Flesh Crawler (28 ур.)». */
export const foesText = (foes: Foe[]) => `против ${foes.map((f) => `${f.name} (${f.combat} ур.)`).join(' и ')}`;

/** Что сделать: «Надень Iron scimitar — он в банке», «Купи Steel scimitar вместо Bronze sword». */
export function ActionTitle({ a }: { a: GearAction }) {
  const cur = a.current?.name ?? a.currentName;
  if (a.how === 'wear') {
    return <>Надень <strong>{a.item.name}</strong> — {a.source.kind === 'bank' ? 'он в банке' : 'он в сумке'}</>;
  }
  return <>Купи <strong>{a.item.name}</strong>{cur ? <> вместо {cur}</> : null}</>;
}

/** Где взять: магазин — с кнопкой карты, биржа — с ценой; второй вариант — «или …». */
export function ActionSource({ a, onShow }: { a: GearAction; onShow: ReturnType<typeof usePlaceMap>['show'] }) {
  if (a.how === 'wear') return null;
  const s = a.source;
  const alt = a.alternatives.find((x) => x.kind !== s.kind || (x.kind === 'shop' && s.kind === 'shop' && x.shop !== s.shop));
  return (
    <>
      {s.kind === 'shop' ? (
        <>
          <PlaceButton query={{ kind: 'shop', location: s.location, shop: s.shop, npc: s.npc }} onShow={onShow}>{s.shop} • {s.location}</PlaceButton>
          {s.npc && <span className="muted"> · продавец {s.npc}</span>}
          <> · {formatGp(s.price)} gp</>
          {s.toll ? <span className="muted"> (+{s.toll} gp за проход в Al Kharid)</span> : null}
        </>
      ) : (
        <>Grand Exchange{s.kind === 'ge' && s.price !== undefined ? <> · ~{formatGp(s.price)} gp</> : <span className="muted"> · цена не загрузилась</span>}</>
      )}
      {alt && <span className="muted"> · или {altText(alt)}</span>}
    </>
  );
}

const altText = (s: Source) => (s.kind === 'ge' ? (s.price !== undefined ? `на бирже ~${formatGp(s.price)} gp` : 'на бирже') : sourceText(s));

/** Пометки: предмет всё равно покупается по маршруту, двуручное оружие. */
export function ActionNotes({ a }: { a: GearAction }) {
  return (
    <>
      {a.routeStep && (
        <> По маршруту он покупается на шаге <a href={`#/step/${a.routeStep}`}>{a.routeStep}</a> — взять раньше значит раньше бить быстрее.</>
      )}
      {a.twoHanded && <> Двуручное: щит придётся снять.</>}
    </>
  );
}

/** «⚠️ Coif есть в банке, но надеть его пока нельзя: 20 Ranged (сейчас 17)» — чтобы не принять его за готовый. */
export function LockedOwnedNote({ advice }: { advice: GearAdvice }) {
  const owned = advice.locked.filter((l) => l.owned);
  if (!owned.length) return null;
  return (
    <>
      {owned.map((l) => (
        <p key={l.item.id} className="small lock-note">
          ⚠️ <strong>{l.item.name}</strong> {l.owned === 'bank' ? 'есть в банке' : 'есть в сумке'}, но надеть его пока нельзя: нужно {missingText(l.missing)}.
        </p>
      ))}
    </>
  );
}

export function GearPrompt({ step }: { step: Step }) {
  const { upgradeRouter } = useFeatures();
  const { progress } = useStore();
  // Дешёвые проверки — до разбора: он нужен только раскрытому невыполненному шагу с боем.
  if (!upgradeRouter || !step.foes?.length || isClosed(progress, step.id) || progress.upgradeDismissedForSteps?.includes(step.id)) return null;
  return <GearPromptBody step={step} />;
}

function GearPromptBody({ step }: { step: Step }) {
  const { dismissUpgrade } = useStore();
  const { state } = useBridge();
  const { advice } = useGearAdvice(step);
  const places = usePlaceMap();
  const top = advice.actions[0];
  const more = advice.actions.slice(1, 3);
  const goal = advice.goals.find((g) => g.slot === 'weapon') ?? advice.goals.find((g) => g.slot === 'neck');
  const vs = foesText(advice.foes);
  const skip = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissUpgrade(step.id)}>✕ Пропустить</button>
  );

  // Без RuneLite не видно, что надето и сколько монет: советуем по уровням из профиля.
  if (!advice.live) {
    const best = advice.goals.find((g) => g.slot === 'weapon');
    if (!best) return null;
    return (
      <section className="upgrade" aria-label="Сильнее в бою">
        <p className="upgrade-kicker">⚔️ Сильнее в бою</p>
        <p className="small">
          Лучшее оружие по твоему уровню Attack ({advice.levels.attack}) — <strong>{best.item.name}</strong>
          {best.source.kind !== 'bag' && best.source.kind !== 'bank' ? <> ({sourceText(best.source)})</> : null}.
          {' '}{state === 'online'
            ? 'Войди в игру в RuneLite — программа увидит, что надето и сколько монет, и скажет, стоит ли менять.'
            : 'Включи связь с RuneLite — программа увидит, что надето и сколько монет, и скажет, стоит ли менять.'}
        </p>
        <div className="upgrade-actions">
          <a className="btn btn-sm" href="#/gear">Весь разбор снаряжения</a>
          {skip}
        </div>
      </section>
    );
  }

  if (!top) {
    return (
      <>
        <p className="small gear-ok">
          ✓ Оружие — лучшее, что можно при твоих уровнях {vs}
          {goal ? <>; дальше — {goal.item.name}{goal.short !== undefined ? <>, не хватает {formatGp(goal.short)} gp</> : null}</> : null}.
          {' '}<a href="#/gear">Разбор снаряжения</a>
        </p>
        <LockedOwnedNote advice={advice} />
      </>
    );
  }

  const nav = actionNav(top, step.id);
  const seller = top.source.kind === 'shop' ? top.source.npc ?? top.source.shop : 'Grand Exchange';
  return (
    <section className="upgrade" aria-label="Сильнее в бою">
      <p className="upgrade-kicker">⚔️ Сильнее в бою</p>
      <p className="upgrade-title"><ActionTitle a={top} /></p>
      <p className="small">{capital(gainText(top))} {vs}.<ActionNotes a={top} /></p>
      {top.how === 'buy' && <p className="small upgrade-where"><span className="muted">Где взять: </span><ActionSource a={top} onShow={places.show} /></p>}
      {more.length > 0 && (
        <ul className="small gear-more">
          {more.map((a) => (
            <li key={`${a.slot}-${a.item.id}`}>
              <ActionTitle a={a} /> — {gainText(a)}{a.how === 'buy' ? <>, {sourceText(a.source)}</> : null}
            </li>
          ))}
        </ul>
      )}
      {goal && (
        <p className="small muted">
          💰 Цель: {goal.item.name} — {gainText(goal)}
          {goal.short !== undefined ? <>, не хватает {formatGp(goal.short)} gp</> : <>, цена неизвестна</>}.
        </p>
      )}
      <LockedOwnedNote advice={advice} />
      <div className="upgrade-actions">
        {nav && <NavigateButton target={nav} label={`🧭 Направить ${seller === 'Grand Exchange' ? 'на Grand Exchange' : `к ${seller}`}`} />}
        <a className="btn btn-ghost btn-sm" href="#/gear">Весь разбор</a>
        {skip}
      </div>
      <PlaceMapView view={places.view} onClose={places.close} />
    </section>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Баннер на «Пути»: снаряжение видно из игры и есть что сделать — главный совет и ссылка на разбор.
 * Прячется вместе с советом ближайшего шага с боем («✕ Пропустить»).
 */
export function GearBanner() {
  const { upgradeRouter } = useFeatures();
  const { gear } = useBridge();
  if (!upgradeRouter || !gear) return null;
  return <GearBannerBody />;
}

function GearBannerBody() {
  const { progress, dismissUpgrade } = useStore();
  const { advice, fightStep } = useGearAdvice();
  const top = advice.actions[0];
  if (!advice.live || !top || (fightStep && progress.upgradeDismissedForSteps?.includes(fightStep.id))) return null;
  return (
    <section className="upgrade gear-banner" aria-label="Сильнее в бою">
      <p className="upgrade-kicker">⚔️ Можно бить быстрее</p>
      <p className="small"><ActionTitle a={top} /> — {gainText(top)} {foesText(advice.foes)}.</p>
      <div className="upgrade-actions">
        <a className="btn btn-sm" href="#/gear">Разбор снаряжения</a>
        {fightStep && <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissUpgrade(fightStep.id)}>✕ Скрыть</button>}
      </div>
    </section>
  );
}
