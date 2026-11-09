// Quick build's Ready to cut badge and sheet meter (milestone 39): instead of
// the export check list, one green badge when nothing blocks cutting, or how
// many things to fix, each with one button that fixes it.
import { useDeferredValue, useMemo, useState } from 'react';
import { issueSelection, useStore, useT } from '../store/store';
import { validate, type Issue } from '../model/validate';
import { pack, pieceCopies, placedRect, sheetCount } from '../model/pack';
import { contourArea } from '../geom/vec';
import { profileOf } from '../model/materials';
import type { Design } from '../model/types';
import { blocking, canFix, fixIssue } from './fix';
import { setMode } from './mode';

/** Sheets the pieces take and how much of them they use (the working material's sheets, for the thumbnail). */
export function sheetUse(d: Design) {
  const copies = pieceCopies(d);
  const pl = pack(d, copies);
  const n = sheetCount(pl);
  let used = 0, total = 0;
  const seen = new Set<string>();
  for (const c of copies) {
    const p = pl[c.key];
    if (!p) continue;
    used += c.contours.filter((x) => x.role === 'outer').reduce((s, x) => s + Math.abs(contourArea(x.contour)), 0);
    const k = `${p.mat ?? ''}#${p.sheet}`;
    if (!seen.has(k)) {
      seen.add(k);
      const m = profileOf(d, p.mat);
      total += m.sheetW * m.sheetH;
    }
  }
  const first = copies.filter((c) => pl[c.key] && pl[c.key].sheet === 0 && !pl[c.key].mat).map((c) => placedRect(pl[c.key], c.w, c.h));
  return { sheets: Math.max(n, seen.size), pct: total ? Math.round((100 * used) / total) : 0, first, W: d.material.sheetW, H: d.material.sheetH };
}

export function ReadyBadge() {
  const t = useT();
  const live = useStore((s) => s.design);
  const d = useDeferredValue(live);
  const [open, setOpen] = useState(false);
  const issues = useMemo(() => (d.order.length ? validate(d) : []), [d]);
  const use = useMemo(() => (d.order.length ? sheetUse(d) : null), [d]);
  const blockers = issues.filter(blocking), notes = issues.filter((i) => !blocking(i));
  const ok = blockers.length === 0;
  const fix = (i: Issue) => useStore.getState().apply((x) => void fixIssue(x, i));
  const show = (i: Issue) => {
    useStore.getState().select(issueSelection(i));
    setOpen(false);
  };
  if (!d.order.length) return null;
  return (
    <div className="ready-wrap">
      <button className={`ready-badge ${ok ? 'ok' : 'warn'}`} aria-expanded={open} onClick={() => setOpen(!open)} data-testid="ready-badge" data-ok={ok} data-n={blockers.length}>
        {ok ? t('ready.ok') : blockers.length === 1 ? t('ready.one') : t('ready.many', { n: blockers.length })}
      </button>
      {use && (
        <span className="sheet-meter" title={t('sheet.title')} data-testid="sheet-meter" data-sheets={use.sheets} data-pct={use.pct}>
          <svg viewBox={`0 0 ${use.W} ${use.H}`} width={30} height={(30 * use.H) / use.W} aria-hidden>
            <rect x={0} y={0} width={use.W} height={use.H} className="sheet" />
            {use.first.map((r, i) => (
              <rect key={i} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} className="piece" />
            ))}
          </svg>
          <span className="meter-text">{use.sheets === 1 ? t('sheet.one', { pct: use.pct }) : t('sheet.many', { n: use.sheets, pct: use.pct })}</span>
        </span>
      )}
      {open && (
        <div className="ready-pop card" role="dialog" aria-label={t('ready.title')} data-testid="ready-pop">
          <h4>{t('ready.title')}</h4>
          {ok && <p className="note">{t('ready.allGood')}</p>}
          <ul>
            {blockers.map((i, k) => (
              <li key={k} data-testid="ready-issue" data-key={i.key}>
                <span dir="auto">{t(i.key, i.vars)}</span>
                <span className="row">
                  <button className="link" onClick={() => show(i)}>
                    {t('ready.show')}
                  </button>
                  {canFix(i) ? (
                    <button className="primary" onClick={() => fix(i)} data-testid="ready-fix">
                      {t('ready.fix')}
                    </button>
                  ) : (
                    <button onClick={() => (show(i), setMode('workshop'))} data-testid="ready-workshop">
                      {t('ready.noFix')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {notes.length > 0 && (
            <>
              <h4>{t('ready.notes')}</h4>
              <ul className="notes">
                {notes.map((i, k) => (
                  <li key={k} className="note" dir="auto">
                    {t(i.key, i.vars)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
