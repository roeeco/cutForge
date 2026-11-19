// Guided's short note on the stage (milestone 107): a size stopped at the sheet, a split refused, a lot that
// cannot fit. It goes after a few seconds.
import { useEffect } from 'react';
import { useStore, useT } from '../store/store';

export function GuidedNote() {
  const t = useT();
  const n = useStore((s) => s.guidedNote);
  useEffect(() => {
    if (!n) return;
    const h = setTimeout(() => useStore.getState().guidedNote?.at === n.at && useStore.setState({ guidedNote: null }), 4000);
    return () => clearTimeout(h);
  }, [n]);
  if (!n) return null;
  return (
    <div className="g-note card" role="status" data-testid="g-note" data-key={n.key}>
      {t(n.key, n.vars)}
    </div>
  );
}
