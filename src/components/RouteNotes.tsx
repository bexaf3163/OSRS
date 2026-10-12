// Two small cards that make the route model visible: what this step keeps for a later one, and the inventories of a quest's phases.

import type { Loadout, Step } from '../types';
import { useStore } from '../store';
import { usePlayerState } from '../playerStateContext';
import { carryoverOf, carryStatus, type CarryState } from '../lib/carryover';
import { isClosed } from '../lib/next-step';
import { daeroAdvice } from '../lib/daero';
import { useBridge } from '../bridge';
import { levelOf } from '../lib/playerState';

const MARK: Record<CarryState, string> = { OK: '✓', MISSING: '✗', UNKNOWN: '?' };
const WORD: Record<CarryState, string> = { OK: 'kept', MISSING: 'not kept yet', UNKNOWN: 'not checked' };

/**
 * "Keep for a later step". The game may say the step is done while the route is not ready to move on: the balls of wool for Prince Ali Rescue
 * are not in the bank yet. Shown while the step that needs the item is still ahead; an unchecked bank is "not checked", never "missing".
 */
export function CarryNote({ step }: { step: Step }) {
  const { progress } = useStore();
  const { state } = usePlayerState();
  const keep = carryoverOf(step).filter((c) => !isClosed(progress, c.forStep));
  if (!keep.length) return null;
  const status = carryStatus({ carryover: keep }, state);
  const open = status.filter((s) => s.state !== 'OK');
  return (
    <section className={`plaque carry-note ${open.some((s) => s.state === 'MISSING') ? 'plaque-warning' : ''}`} aria-label="Keep for a later step">
      <strong>Keep for later</strong>
      <ul className="small">
        {status.map((s) => (
          <li key={s.item.item}>
            <span aria-hidden="true">{MARK[s.state]}</span>{' '}
            {s.item.count > 1 ? `${s.item.count} × ` : ''}{s.item.item} — {s.item.where === 'bank' ? 'in the bank' : 'in the bag'} for <a href={`#/step/${s.item.forStep}`}>{s.item.forStep}</a>
            {' '}<span className="muted">({WORD[s.state]}) {s.item.why}</span>
          </li>
        ))}
      </ul>
      {open.length === 0 && <p className="muted small">The route is ready to move on.</p>}
    </section>
  );
}

function LoadoutRow({ l, index, current }: { l: Loadout; index: number; current: boolean }) {
  return (
    <li className={`loadout ${current ? 'is-current' : ''}`}>
      <h5 className="subhead">{index + 1}. {l.title}{current && <span className="badge"> next</span>}</h5>
      <p className="small"><strong>Take:</strong> {l.take.map((t) => `${typeof t.amount === 'number' && t.amount === 1 ? '' : `${t.amount} × `}${t.nameEn}${t.note ? ` (${t.note})` : ''}`).join(', ') || 'nothing special'}.</p>
      {l.leave?.length ? <p className="small"><strong>Leave in the bank:</strong> {l.leave.join(', ')}.</p> : null}
      {l.freeSlots ? <p className="small"><strong>Free slots:</strong> at least {l.freeSlots}.</p> : null}
      {l.note && <p className="muted small">{l.note}</p>}
    </li>
  );
}

/** Daero's training choice after Monkey Madness I: which pair fits the Attack the player has now (never silent). */
export function RewardChoice({ step }: { step: Step }) {
  const { state } = usePlayerState();
  const { xp } = useBridge();
  if (step.rewardChoice !== 'daero') return null;
  const a = daeroAdvice(levelOf(state, 'attack'), xp?.attack);
  const pair = a.pick === 'ATTACK_DEFENCE' ? 'Attack and Defence (35,000 XP each; Strength and Hitpoints get 20,000)' : 'Strength and Hitpoints (35,000 XP each; Attack and Defence get 20,000)';
  return (
    <section className="plaque plaque-tip daero-choice" aria-label="Daero's training choice">
      <strong>Daero's training: choose {pair}.</strong>
      <p className="small">{a.reason}</p>
      <p className="muted small">After the quest you speak to Daero and name two skills for the larger share. The Dragon scimitar needs 60 Attack.</p>
    </section>
  );
}

/** The quest's inventories in order, so one impossible all-purpose bag is never asked for. */
export function LoadoutsCard({ step }: { step: Step }) {
  if (!step.loadouts?.length) return null;
  return (
    <section className="step-section loadouts" aria-label="Inventory by phase">
      <h4 className="subhead">🎒 Inventory by phase</h4>
      <p className="muted small">This quest has stretches with different bags. Visit the bank between them.</p>
      <ol className="loadout-list">
        {step.loadouts.map((l, i) => <LoadoutRow key={l.id} l={l} index={i} current={i === 0} />)}
      </ol>
    </section>
  );
}
