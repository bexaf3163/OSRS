import { Component, type ReactNode } from 'react';

interface Props {
  /** Смена страницы сбрасывает ошибку: сломанный раздел не должен запирать остальные. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Ошибка одной страницы не гасит всё окно: шапка и вкладки остаются, прогресс не трогаем.
 * Без этого React снимает всё дерево, и программа становится белым листом.
 */
export class PageBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card page-error" role="alert">
        <h2 className="card-title">Эта страница не открылась</h2>
        <p>Прогресс сохранён отдельно и не пострадал. Попробуй открыть страницу заново или перейди в другой раздел.</p>
        <p className="muted small">{error.message}</p>
        <div className="page-error-actions">
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>Открыть заново</button>
          <a className="btn" href="#/">К пути</a>
        </div>
      </div>
    );
  }
}
