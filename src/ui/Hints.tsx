import { useState } from 'react';
import { useT } from '../store/store';

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
  const [i, setI] = useState(0);
  if (dismissed) return null;
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
        <strong>{t('hint.title')}</strong>
        <span className="note">{t('hint.step', { n: i + 1, total: STEPS.length })}</span>
      </div>
      <p>{t(STEPS[i])}</p>
      <div className="hints-actions">
        <button disabled={i === 0} onClick={() => setI(i - 1)}>
          {t('hint.prev')}
        </button>
        {i < STEPS.length - 1 ? (
          <button onClick={() => setI(i + 1)}>{t('hint.next')}</button>
        ) : null}
        <button className="primary" onClick={close} data-testid="hints-dismiss">
          {t('hint.dismiss')}
        </button>
      </div>
    </div>
  );
}
