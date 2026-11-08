import { useBankNotice } from '../state/hooks/useBankNotice';

/** Advisory only: never takes over the current objective or arrow. */
export function BankNotice() {
  const notice = useBankNotice();
  if (!notice.show) return null;
  return <div className="plaque small" role="status">
    Bank not refreshed this login. Open any bank when convenient to check your supplies.{' '}
    <button type="button" className="btn btn-sm" onClick={notice.dismiss}>Dismiss bank reminder</button>
  </div>;
}
