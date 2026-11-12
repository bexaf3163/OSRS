// New-account Grand Exchange limits: 10 quest points, total level 100 and 20 hours of play. The game shows the first two, never the hours, so
// once both are reached only the player can say the limits are lifted; until then selling the items new accounts cannot sell stays
// "not confirmed" in the earning methods (2.94.3: before, the app could store the answer but had no control for it).

import { useStore } from '../../state/store';
import { useTradeRestriction } from '../../state/hooks/useTradeRestriction';
import { restrictionSummary } from '../../domain/market/tradeRestriction';

export function TradeLimits() {
  const r = useTradeRestriction();
  const { setSellRestrictions } = useStore();
  if (r.by === 'player') {
    return (
      <p className="small muted trade-limits">
        New-account trade limits: you marked them {r.state === 'LIFTED' ? 'lifted' : 'still active'}.{' '}
        <button type="button" className="link-btn" onClick={() => setSellRestrictions(null)}>Undo</button>
      </p>
    );
  }
  // Only when the game's two numbers are reached and the hours are the one thing it cannot show: earlier the answer would mean nothing.
  if (r.state !== 'UNKNOWN' || r.unread.length !== 1) return null;
  return (
    <p className="small trade-limits">
      New-account trade limits: {restrictionSummary(r)}{' '}
      <button type="button" className="la-btn la-d" onClick={() => setSellRestrictions('lifted')}>My trade limits are lifted</button>
    </p>
  );
}
