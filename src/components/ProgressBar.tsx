export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`bar-fill ${pct === 100 ? 'is-full' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
