// "🧳 What you need": the preparation plan for the step and the nearest three (lib/prepPlan.ts) — one decision, and this is the block that shows it. For each thing you see where it is (worn / in the bag / in the bank / missing / not checked), what to do with it
// (take, buy and from whom, earn, obtain), why it is needed, and whether the consumable is enough. The critical is separated from "meanwhile"
// and "later": not everything at once, not everything into the bag. What is unknown is not passed off as "missing". It buys nothing: the player decides.

import type { Step } from '../types';
import { useStore } from '../store';
import { isClosed } from '../lib/next-step';
import { useReadinessEngine, useRecovery } from '../readinessContext';
import { useFeatures } from '../lib/features';
import { styleOf } from '../lib/playStyle';
import { formatGp } from '../lib/shopping';
import { kgText } from '../lib/weight';
import { BAG_SLOTS, type PrepPlan, type PrepAction, type PrepLine, type PrepWhere, type Supply } from '../lib/prepPlan';
import { NavigateButton } from './NavigateButton';
import { useUpgradeRecommendation } from './UpgradePrompt';

const WHERE: Record<PrepWhere, { icon: string; text: string }> = {
  EQUIPPED: { icon: '🛡', text: 'worn' },
  INVENTORY: { icon: '✓', text: 'in the bag' },
  BANK: { icon: '🏦', text: 'in the bank' },
  MISSING: { icon: '✗', text: 'missing' },
  UNKNOWN: { icon: '?', text: 'not checked' },
};
const SUPPLY: Record<Supply, string> = { ENOUGH: 'enough', LOW: 'low', CRITICAL: 'very low' };

const countOf = (l: PrepLine) => (l.count > 1 ? ` ×${l.count}${l.exact ? '' : '+'}` : '');

function Action({ a }: { a: PrepAction }) {
  return (
    <span className="prep-action">
      {a.label}
      {a.nav && <> <NavigateButton target={a.nav} label="🧭" compact /></>}
      {!a.nav && a.href && <> <a href={a.href}>→</a></>}
    </span>
  );
}

function Row({ l, showWhy = true }: { l: PrepLine; showWhy?: boolean }) {
  const w = WHERE[l.where];
  return (
    <li className={`prep-line is-${l.where.toLowerCase()} p-${l.priority.toLowerCase()}`}>
      <span className="prep-where" aria-hidden="true">{w.icon}</span>
      <strong>{l.name}{countOf(l)}</strong>
      <span className="muted"> — {w.text}</span>
      {l.supply && <span className={`prep-supply is-${l.supply.toLowerCase()}`}> · {SUPPLY[l.supply]}</span>}
      {l.action && l.where !== 'UNKNOWN' && <> · <Action a={l.action} /></>}
      {showWhy && l.why && <span className="prep-why muted small">{l.why}</span>}
    </li>
  );
}

/** The "not checked" lines in one line: they share the action — open the bank or connect RuneLite. */
function Unknown({ lines }: { lines: PrepLine[] }) {
  if (!lines.length) return null;
  const a = lines.find((l) => l.action)?.action;
  return (
    <li className="prep-line is-unknown">
      <span className="prep-where" aria-hidden="true">?</span>
      <strong>Not checked:</strong> {lines.map((l) => `${l.name}${countOf(l)}`).join(', ')}
      {a && <> · <Action a={a} /></>}
    </li>
  );
}

/** The recovery mode: what to do in order after death or a teleport in the middle of a step. */
export function RecoveryBanner({ step, rec }: { step: Step; rec: NonNullable<PrepPlan['recovery']> }) {
  const { dismiss } = useRecovery();
  const r = rec.recovery;
  const far = r.distance !== null ? ` (~${r.distance} tiles away)` : '';
  const head = r.reason === 'DEATH'
    ? `💀 You died${r.landedAt ? ' and respawned in Lumbridge' : ''} — step ${step.id} is left far behind${far}`
    : `🔁 You are in Lumbridge, and step ${step.id} is far${far}: it looks like a teleport in the middle of the step`;
  const back = r.target ? { label: `Step ${step.id}`, x: r.target.x, y: r.target.y, plane: r.target.plane, stepId: step.id } : null;
  return (
    <div className="prep-recovery" role="alert">
      <p className="readiness-head"><strong>Recovery mode</strong></p>
      <p className="small">{head}.</p>
      <ol className="small">
        {rec.steps.map((st) => <li key={st.label}><strong>{st.label}</strong>{st.detail && <span className="muted"> — {st.detail}</span>}</li>)}
      </ol>
      <p className="small prep-recovery-actions">
        {back && <NavigateButton target={back} label="🧭 Return to the step" />}
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>This is not a derailment — continue</button>
      </p>
    </div>
  );
}

function Section({ title, hint, lines }: { title: string; hint?: string; lines: PrepLine[] }) {
  if (!lines.length) return null;
  const known = lines.filter((l) => l.where !== 'UNKNOWN');
  const unknown = lines.filter((l) => l.where === 'UNKNOWN');
  return (
    <>
      <p className="small prep-title"><strong>{title}</strong>{hint && <span className="muted"> — {hint}</span>}</p>
      <ul className="small">
        {known.map((l) => <Row key={l.key} l={l} />)}
        <Unknown lines={unknown} />
      </ul>
    </>
  );
}

/** inStatus — the recovery mode is already shown above, in the step status (Zen): we do not repeat it here. */
export function OneTripCard({ step, inStatus = false }: { step: Step; inStatus?: boolean }) {
  const { progress } = useStore();
  const profile = styleOf(useFeatures());
  const upgrade = useUpgradeRecommendation(step);
  const plan = useReadinessEngine().plan(step, { ahead: profile.lookAhead, upgrade });
  if (isClosed(progress, step.id)) return null;
  const { score, slots } = plan;
  const nothing = !plan.recovery && !plan.lines.length && !plan.coins.need && !plan.optimizations.length && !plan.blockers.length && !plan.weight.items.length;
  if (nothing) return null;
  const pending = plan.now.length + plan.soon.length + plan.byTheWay.length;
  const coinsShort = plan.coins.missing !== null && plan.coins.missing > 0;
  const quiet = score.verdict === 'READY' && !pending && !coinsShort && slots.over === 0 && plan.weight.level !== 'HEAVY' && !plan.recovery;
  const unknownCoins = plan.coins.need > 0 && plan.coins.have === null;
  return (
    <section className="one-trip" aria-label="What you need">
      <p className="readiness-head">
        🧳 <strong>What you need</strong>
        <span className="muted"> — for {plan.stepIds.length} {plan.stepIds.length === 1 ? 'step' : 'steps'} ahead</span>
        {score.percent !== null && <span className={`prep-score is-${score.verdict.toLowerCase()}`}> · ready {score.percent}%</span>}
      </p>
      {(score.critical > 0 || score.important > 0 || score.optimizations > 0 || score.unknown > 0) && (
        <p className="small prep-chips">
          {score.critical > 0 && <span className="prep-chip is-critical">🔴 critical: {score.critical}</span>}
          {score.important > 0 && <span className="prep-chip is-important">🟡 important: {score.important}</span>}
          {score.optimizations > 0 && <span className="prep-chip is-opt">⚡ improvements: {score.optimizations}</span>}
          {score.unknown > 0 && <span className="prep-chip is-unknown">? not checked: {score.unknown}</span>}
        </p>
      )}
      {plan.recovery && !inStatus && <RecoveryBanner step={step} rec={plan.recovery} />}
      {quiet && <p className="small">🟢 <strong>All ready</strong> — you can go.</p>}
      {plan.blockers.length > 0 && (
        <ul className="small">
          {plan.blockers.map((b) => <li key={b.label} className="prep-line is-missing p-critical"><span className="prep-where" aria-hidden="true">🔒</span><strong>{b.label}</strong>{b.detail && <span className="muted"> — {b.detail}</span>}</li>)}
        </ul>
      )}
      <Section title="🔴 Needed now" lines={plan.now} />
      <Section title="🟡 Meanwhile" hint="will be needed in the next steps" lines={plan.soon} />
      {plan.byTheWay.length > 0 && (
        <p className="small prep-title"><strong>⚪ Along the way:</strong> <span className="muted">{plan.byTheWay.map((l) => `${l.name}${countOf(l)}`).join(', ')} — no need to take them in advance</span></p>
      )}
      {(coinsShort || unknownCoins) && (
        <p className="small">
          💰 <strong>Coins for the steps:</strong>{' '}
          {coinsShort
            ? <>{formatGp(plan.coins.missing!)} gp of {formatGp(plan.coins.need)} missing{plan.coins.action?.href && <> · <a href={plan.coins.action.href}>how to make up →</a></>}</>
            : <span className="muted">{formatGp(plan.coins.need)} gp needed — I do not know yet how much you have</span>}
        </p>
      )}
      {slots.over > 0 && (
        <p className="notice small" role="note">
          ⚠️ <strong>It will not all fit at once:</strong> {slots.used} of {BAG_SLOTS} bag slots used, {slots.adding} more to take — {slots.over}{' '}
          {slots.over === 1 ? 'slot' : 'slots'} too many. Take what this step needs now, the rest later.
        </p>
      )}
      {plan.weight.items.length > 0 && (
        <div className={`prep-weight is-${plan.weight.level.toLowerCase()}`} role="note">
          <p className="small">
            ⚖️ <strong>{plan.weight.level === 'HEAVY' ? 'Leave the extra in the bank' : 'You can lighten the bag'}:</strong>{' '}
            {plan.weight.items.map((i) => `${i.name}${i.count > 1 ? ` ×${i.count}` : ''} (${kgText(i.kg)})`).join(', ')}.
          </p>
          <p className="small muted">
            A step without combat — the heavy stuff is not needed here.{' '}
            {plan.weight.current !== null && plan.weight.after !== null && plan.weight.ratio !== null
              ? <>Weight {kgText(plan.weight.current)} → {kgText(Math.max(0, plan.weight.after))}{plan.weight.ratio >= 1.05 ? <>: running will last ~{(Math.round(plan.weight.ratio * 10) / 10).toLocaleString('en-US')}x longer.</> : '.'}</>
              : <>It would shed {kgText(plan.weight.saving)}; the total weight from the game has not arrived yet.</>}
            {plan.weight.action && <> <span className="prep-action">{plan.weight.action.label}{plan.weight.action.nav && <> <NavigateButton target={plan.weight.action.nav} label="🧭" compact /></>}</span></>}
          </p>
        </div>
      )}
      {plan.have.length > 0 && (
        <details className="small">
          <summary className="muted">🟢 Already have: {plan.have.length}</summary>
          <ul>{plan.have.map((l) => <Row key={l.key} l={l} />)}</ul>
        </details>
      )}
      {profile.showLater && plan.later.length > 0 && (
        <details className="small">
          <summary className="muted">⏳ Do not take now — needed later: {plan.later.length}</summary>
          <ul>{plan.later.map((l) => <Row key={l.key} l={l} />)}</ul>
        </details>
      )}
      {plan.optimizations.length > 0 && (
        <details className="small" open={plan.optimizations.some((l) => l.key.startsWith('upgrade:'))}>
          <summary className="muted">⚡ Improvements: {plan.optimizations.length}</summary>
          <ul>{plan.optimizations.map((l) => <Row key={l.key} l={l} />)}</ul>
        </details>
      )}
      <p className="small"><a className="btn btn-ghost btn-sm" href="#/shopping">🛒 Open the shopping list</a></p>
    </section>
  );
}
