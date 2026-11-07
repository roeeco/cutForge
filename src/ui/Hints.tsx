import { useState } from 'react';
import { useStore, useT } from '../store/store';

const KEY = 'cutforge.hintsDismissed';
const STEPS = ['hint.1', 'hint.2', 'hint.3', 'hint.4'] as const;

export function Hints() {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  // a design that already has panels (a template) skips "draw your first panel"
  const first = useStore((s) => (s.design.order.length ? 1 : 0));
  const [i, setI] = useState(first);
  if (dismissed) return null;
  const steps = STEPS.slice(first);
  const k = i - first;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return (
    <div className="hints" role="note" data-testid="hints">
      <div className="hints-head">
        <span>{t('hint.title')}</span>
        <span>{t('hint.step', { n: k + 1, total: steps.length })}</span>
      </div>
      <p>{t(STEPS[i])}</p>
      <div className="hints-actions">
        <button className="link" onClick={close}>
          {t('hint.skip')}
        </button>
        {k > 0 && <button onClick={() => setI(i - 1)}>{t('hint.prev')}</button>}
        {k < steps.length - 1 ? <button onClick={() => setI(i + 1)}>{t('hint.next')}</button> : null}
        <button className="primary" onClick={close} data-testid="hints-dismiss">
          {t('hint.dismiss')}
        </button>
      </div>
    </div>
  );
}
