// "💰 How to make up the money": money-making methods from the wiki for the player's levels, on steps where money is needed (moneyGoal, magicPlan).
// The revenue is the wiki's estimate at exchange prices on the snapshot date and with good play: lower for a beginner. If the levels are unknown, we mark "?".

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { nameKey } from '../lib/checklist';
import { formatGp } from '../lib/shopping';
import { wealthOf } from '../lib/wealth';
import { adviseMoney, hoursToCover, MONEY, reqText, type MethodView } from '../lib/moneyAdvisor';

const SHOWN = 5;
const INVEST_SHOWN = 3;
const SOON_SHOWN = 3;

const hoursText = (h: number): string => (h < 1 ? `≈ ${Math.max(5, Math.round(h * 60 / 5) * 5)} min` : `≈ ${h < 10 ? h.toFixed(1) : Math.round(h)} h`);

export function MoneyPlan({ step }: { step: Step }) {
  const { progress, steps } = useStore();
  const { stats, gear, questsDone: gameQuests } = useBridge();
  if (!step.moneyGoal && !step.magicPlan) return null;

  const levels = { ...progress.levels, ...(stats ?? {}) };
  const done = new Set<string>([
    ...steps.filter((s) => s.type === 'quest' && progress.steps[s.id] === 'done').map((s) => nameKey(s.title)),
    ...(gameQuests ?? []).map(nameKey),
  ]);
  const w = wealthOf(gear);
  const cash = w ? (w.cash.total ?? w.cash.bag ?? null) : null;
  const advice = adviseMoney(levels, steps, done, undefined, cash);
  const missing = step.moneyGoal && cash !== null ? Math.max(0, step.moneyGoal - cash) : null;
  const known = Object.keys(levels).length > 0;
  const top = advice.free.slice(0, SHOWN);
  const invest = advice.invest.slice(0, INVEST_SHOWN);
  const soon = advice.soon.slice(0, SOON_SHOWN);

  const row = (v: MethodView, soonRow = false) => {
    const hours = missing ? hoursToCover(missing, v.method.profit) : null;
    return (
      <li key={v.method.id} className="money-method">
        <p>
          <a href={v.method.url} target="_blank" rel="noopener noreferrer"><strong>{v.method.title}</strong></a>
          <span className="muted small"> · ≈ {formatGp(v.method.profit)} gp/h · {intensityLabel(v.method.intensity)}</span>
          {hours !== null && !soonRow && <span className="small"> · {formatGp(missing!)} missing — {hoursText(hours)}</span>}
        </p>
        <p className="muted small">
          {soonRow
            ? <>Missing: {v.missing.map((m) => `${reqText(m.req)} (you have ${m.have})`).join(', ')}. </>
            : v.unknown.length ? <>Needs: {v.unknown.map((u) => reqText(u.req)).join(', ')} — the level is unknown (?). </> : null}
          {!soonRow && v.method.skills.some((s) => s.required) && !v.unknown.length ? <>Needs: {v.method.skills.filter((s) => s.required).map((s) => reqText(s)).join(', ')} — you have it. </> : null}
          {v.advice.length > 0 && <>Recommended: {v.advice.map((a) => `${reqText(a.req)} (you have ${a.have})`).join(', ')}. </>}
          {v.method.skillsNote && <>Per the wiki: {v.method.skillsNote}. </>}
          {v.method.quests && <>Quests: {v.method.quests}. </>}
          {v.cost === 'invest' && <>Investment: {v.method.capital ? `from ${formatGp(v.method.capital)} gp` : ''}{v.method.capital && v.method.inputs?.length ? '; ' : ''}{v.method.inputs?.length ? `you buy ${v.method.inputs.slice(0, 3).join(', ')}` : ''}. </>}
        </p>
      </li>
    );
  };

  return (
    <details className="step-section money-plan" open={missing !== null && missing > 0}>
      <summary><strong>💰 How to make up the money</strong>{missing !== null && missing > 0 && <span className="muted small"> — {formatGp(missing)} gp missing</span>}</summary>
      {!known && <p className="muted small">The levels are unknown: start RuneLite with the bridge or enter them on the "Skills" page — then I will hide what is not yet available to you.</p>}
      {top.length === 0
        ? <p className="small">No methods without investment were found for your levels — check the levels on the "Skills" page.</p>
        : <ul className="money-list">{top.map((v) => row(v))}</ul>}
      {invest.length > 0 && (
        <>
          <h5 className="subhead">If you have something to invest{cash !== null ? ` (you have ${formatGp(cash)} gp)` : ''}</h5>
          <ul className="money-list">{invest.map((v) => row(v))}</ul>
        </>
      )}
      {soon.length > 0 && (
        <>
          <h5 className="subhead">Opening soon</h5>
          <ul className="money-list">{soon.map((v) => row(v, true))}</ul>
        </>
      )}
      <p className="muted small">
        The revenue is an OSRS Wiki estimate at exchange prices on {MONEY.generatedAt} with good play: lower for a beginner, prices change. Some methods
        need an investment or a stock of items — read the method's article. Here is only what the game and the wiki confirm for the free version.
      </p>
    </details>
  );
}

function intensityLabel(s: string): string {
  const k = s.toLowerCase();
  return k === 'low' ? 'relaxed' : k === 'moderate' ? 'moderate load' : k === 'high' ? 'many clicks' : s;
}
