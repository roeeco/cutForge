// The waffle's checks on its card (WAFFLE_MODE.md §6.4): each names the part;
// clicking selects its slice; a fix button where one exists.
import { useState } from 'react';
import { issueSelection, useStore, useT } from '../../store/store';
import type { Design } from '../../model/types';
import { validate } from '../../model/validate';
import { applyFix } from '../fixes';
import type { WaffleIssue } from '../checks';

export function WaffleChecks() {
  const t = useT();
  const d = useStore((s) => s.design);
  useStore((s) => s.sculpt.ready);
  const [none, setNone] = useState<string | null>(null);
  const issues = validate(d) as WaffleIssue[];
  return (
    <div className="subsection" data-testid="waffle-checks">
      <p className="kicker">{t('waffle.checks')}</p>
      {!issues.length ? (
        <p className="note" data-testid="waffle-ok">
          {t('waffle.allGood')}
        </p>
      ) : (
        <ul className="waffle-checks">
          {issues.map((i, n) => {
            const id = `${i.key}:${JSON.stringify(i.vars)}`;
            return (
              <li key={n} data-testid="waffle-issue">
                <button className="link" onClick={() => useStore.getState().select(issueSelection(i))}>
                  {t(i.key, i.vars)}
                </button>
                {i.fix && (
                  <button
                    className="inline-btn"
                    onClick={() => {
                      let ok = false;
                      useStore.getState().apply((x) => void (ok = applyFix(x as Design, i.fix!)));
                      setNone(ok ? null : id);
                    }}
                    data-testid={`fix-${i.fix.kind}`}
                  >
                    {t(i.fix.kind === 'addSlice' ? 'fix.addSlice' : i.fix.kind === 'nudge' ? 'fix.moveSlice' : 'fix.groupHole')}
                  </button>
                )}
                {none === id && <p className="note warn">{t('fix.none')}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
