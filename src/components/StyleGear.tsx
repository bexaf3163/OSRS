// "🛡 What to wear for magic / ranged": the wiki's advice by slot for your levels and coins. Prices — the exchange; what is worn — from the game.

import { useEffect, useMemo, useState } from 'react';
import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { adviseStyle, QUEST_STEP, shoppingTotal, SLOT_LABEL, STYLE_GEAR, type PickStatus } from '../lib/styleGear';
import { getGePrice, getMapping } from '../services/pricesApi';

const STATUS: Record<PickStatus, string> = { worn: '✓ worn', bag: '✓ in the bag', buy: 'buy', save: 'save up', find: 'obtain', locked: 'locked for now' };

export function StyleGear({ step }: { step: Step }) {
  const { progress, steps } = useStore();
  const { stats, gear, questsDone } = useBridge();
  const [prices, setPrices] = useState<ReadonlyMap<string, number> | null>(null);
  const style = step.styleGear;

  useEffect(() => {
    if (!style) return undefined;
    let alive = true;
    const names = [...new Set(Object.values(STYLE_GEAR[style]).flatMap((opts) => opts.flatMap((o) => o.names)))];
    void getMapping().then(async (mapping) => {
      const ids = new Map([...mapping.values()].map((m) => [m.name, m.id] as const));
      const rows = await Promise.all(names.map(async (n) => [n, ids.has(n) ? (await getGePrice(ids.get(n)!))?.buyPrice : undefined] as const));
      if (alive) setPrices(new Map(rows.filter((r): r is readonly [string, number] => typeof r[1] === 'number')));
    }).catch(() => { if (alive) setPrices(new Map()); });
    return () => { alive = false; };
  }, [style]);

  const picks = useMemo(() => {
    if (!style || !prices) return null;
    const w = wealthOf(gear);
    const done = new Set<string>([
      ...steps.filter((s) => s.type === 'quest' && progress.steps[s.id] === 'done').map((s) => s.title),
      ...(questsDone ?? []),
      ...Object.entries(QUEST_STEP).filter(([, id]) => progress.steps[id] === 'done').map(([q]) => q),
    ]);
    return adviseStyle({
      style, levels: { ...progress.levels, ...(stats ?? {}) }, quests: done,
      worn: new Set((gear?.equipment ?? []).map((i) => i.name)), bag: new Set((gear?.inventory ?? []).map((i) => i.name)),
      cash: w ? (w.cash.total ?? w.cash.bag ?? null) : null, price: (n) => prices.get(n) ?? null,
    });
  }, [style, prices, progress, steps, stats, gear, questsDone]);

  if (!style) return null;
  const total = picks ? shoppingTotal(picks) : 0;
  return (
    <details className="step-section style-gear">
      <summary><strong>🛡 What to wear {style === 'magic' ? 'for magic' : 'for ranged'}</strong>{total > 0 && <span className="muted small"> — still to buy ≈ {formatGp(total)} gp</span>}</summary>
      {!picks
        ? <p className="muted small">Loading the exchange prices…</p>
        : (
          <ul className="style-list small">
            {picks.map((p) => (
              <li key={p.slot} className={`style-row is-${p.status}`}>
                <strong>{SLOT_LABEL[p.slot]}:</strong> {p.name ?? 'nothing yet'} <span className="muted">· {STATUS[p.status]}{p.price ? ` ≈ ${formatGp(p.price)} gp` : ''}</span>
                {p.note && <span className="muted"> — {p.note}</span>}
                {p.better && <span className="muted"> · better: {p.better.name} ({p.better.why})</span>}
              </li>
            ))}
          </ul>
        )}
      <p className="muted small">OSRS Wiki recommendations ({STYLE_GEAR.generatedAt}), prices — the exchange now. This is a list for the free version: for Members the armor and weapons are different.</p>
    </details>
  );
}
