// «⚡ СКОРОСТНОЙ АПГРЕЙД»: перед долгой прокачкой — дешёвый инструмент получше, если уровень уже позволяет.
// Оружие и броню на шагах с боем советует GearPrompt (разбор снаряжения).
// Кнопка ведёт стрелку в игре к продавцу (временная цель): он подсвечен с подписью «[Купи: …]», предмет — в окне
// магазина. Когда предмет оказался в сумке или надет, цель снимается сама и стрелка снова ведёт к шагу.
// Ничего не покупает и не тратит — только подсказывает. «✕ Пропустить» прячет подсказку на этом шаге.

import { useEffect, useMemo, useState } from 'react';
import type { Step } from '../types';
import { useStore } from '../store';
import { useBridge } from '../bridge';
import { useFeatures } from '../lib/features';
import { isClosed } from '../lib/next-step';
import { formatGp } from '../lib/shopping';
import { getGePrice } from '../services/pricesApi';
import { recommendUpgrade, showsPrompt, stepUpgradeCategories, upgradeNav, type UpgradeRecommendation } from '../services/gearUpgradeRouter';
import { NavigateButton } from './NavigateButton';
import { PlaceButton, PlaceMapView, usePlaceMap } from './PlaceMap';

const SKILL_LABEL = { woodcutting: 'Woodcutting', mining: 'Mining' } as const;

/** Совет по инструменту для шага (gearUpgradeRouter): общий для подсказки и для плана подготовки. */
export function useUpgradeRecommendation(step: Step): UpgradeRecommendation | null {
  const { upgradeRouter } = useFeatures();
  const { progress, mode } = useStore();
  const { gear, stats } = useBridge();
  const [prices, setPrices] = useState<ReadonlyMap<number, number>>(new Map());
  const relevant = upgradeRouter && stepUpgradeCategories(step).length > 0 && !isClosed(progress, step.id);

  const rec = useMemo(() => {
    if (!relevant) return null;
    // Уровни из игры главнее введённых вручную: они точные и свежие.
    const levels: Record<string, number | undefined> = { ...progress.levels, ...(stats ?? {}) };
    return recommendUpgrade({ step, mode, levels, gear, dismissed: progress.upgradeDismissedForSteps, gePrices: prices });
  }, [relevant, step, mode, progress.levels, progress.upgradeDismissedForSteps, stats, gear, prices]);

  // Цена на бирже — один раз на предмет; без сети остаётся цена магазина.
  const wantPrice = rec?.recommendedItemId;
  useEffect(() => {
    if (!wantPrice || prices.has(wantPrice)) return;
    let alive = true;
    getGePrice(wantPrice).then((p) => {
      if (alive && p?.buyPrice) setPrices((m) => new Map(m).set(wantPrice, p.buyPrice));
    }).catch(() => {});
    return () => { alive = false; };
  }, [wantPrice, prices]);
  return rec;
}

export function UpgradePrompt({ step }: { step: Step }) {
  const { progress, dismissUpgrade } = useStore();
  const { stats, navTarget, clearNav } = useBridge();
  const places = usePlaceMap();
  const rec = useUpgradeRecommendation(step);

  if (!showsPrompt(rec)) return null;
  const nav = upgradeNav(rec, step.id);
  const going = navTarget?.itemName === rec.recommendedItem && navTarget?.stepId === step.id;
  const level = (stats ?? {})[rec.skill] ?? progress.levels[rec.skill];
  const skillName = SKILL_LABEL[rec.skill];
  const where = rec.shop ? `${rec.shop} • ${rec.city}` : 'Grand Exchange';
  const s1_09 = step.stage === 1 && !isClosed(progress, 'S1-09');

  return (
    <section className={`upgrade ${rec.status === 'UPGRADE_NOT_AFFORDABLE' ? 'is-poor' : ''}`} aria-label="Скоростной апгрейд">
      <p className="upgrade-kicker">⚡ Скоростной апгрейд</p>
      <p className="upgrade-title">
        {rec.currentItem ? <>Замени {rec.currentItem} → </> : <>Возьми </>}<strong>{rec.recommendedItem}</strong>
      </p>
      <p className="small">
        {level ? <>У тебя {skillName} {level}, а </> : null}{rec.recommendedItem} можно с уровня {rec.levelReq}. {rec.efficiencyBoost}
      </p>
      <p className="small upgrade-where">
        <span className="muted">Где взять: </span>
        {rec.shop
          ? <PlaceButton query={{ kind: 'shop', location: rec.city ?? '', shop: rec.shop, npc: rec.npc }} onShow={places.show}>{where}</PlaceButton>
          : where}
        {rec.npc && <span className="muted"> · продавец {rec.npc}</span>}
        {rec.approxCost !== undefined && <> · ~{formatGp(rec.approxCost)} gp</>}
        {rec.shopPrice !== undefined && rec.gePrice !== undefined && rec.gePrice < rec.shopPrice && (
          <span className="muted"> (на бирже ~{formatGp(rec.gePrice)} gp, в магазине {formatGp(rec.shopPrice)} gp)</span>
        )}
      </p>

      {rec.status === 'UPGRADE_NOT_AFFORDABLE' ? (
        <div className="upgrade-cash">
          <p className="small"><strong>💰 Не хватает монет:</strong> нужно ~{formatGp(rec.approxCost ?? 0)} gp, с банком есть {formatGp(rec.coins ?? 0)} gp. Идти в магазин пока рано.</p>
          <p className="small muted">Как быстро добрать — ориентиры, а не обещанный заработок:</p>
          <ul className="small">
            {s1_09 && <li>Пройди <a href="#/step/S1-09">Stronghold of Security (S1-09)</a> — там 10 000 coins за сундуки.</li>}
            <li>Собери перья с куриц на ферме у Lumbridge и продай их на Grand Exchange.</li>
            <li>Продай на Grand Exchange то, что не пригодится по маршруту.</li>
          </ul>
        </div>
      ) : going ? (
        <p className="small upgrade-going" role="status">
          ● Стрелка в игре ведёт к {rec.npc ?? 'Grand Exchange'}. Когда {rec.recommendedItem} окажется в сумке, она сама вернётся к шагу.
        </p>
      ) : null}

      <div className="upgrade-actions">
        {rec.status === 'UPGRADE_AVAILABLE' && nav && !going && (
          <NavigateButton target={nav} label={`🧭 Направить ${rec.npc ? `к ${rec.npc}` : 'на Grand Exchange'}`} />
        )}
        {going && <button type="button" className="btn btn-sm" onClick={() => void clearNav()}>Вернуть стрелку к шагу</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (going) void clearNav(); dismissUpgrade(step.id); }}>
          ✕ Пропустить
        </button>
      </div>
      <PlaceMapView view={places.view} onClose={places.close} />
    </section>
  );
}
