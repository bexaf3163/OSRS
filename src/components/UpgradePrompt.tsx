// "⚡ SPEED UPGRADE": before a long training — a cheap better tool, if the level already allows.
// Weapons and armor on combat steps are advised by GearPrompt (the gear analysis).
// The button leads the in-game arrow to the seller (a temporary target): they are highlighted with the caption "[Buy: …]", the item is in the shop
// window. When the item is in the bag or worn, the target is cleared by itself and the arrow leads to the step again.
// It buys and spends nothing — only hints. "✕ Skip" hides the hint on this step.

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

/** The tool advice for a step (gearUpgradeRouter): shared by the hint and the preparation plan. */
export function useUpgradeRecommendation(step: Step): UpgradeRecommendation | null {
  const { upgradeRouter } = useFeatures();
  const { progress, mode } = useStore();
  const { gear, stats } = useBridge();
  const [prices, setPrices] = useState<ReadonlyMap<number, number>>(new Map());
  const relevant = upgradeRouter && stepUpgradeCategories(step).length > 0 && !isClosed(progress, step.id);

  const rec = useMemo(() => {
    if (!relevant) return null;
    // The levels from the game outrank the hand-entered ones: they are exact and fresh.
    const levels: Record<string, number | undefined> = { ...progress.levels, ...(stats ?? {}) };
    return recommendUpgrade({ step, mode, levels, gear, dismissed: progress.upgradeDismissedForSteps, gePrices: prices });
  }, [relevant, step, mode, progress.levels, progress.upgradeDismissedForSteps, stats, gear, prices]);

  // The exchange price — once per item; without a network the shop price stays.
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
    <section className={`upgrade ${rec.status === 'UPGRADE_NOT_AFFORDABLE' ? 'is-poor' : ''}`} aria-label="Speed upgrade">
      <p className="upgrade-kicker">⚡ Speed upgrade</p>
      <p className="upgrade-title">
        {rec.currentItem ? <>Replace {rec.currentItem} → </> : <>Get </>}<strong>{rec.recommendedItem}</strong>
      </p>
      <p className="small">
        {level ? <>You have {skillName} {level}, and </> : null}{rec.recommendedItem} is available from level {rec.levelReq}. {rec.efficiencyBoost}
      </p>
      <p className="small upgrade-where">
        <span className="muted">Where to get it: </span>
        {rec.shop
          ? <PlaceButton query={{ kind: 'shop', location: rec.city ?? '', shop: rec.shop, npc: rec.npc }} onShow={places.show}>{where}</PlaceButton>
          : where}
        {rec.npc && <span className="muted"> · seller {rec.npc}</span>}
        {rec.approxCost !== undefined && <> · ~{formatGp(rec.approxCost)} gp</>}
        {rec.shopPrice !== undefined && rec.gePrice !== undefined && rec.gePrice < rec.shopPrice && (
          <span className="muted"> (exchange ~{formatGp(rec.gePrice)} gp, shop {formatGp(rec.shopPrice)} gp)</span>
        )}
      </p>

      {rec.status === 'UPGRADE_NOT_AFFORDABLE' ? (
        <div className="upgrade-cash">
          <p className="small"><strong>💰 Not enough coins:</strong> ~{formatGp(rec.approxCost ?? 0)} gp needed, you have {formatGp(rec.coins ?? 0)} gp with the bank. It is too early to go to the shop.</p>
          <p className="small muted">How to make it up quickly — guidelines, not a promised income:</p>
          <ul className="small">
            {s1_09 && <li>Complete <a href="#/step/S1-09">Stronghold of Security (S1-09)</a> — it gives 10,000 coins from the chests.</li>}
            <li>Collect feathers from the chickens at the Lumbridge farm and sell them on the Grand Exchange.</li>
            <li>Sell on the Grand Exchange what you will not need on the route.</li>
          </ul>
        </div>
      ) : going ? (
        <p className="small upgrade-going" role="status">
          ● The in-game arrow leads to {rec.npc ?? 'Grand Exchange'}. When {rec.recommendedItem} is in the bag, it will return to the step by itself.
        </p>
      ) : null}

      <div className="upgrade-actions">
        {rec.status === 'UPGRADE_AVAILABLE' && nav && !going && (
          <NavigateButton target={nav} label={`🧭 Point ${rec.npc ? `to ${rec.npc}` : 'to the Grand Exchange'}`} />
        )}
        {going && <button type="button" className="btn btn-sm" onClick={() => void clearNav()}>Return the arrow to the step</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (going) void clearNav(); dismissUpgrade(step.id); }}>
          ✕ Skip
        </button>
      </div>
      <PlaceMapView view={places.view} onClose={places.close} />
    </section>
  );
}
