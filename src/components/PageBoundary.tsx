import { Component, type ReactNode } from 'react';

interface Props {
  /** A page change clears the error: a broken section must not lock the others. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * An error on one page does not take down the whole window: the header and tabs stay, the progress is untouched.
 * Without this React removes the whole tree, and the app becomes a white sheet.
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
        <h2 className="card-title">This page did not open</h2>
        <p>The progress is saved separately and is not harmed. Try opening the page again or go to another section.</p>
        <p className="muted small">{error.message}</p>
        <div className="page-error-actions">
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>Reopen</button>
          <a className="btn" href="#/">To the path</a>
        </div>
      </div>
    );
  }
}
