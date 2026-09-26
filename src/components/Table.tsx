import { Inline } from './Inline';

interface TableProps {
  head: string[];
  rows: string[][];
  /** Индекс подсвеченной строки. */
  highlight?: number;
  highlightLabel?: string;
  caption?: string;
  /** Первая колонка — моноширинный код (WC-1, S1-01). */
  codeColumn?: boolean;
}

export function Table({ head, rows, highlight, highlightLabel, caption, codeColumn }: TableProps) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption ?? head.join(', ')}>
      <table className="table">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col">{h ? <Inline text={h} /> : <span className="visually-hidden">Название</span>}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={r === highlight ? 'is-current' : undefined} aria-current={r === highlight ? 'true' : undefined}>
              {row.map((cell, c) => {
                const content = <>
                  {c === 0 && codeColumn ? <code className="code">{cell}</code> : <Inline text={cell} />}
                  {c === 0 && r === highlight && highlightLabel && <span className="row-badge">{highlightLabel}</span>}
                </>;
                return c === 0 ? <th key={c} scope="row">{content}</th> : <td key={c}>{content}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
