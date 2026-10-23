// "🛡 What to wear for magic / ranged": the wiki's advice by slot for your levels and coins. Prices — the exchange; what is worn — from the game.

import { useMemo } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { adviseStyle, shoppingTotal, SLOT_LABEL, STYLE_GEAR, type PickStatus } from '../lib/styleGear';
import { usePriceView } from '../lib/funding/usePriceView';
import { itemPrice, type ItemPrice } from '../lib/itemPrice';
import { findLocalItem } from '../services/wikiService';
import { gearQuestEvidence } from '../lib/gearAdvice';

const STATUS: Record<PickStatus, string> = { worn: '✓ worn', bag: '✓ in the bag', buy: 'buy', save: 'save up', find: 'obtain', locked: 'locked for now' };

export function StyleGear({ step }: { step: Step }) {
  const { progress, steps } = useStore();
  const { stats, gear, questsDone } = useBridge();
  const style = step.styleGear;
  const board = usePriceView(Boolean(style));
  const prices = useMemo<ReadonlyMap<string, ItemPrice>>(() => {
    if (!style) return new Map();
    const names = [...new Set(Object.values(STYLE_GEAR[style]).flatMap((opts) => opts.flatMap((o) => o.names)))];
    return new Map(names.map(n => [n, itemPrice(board, n, findLocalItem(n)?.id, 1)]));
  }, [style, board]);

  const picks = useMemo(() => {
    if (!style) return null;
    const w = wealthOf(gear);
    const done = gearQuestEvidence(steps, progress, questsDone).questsDone;
    return adviseStyle({
      style, levels: { ...progress.levels, ...(stats ?? {}) }, quests: done,
      worn: new Set((gear?.equipment ?? []).map((i) => i.name)), bag: new Set((gear?.inventory ?? []).filter(i => !i.noted).map((i) => i.name)),
      cash: w ? (w.cash.total ?? w.cash.bag ?? null) : null, price: (n) => prices.get(n)?.unit ?? null,
    });
  }, [style, prices, progress, steps, stats, gear, questsDone]);

  if (!style) return null;
  const total = picks ? shoppingTotal(picks) : 0;
  const cached = picks?.some(p => (p.status === 'buy' || p.status === 'save') && p.name && prices.get(p.name)?.state === 'cached');
  return (
    <details className="step-section style-gear">
      <summary><strong>🛡 What to wear {style === 'magic' ? 'for magic' : 'for ranged'}</strong>{total > 0 && <span className="muted small"> — known purchases ≈ {formatGp(total)} gp (1 each{cached ? '; cached estimate' : ''})</span>}</summary>
      {!picks
        ? <p className="muted small">Loading the exchange prices…</p>
        : (
          <ul className="style-list small">
            {picks.map((p) => (
              <li key={p.slot} className={`style-row is-${p.status}`}>
                <strong>{SLOT_LABEL[p.slot]}:</strong> {p.name ?? 'nothing yet'} <span className="muted">· {STATUS[p.status]}</span>
                {p.name && prices.get(p.name) && <span className="muted style-market-price" title={prices.get(p.name)!.detail}> · {prices.get(p.name)!.text}</span>}
                {p.note && <span className="muted"> — {p.note}</span>}
                {p.better && <span className="muted"> · better: {p.better.name} ({p.better.why}{prices.get(p.better.name)?.state === 'cached' && /gp/.test(p.better.why) ? '; cached estimate' : ''})</span>}
              </li>
            ))}
          </ul>
        )}
      <p className="muted small">OSRS Wiki recommendations. This is a list for the free version: for Members the armor and weapons are different.</p>
    </details>
  );
}
