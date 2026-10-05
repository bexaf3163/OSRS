// The density switch: in the header — one icon button, in settings — labelled options.
//   🧘 Zen (default): the current step, one status line, the "Done" button and critical warnings.
//   🔍 Inspector: all the step card blocks are expanded — formulas, calculators, branches, dossiers, economy.
// The calculations and the game link work the same in both modes — only what reaches the screen changes.

import { setFeatures, useFeatures } from '../lib/features';

/** The header button: shows the current mode, a click switches it. */
export function DensityToggle() {
  const { inspector } = useFeatures();
  const next = inspector ? 'Zen' : 'Inspector';
  const label = `"${inspector ? 'Inspector' : 'Zen'}" mode — switch to "${next}"`;
  return (
    <button type="button" className="icon-btn icon-btn-emoji density-btn" aria-pressed={inspector} aria-label={label}
      title={`${label}. ${inspector ? 'All the step blocks are expanded now.' : 'Only the step, the status and "Done" now.'}`}
      onClick={() => setFeatures({ inspector: !inspector })}>
      <span aria-hidden="true">{inspector ? '🔍' : '🧘'}</span>
    </button>
  );
}

/** A labelled switch for settings. */
export function DensityPills() {
  const { inspector } = useFeatures();
  return (
    <div className="mode-toggle style-toggle" role="group" aria-label="Screen density">
      {([[false, '🧘', 'Zen'], [true, '🔍', 'Inspector']] as const).map(([value, icon, label]) => (
        <button key={label} type="button" className={`mode-btn ${inspector === value ? 'is-active' : ''}`} aria-pressed={inspector === value}
          onClick={() => setFeatures({ inspector: value })}>
          <span aria-hidden="true">{icon}</span> <span className="style-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
