// «💰 Как добрать деньги»: способы заработка из вики под уровни игрока, у шагов, где деньги нужны (moneyGoal, magicPlan).
// Выручка — оценка вики по ценам биржи на дату снимка и при хорошей игре: у новичка ниже. Уровни не знаем — помечаем «?».

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

const hoursText = (h: number): string => (h < 1 ? `≈ ${Math.max(5, Math.round(h * 60 / 5) * 5)} мин` : `≈ ${h < 10 ? h.toFixed(1).replace('.', ',') : Math.round(h)} ч`);

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
          <span className="muted small"> · ≈ {formatGp(v.method.profit)} gp/ч · {intensityRu(v.method.intensity)}</span>
          {hours !== null && !soonRow && <span className="small"> · не хватает {formatGp(missing!)} — {hoursText(hours)}</span>}
        </p>
        <p className="muted small">
          {soonRow
            ? <>Не хватает: {v.missing.map((m) => `${reqText(m.req)} (у тебя ${m.have})`).join(', ')}. </>
            : v.unknown.length ? <>Нужно: {v.unknown.map((u) => reqText(u.req)).join(', ')} — уровень неизвестен (?). </> : null}
          {!soonRow && v.method.skills.some((s) => s.required) && !v.unknown.length ? <>Нужно: {v.method.skills.filter((s) => s.required).map((s) => reqText(s)).join(', ')} — есть. </> : null}
          {v.advice.length > 0 && <>Советуют: {v.advice.map((a) => `${reqText(a.req)} (у тебя ${a.have})`).join(', ')}. </>}
          {v.method.skillsNote && <>По вики: {v.method.skillsNote}. </>}
          {v.method.quests && <>Квесты: {v.method.quests}. </>}
          {v.cost === 'invest' && <>Вложения: {v.method.capital ? `от ${formatGp(v.method.capital)} gp` : ''}{v.method.capital && v.method.inputs?.length ? '; ' : ''}{v.method.inputs?.length ? `покупаешь ${v.method.inputs.slice(0, 3).join(', ')}` : ''}. </>}
        </p>
      </li>
    );
  };

  return (
    <details className="step-section money-plan" open={missing !== null && missing > 0}>
      <summary><strong>💰 Как добрать деньги</strong>{missing !== null && missing > 0 && <span className="muted small"> — не хватает {formatGp(missing)} gp</span>}</summary>
      {!known && <p className="muted small">Уровни неизвестны: включи RuneLite с мостом или введи их на странице «Навыки» — тогда спрячу то, что тебе пока недоступно.</p>}
      {top.length === 0
        ? <p className="small">Без вложений под твои уровни способов не нашлось — проверь уровни на странице «Навыки».</p>
        : <ul className="money-list">{top.map((v) => row(v))}</ul>}
      {invest.length > 0 && (
        <>
          <h5 className="subhead">Если есть, во что вложить{cash !== null ? ` (у тебя ${formatGp(cash)} gp)` : ''}</h5>
          <ul className="money-list">{invest.map((v) => row(v))}</ul>
        </>
      )}
      {soon.length > 0 && (
        <>
          <h5 className="subhead">Откроются скоро</h5>
          <ul className="money-list">{soon.map((v) => row(v, true))}</ul>
        </>
      )}
      <p className="muted small">
        Выручка — оценка OSRS Wiki по ценам биржи на {MONEY.generatedAt} при хорошей игре: у новичка меньше, цены меняются. Некоторым способам
        нужны вложения или запас предметов — читай статью способа. Здесь только то, что игра и вики подтверждают для бесплатной версии.
      </p>
    </details>
  );
}

function intensityRu(s: string): string {
  const k = s.toLowerCase();
  return k === 'low' ? 'спокойно' : k === 'moderate' ? 'средняя нагрузка' : k === 'high' ? 'много кликов' : s;
}
