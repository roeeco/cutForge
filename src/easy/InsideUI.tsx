// What goes inside (milestone 40): the box card's list of objects, and the
// mission card on the stage with its checklist and stars.
import { useDeferredValue, useMemo, useState } from 'react';
import { issueSelection, useStore, useT } from '../store/store';
import { NumField, Stepper } from '../ui/NumField';
import { fmtNum } from '../i18n';
import type { Content } from '../model/types';
import { newId } from '../model/ops';
import { OBJECTS, bestCell, boxBases, compartments, contentFit, objectById, sizeOf } from './objects';
import { missionState } from './missions';

/** The box card's *What goes inside*: add objects, how many, their own size, whether they fit. */
export function InsideSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  const isBox = useMemo(() => boxBases(d).includes(panelId), [d, panelId]);
  if (!isBox) return null;
  const mine = (d.contents ?? []).filter((c) => c.baseId === panelId);
  const edit = (id: string, patch: Partial<Content>) =>
    apply((x) => {
      const c = x.contents?.find((k) => k.id === id);
      if (c) Object.assign(c, patch);
    });
  const add = (object: string) =>
    apply((x) => {
      const o = objectById(object);
      const cells = compartments(x, panelId);
      const taken = cells.filter((k) => (x.contents ?? []).some((c) => c.baseId === panelId && c.x >= k.x0 && c.x <= k.x1 && c.y >= k.y0 && c.y <= k.y1));
      const cell = bestCell(x, panelId, o, 1, taken);
      if (!cell) return;
      (x.contents ??= []).push({ id: newId('o'), object, baseId: panelId, x: Math.round((cell.x0 + cell.x1) / 2), y: Math.round((cell.y0 + cell.y1) / 2), count: 1 });
    });
  const mm = t('unit.mm');
  return (
    <div className="subsection" data-testid="inside-section">
      <h4>{t('inside.title')}</h4>
      <ul className="inside-list">
        {mine.map((c) => {
          const fit = contentFit(d, c);
          const s = sizeOf(c);
          const need = [fit.need.w && t('inside.needW', { n: fmtNum(fit.need.w, 1) }), fit.need.d && t('inside.needD', { n: fmtNum(fit.need.d, 1) }), fit.need.h && t('inside.needH', { n: fmtNum(fit.need.h, 1) })].filter(Boolean).join(', ');
          return (
            <li key={c.id} data-testid="inside-item" data-object={c.object} data-ok={fit.ok}>
              <strong>{t(objectById(c.object).key)}</strong>
              <span className={fit.ok ? 'fit-ok' : 'fit-no'} data-testid="inside-fit">
                {fit.ok ? `✓ ${t('inside.fits')}` : fit.cell ? t('inside.needs', { what: need }) : t('inside.noCell')}
              </span>
              <Stepper label={t('inside.count')} value={c.count ?? 1} min={1} max={200} slider={false} onCommit={(v) => edit(c.id, { count: Math.round(v) })} testId="inside-count" />
              {c.object === 'custom' && (
                <>
                  <NumField label={t('insp.width')} value={s.w} unit={mm} min={1} onCommit={(v) => edit(c.id, { w: v })} />
                  <NumField label={t('tpl.depth')} value={s.d} unit={mm} min={1} onCommit={(v) => edit(c.id, { d: v })} />
                  <NumField label={t('insp.height')} value={s.h} unit={mm} min={1} onCommit={(v) => edit(c.id, { h: v })} />
                </>
              )}
              <button className="link" onClick={() => apply((x) => void (x.contents = x.contents?.filter((k) => k.id !== c.id)))}>
                {t('inside.remove')}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="obj-buttons">
        {OBJECTS.map((o) => (
          <button key={o.id} onClick={() => add(o.id)} data-testid={`inside-add-${o.id}`}>
            + {t(o.key)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The mission card on the stage: its goals, checked live; a goal selects what it is about. */
export function MissionPanel() {
  const t = useT();
  const live = useStore((s) => s.design);
  const d = useDeferredValue(live);
  const st = useMemo(() => missionState(d), [d]);
  const [open, setOpen] = useState(true);
  if (!st) return null;
  return (
    <aside className="card mission-panel" aria-label={t('mission.label')} data-testid="mission-panel" data-stars={st.stars} data-done={st.done}>
      <h4>
        <span>
          {t('mission.label')}: {t(st.mission.title)}
        </span>
        <span className="stars" title={t('mission.stars', { n: st.stars })} aria-label={t('mission.stars', { n: st.stars })}>
          {'★'.repeat(st.stars)}
          {'☆'.repeat(3 - st.stars)}
        </span>
      </h4>
      {open && (
        <ul>
          {st.goals.map((g) => (
            <li key={g.goal.id} className={g.ok ? 'ok' : ''} data-testid={`goal-${g.goal.id}`} data-ok={g.ok}>
              <button onClick={() => g.target && d.panels[g.target] && useStore.getState().select(issueSelection({ target: { kind: 'panel', id: g.target } }))}>
                <span className="mark">{g.ok ? '✓' : ''}</span>
                {t(g.goal.label, g.goal.vars)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {st.done && <p className="done">{t('mission.done')}</p>}
      <button className="link" onClick={() => setOpen(!open)}>
        {open ? t('mission.hide') : t('mission.show')}
      </button>
    </aside>
  );
}
