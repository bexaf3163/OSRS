// «⚡ Быстрый вариант для твоих статов»: телепорт, каноэ, срезка — если уровень позволяет.
// Уровни — из RuneLite, а без него — введённые вручную в «Навыках». Обычный путь шага остаётся как есть.

import type { Step } from '../types';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { conditionLabel, evaluateBranches, formatSaving, reasonLabel, type BranchResult } from '../lib/branching';
import { Inline } from './Inline';

export function BranchSuggestions({ step }: { step: Step }) {
  const { progress, steps } = useStore();
  const { stats, owned, enabled, branchChoice, chooseBranch } = useBridge();
  if (!step.branches?.length) return null;
  const results = evaluateBranches(step, { stats, owned, progress, steps });
  const available = results.filter((r) => r.status === 'available');
  const unknown = results.filter((r) => r.status === 'unknown');
  const locked = results.filter((r) => r.status === 'locked');
  const chosen = branchChoice[step.id];

  const card = (r: BranchResult, kind: 'available' | 'unknown') => {
    const { branch } = r;
    const isChosen = chosen === branch.id;
    return (
      <li key={branch.id} className={`branch is-${kind} ${isChosen ? 'is-chosen' : ''}`}>
        <p className="branch-head">
          <strong>⚡ {branch.label}</strong>
          <span className="muted small">
            {kind === 'available'
              ? ` · ${reasonLabel(r)}`
              : ` · нужно ${conditionLabel(branch.condition)}`}
          </span>
          {branch.timeSavingSeconds ? <span className="badge badge-qp">экономия {formatSaving(branch.timeSavingSeconds)}</span> : null}
        </p>
        {branch.replacementText && <p className="branch-text"><Inline text={branch.replacementText} /></p>}
        {r.missing?.length ? (
          <p className="branch-missing small" role="note">
            {r.missing.every((m) => m.certain)
              ? <>⚠ Не хватает: {r.missing.map((m) => `${m.label} (есть ${m.have} из ${m.need})`).join(', ')}. Возьми или купи, пока вариант не сработает.</>
              : <>⚠ В сумке не вижу: {r.missing.map((m) => `${m.label} (${m.have} из ${m.need})`).join(', ')}. Может лежать в банке — открой банк, и я проверю.</>}
          </p>
        ) : branch.needs?.length ? (
          <p className="muted small">Нужно с собой: {branch.needs.map((n) => `${n.label}${n.count > 1 ? ` ×${n.count}` : ''}`).join(', ')}.</p>
        ) : null}
        {kind === 'available' && enabled && branch.replacementTarget && !r.missing?.some((m) => m.certain) && (
          <button type="button" className={`btn btn-sm ${isChosen ? 'btn-ingame-active' : ''}`}
            onClick={() => chooseBranch(step, isChosen ? null : branch.id)} aria-pressed={isChosen}>
            {isChosen ? '✓ В игре ведёт этот вариант — вернуть обычный' : '🧭 Вести в игре этим путём'}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="step-section branches" aria-label="Быстрые варианты">
      <h4 className="subhead">⚡ {available.length ? 'Быстрый вариант для твоих статов' : 'Быстрые варианты'}</h4>
      {(available.length > 0 || unknown.length > 0) && (
        <ul className="branch-list">
          {available.map((r) => card(r, 'available'))}
          {unknown.map((r) => card(r, 'unknown'))}
        </ul>
      )}
      {unknown.length > 0 && (
        <p className="muted small">Уровень неизвестен: включи RuneLite с мостом или введи уровень на странице «Навыки».</p>
      )}
      {locked.length > 0 && (
        <ul className="branch-locked">
          {locked.map((r) => (
            <li key={r.branch.id} className="muted small">
              🔒 {r.branch.label} — нужно {conditionLabel(r.branch.condition)}
              {typeof r.have === 'number' && r.branch.condition.type === 'SKILL_LEVEL' ? `, у тебя ${r.have}` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Обычный путь ниже тоже работает — быстрый вариант его только сокращает.</p>
    </section>
  );
}
