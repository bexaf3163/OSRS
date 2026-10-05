import { useEffect, useId, useState } from 'react';
import { useStore } from '../store';
import { levelOf } from '../lib/progress';
import { MAX_LEVEL, MIN_LEVEL } from '../lib/xp';

interface Props {
  id: string;
  label: string;
  hideLabel?: boolean;
  compact?: boolean;
}

/** A skill level: a number with − and + buttons. Saved at once. */
export function LevelInput({ id, label, hideLabel, compact }: Props) {
  const { progress, setLevel } = useStore();
  const value = levelOf(progress, id);
  const [draft, setDraft] = useState(String(value));
  const inputId = useId();

  useEffect(() => setDraft(String(value)), [value]);

  const onChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 2);
    setDraft(clean);
    const n = Number(clean);
    if (clean && n >= MIN_LEVEL && n <= MAX_LEVEL) setLevel(id, n);
  };

  return (
    <div className={`level-input ${compact ? 'is-compact' : ''}`}>
      <label htmlFor={inputId} className={hideLabel ? 'visually-hidden' : 'level-label'}>{label}</label>
      <div className="stepper">
        <button type="button" className="stepper-btn" onClick={() => setLevel(id, value - 1)} disabled={value <= MIN_LEVEL}
          aria-label={`${label}: decrease`}>−</button>
        <input id={inputId} className="stepper-input" type="text" inputMode="numeric" pattern="[0-9]*"
          autoComplete="off" value={draft} onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()} onBlur={() => setDraft(String(value))} />
        <button type="button" className="stepper-btn" onClick={() => setLevel(id, value + 1)} disabled={value >= MAX_LEVEL}
          aria-label={`${label}: increase`}>+</button>
      </div>
    </div>
  );
}
