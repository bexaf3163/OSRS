import { useBankNotice } from '../state/hooks/useBankNotice';
import { Icon } from '../ledger';

/** Advisory only: never takes over the current objective or arrow. */
export function BankNotice() {
  const notice = useBankNotice();
  if (!notice.show) return null;
  return <div className="plaque la-notice" role="status" aria-label="Bank reminder">
    <div className="la-shield" aria-hidden="true"><Icon name="bag" size={24} strokeWidth={1.4} /></div>
    <div className="la-notice-text"><b>Bank not read this login</b>Open any bank when convenient to check your supplies.</div>
    <button type="button" className="btn btn-sm" onClick={notice.dismiss}>Dismiss bank reminder</button>
  </div>;
}
