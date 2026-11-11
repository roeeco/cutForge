// The editor's safety net (BUGFIX_PLAN B4): a design that makes the stage or
// the inspector throw shows a recovery card instead of a blank app. Undo goes
// back one step; "Reload the last good version" restores the last design that
// was drawn and saved. The boundary clears itself as soon as the design changes.
import { Component, type ReactNode } from 'react';
import { useStore, useT } from '../store/store';
import type { Design } from '../model/types';
import { lastGoodDesign, markBad } from '../store/goodDesign';

type Props = { children: ReactNode };
type State = { failed: Design | null };

export class EditorBoundary extends Component<Props, State> {
  state: State = { failed: null };
  private unsub = () => {};
  static getDerivedStateFromError(): Partial<State> {
    return { failed: useStore.getState().design };
  }
  componentDidMount() {
    // the design changed (undo, reload, a new design): try drawing again
    this.unsub = useStore.subscribe((s) => {
      if (this.state.failed && s.design !== this.state.failed) this.setState({ failed: null });
    });
  }
  componentWillUnmount() {
    this.unsub();
  }
  componentDidCatch(e: unknown) {
    markBad(useStore.getState().design);
    console.error('CutForge: the editor could not draw this design', e);
  }
  render() {
    return this.state.failed ? <Recovery /> : this.props.children;
  }
}

function Recovery() {
  const t = useT();
  const canUndo = useStore((s) => s.past.length > 0);
  const good = lastGoodDesign();
  return (
    <div className="crash card" role="alert" data-testid="crash">
      <h2>{t('crash.title')}</h2>
      <p>{t('crash.body')}</p>
      <div className="crash-actions">
        <button className="primary" disabled={!canUndo} onClick={() => useStore.getState().undo()} data-testid="crash-undo">
          {t('crash.undo')}
        </button>
        <button disabled={!good} onClick={() => good && useStore.getState().replaceDesign(structuredClone(good), false)} data-testid="crash-reload">
          {t('crash.reload')}
        </button>
      </div>
    </div>
  );
}
