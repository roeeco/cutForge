// Editing an outline in the 2D view (milestone 104, DIELINE_DNA_PLAN.md D0b-2):
// the points of the shape, board or line being edited, `+` at each segment's
// middle, the selected point; the keys (Delete removes the point, Esc lets go
// of it, then of the outline); and a small card with the corner and line
// choices and a typed length. Each change is one undo step of the design.
import { useEffect, useState } from 'react';
import type { Vec2 } from '../geom/types';
import type { P2 } from '../model/types';
import { uiDir, useStore, useT } from '../store/store';
import { deletePoint, insertPoint, setCorners, setCurved, setSegmentLength, targetOf, type Edit2D } from '../sketch/edit2d';
import { segAt, segPoints } from '../sketch/flatten';
import { segLength } from '../sketch/dims';
import { NumField, Segmented } from '../ui/NumField';
import { fmtNum } from '../i18n';
import { panelLabel } from '../model/names';
import { shown, useFeature } from '../easy/features';

/** Distance from a point to a straight piece. */
export function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

type Placed = Parameters<(pl: never, panelId: string, p: Vec2) => Vec2>[0];

export function Edit2DLayer(props: { t: Edit2D; placed: unknown; toSvg: (pl: never, panelId: string, p: Vec2) => Vec2; px: number; onPoint: (ptId: string, ev: React.PointerEvent) => void }) {
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.sel2d);
  const { t, px } = props;
  const tg = targetOf(d, t);
  // the keys while an outline is edited: before the editor's own (a selected shape would be deleted otherwise)
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const st = useStore.getState();
      if (!st.edit2d) return;
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && st.sel2d && !st.sel2d.startsWith('seg:')) {
        ev.preventDefault();
        ev.stopPropagation();
        let ok = false;
        st.apply((x) => void (ok = deletePoint(x, st.edit2d!, st.sel2d!)));
        st.set({ sel2d: null, ...(ok ? {} : {}) });
      } else if (ev.key === 'Escape' || ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === 'Escape' && st.sel2d) st.set({ sel2d: null });
        else st.set({ edit2d: null, sel2d: null });
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  if (!tg) return null;
  const at = (q: P2) => props.toSvg(props.placed as never, t.panelId, tg.toBoard(q));
  return (
    <g className="edit2d" data-testid="edit2d-layer">
      {tg.g.order.map((id) => {
        const pts = segPoints(tg.g, id).map(at);
        const on = sel === `seg:${id}`;
        return (
          <polyline
            key={`s-${id}`}
            points={pts.map((q) => `${q.x},${q.y}`).join(' ')}
            className={`e2d-seg${on ? ' on' : ''}`}
            fill="none"
            strokeWidth={px * (on ? 3 : 1.8)}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              useStore.getState().set({ sel2d: `seg:${id}` });
            }}
            data-testid={`e2d-seg-${id}`}
          />
        );
      })}
      {!tg.wall &&
        tg.g.order.map((id) => {
          const m = at(segAt(tg.g, id, 0.5));
          const s = px * 7;
          return (
            <rect
              key={`m-${id}`}
              x={m.x - s / 2}
              y={m.y - s / 2}
              width={s}
              height={s}
              className="e2d-add"
              strokeWidth={px}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                const st = useStore.getState();
                let nid: string | null = null;
                st.apply((x) => void (nid = insertPoint(x, t, id)));
                if (nid) st.set({ sel2d: nid });
              }}
              data-testid={`e2d-add-${id}`}
            />
          );
        })}
      {Object.entries(tg.g.pts).map(([id, q]) => {
        const c = at(q);
        return (
          <circle
            key={`p-${id}`}
            cx={c.x}
            cy={c.y}
            r={px * (sel === id ? 6.5 : 5)}
            className={`e2d-pt${sel === id ? ' on' : ''}${q.lock ? ' locked' : ''}${q.r || q.ch ? ' corner' : ''}`}
            strokeWidth={px * 1.4}
            onPointerDown={q.lock ? undefined : (ev) => props.onPoint(id, ev)}
            data-testid={`e2d-pt-${id}`}
          />
        );
      })}
    </g>
  );
}

/** The card of the outline being edited: what it is, the selected point's corner or the selected line's kind and length. */
export function Edit2DCard({ t }: { t: Edit2D }) {
  const tr = useT();
  const allowed = shown(useFeature('edit2d'));
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.sel2d);
  const apply = useStore((s) => s.apply);
  const [note, setNote] = useState<string | null>(null);
  const tg = targetOf(d, t);
  if (!tg || !allowed) return null;
  const what = t.kind === 'shape' ? tr('edit2d.shape') : t.kind === 'line' ? tr('edit2d.line') : panelLabel(d, t.panelId, tr);
  const pt = sel && !sel.startsWith('seg:') ? tg.g.pts[sel] : null;
  const seg = sel?.startsWith('seg:') ? tg.g.segs[sel.slice(4)] : null;
  const segId = sel?.startsWith('seg:') ? sel.slice(4) : null;
  const corner = pt ? (pt.r ? 'round' : pt.ch ? 'cut' : 'sharp') : null;
  const size = pt?.r ?? pt?.ch ?? 5;
  return (
    <div className="subsection edit2d-card" dir={uiDir()} role="region" aria-label={tr('edit2d.title', { what })} data-testid="edit2d-section">
      <div className="card-head">
        <h4>{tr('edit2d.title', { what })}</h4>
        <button className="primary" onClick={() => useStore.getState().set({ edit2d: null, sel2d: null })} data-testid="edit2d-done">
          {tr('outline.done')}
        </button>
      </div>
      <p className="note">{tg.wall ? tr('edit2d.wallCorners') : tr('edit2d.hint')}</p>
      {pt && !tg.wall && (
        <>
          <Segmented
            label={tr('edit2d.corner')}
            value={corner!}
            options={(t.kind === 'board' ? (['sharp', 'round'] as const) : (['sharp', 'round', 'cut'] as const)).map((k) => ({ value: k, label: tr(`edit2d.corner.${k}`), testId: `edit2d-corner-${k}` }))}
            onChange={(k) => {
              let skipped = 0;
              apply((x) => void (skipped = setCorners(x, t, [sel!], k, size)));
              setNote(skipped ? tr('edit2d.notCorner') : null);
            }}
          />
          {corner !== 'sharp' && <NumField label={tr('edit2d.size')} value={size} unit={tr('unit.mm')} min={0.5} max={500} onCommit={(v) => apply((x) => void setCorners(x, t, [sel!], corner as 'round' | 'cut', v))} testId="edit2d-corner-size" />}
          <button onClick={() => apply((x) => void deletePoint(x, t, sel!))} data-testid="edit2d-delete">
            {tr('edit2d.deletePoint')}
          </button>
        </>
      )}
      {seg && segId && !tg.wall && (
        <>
          <Segmented
            label={tr('edit2d.lineKind')}
            value={seg.k === 'line' ? 'straight' : 'curved'}
            options={(['straight', 'curved'] as const).map((k) => ({ value: k, label: tr(`edit2d.lineKind.${k}`), testId: `edit2d-line-${k}` }))}
            onChange={(k) => apply((x) => void setCurved(x, t, [segId], k === 'curved'))}
          />
          {seg.k === 'line' && (
            <NumField label={tr('edit2d.length')} value={Number(fmtNum(segLength(tg.g, segId), 2))} unit={tr('unit.mm')} min={0.5} onCommit={(v) => apply((x) => void setSegmentLength(x, t, segId, v))} testId="edit2d-length" />
          )}
        </>
      )}
      {note && (
        <p className="note warn-text" data-testid="edit2d-note">
          {note}
        </p>
      )}
    </div>
  );
}

export type { Placed };
