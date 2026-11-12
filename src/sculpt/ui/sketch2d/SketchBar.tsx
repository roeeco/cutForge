// The bar above the sketch for the current selection (SKETCH_OVERHAUL.md §8.3):
// where it is and how big, alignment, corners and curves, locks, construction,
// mirror, duplicate and delete.
import { useEffect, useState } from 'react';
import { useStore, useT } from '../../../store/store';
import type { MsgKey } from '../../../i18n';
import type { SketchGraph } from '../../../model/types';
import { NumField } from '../../../ui/NumField';
import { Icon } from '../../../ui/icons';
import { bounds, selPts, type SkSel } from '../../../sketch/model';
import { align, curveThrough, mirror, movePts, setCons, setCorner, setLock, setSegKind, setSmooth, type AlignMode } from '../../../sketch/ops';
import { copySel, deleteSel, outlinesIn, pasteClip, pasteOffset, scaleSelection, typedSize } from '../../../sketch/select';
import { setHandle } from '../../../sketch/tools';
import { sketchPick } from './useSketchPointer';
import { sketchHandlers } from '../commands';

const st = () => useStore.getState();
const edit = (fn: (sk: SketchGraph) => unknown) => st().sketchEdit((x) => fn(x as SketchGraph));

export function SketchBar() {
  const t = useT();
  const k = useStore((s) => s.sketch);
  const keep = useStore((s) => !!s.viewPrefs.keepRatio);
  const radius = useStore((s) => s.sculptRadius);
  const [r, setR] = useState(radius || 5);
  const [ch, setCh] = useState(3);
  const [note, setNote] = useState<string | null>(null);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  useEffect(() => {
    if (!note) return;
    const tm = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(tm);
  }, [note]);
  if (!k || k.tool !== 'select') return null;
  const sk = k.draft;
  const sel = k.sel;
  const ids = selPts(sk, sel);
  if (!ids.length && !sel.handle) return null;
  const mm = t('unit.mm');
  const b = bounds(sk, ids)!;
  const onePt = sel.pts.length === 1 && !sel.segs.length ? sel.pts[0] : null;
  const segs = sel.segs.length ? sel.segs : sk.order.filter((g) => ids.includes(sk.segs[g].a) && ids.includes(sk.segs[g].b));
  const outlines = outlinesIn(sk, sel);
  const locked = ids.some((p) => sk.pts[p]?.lock);
  const report = (ok: boolean | void) => ok === false && setNote(t('sketch.bar.locked'));
  const moveTo = (axis: 'x' | 'y', v: number) => {
    const cur = onePt ? sk.pts[onePt][axis] : (b.min[axis] + b.max[axis]) / 2;
    const d = v - cur;
    edit((x) => report(movePts(x, ids, axis === 'x' ? d : 0, axis === 'y' ? d : 0)));
  };
  const size = (axis: 'w' | 'h', v: number) => {
    const f = typedSize(b, axis, v, keep);
    edit((x) => report(scaleSelection(x, sel as SkSel, f)));
  };
  const corner = (v: { r: number } | { ch: number } | null) => {
    let skipped = 0;
    edit((x) => void (skipped = setCorner(x, ids, v)));
    if (skipped) setNote(t('sketch.bar.skipped', { n: skipped }));
  };
  const handle = sel.handle && sk.segs[sel.handle.seg]?.k === 'bez' ? sel.handle : null;
  const hv = handle ? (() => {
    const s = sk.segs[handle.seg];
    return s.k === 'bez' ? (handle.end === 'a' ? s.ha : s.hb) : null;
  })() : null;
  const mid = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
  const doMirror = (kind: 'lr' | 'tb' | 'line') => {
    setMirrorOpen(false);
    if (kind === 'line') {
      setNote(t('sketch.bar.pickLine'));
      sketchPick.onLine = (g) => {
        const s = st().sketch!;
        const line = s.draft.segs[g];
        const a = s.draft.pts[line.a], c = s.draft.pts[line.b];
        let made: SkSel | null = null;
        st().sketchEdit((x) => void (made = mirror(x as SketchGraph, s.sel, { a, b: c })));
        if (made) st().setSketch({ sel: made });
        setNote(null);
      };
      return;
    }
    const axis = kind === 'lr' ? { a: { x: b.max.x, y: 0 }, b: { x: b.max.x, y: 1 } } : { a: { x: 0, y: b.min.y }, b: { x: 1, y: b.min.y } };
    let made: SkSel | null = null;
    edit((x) => void (made = mirror(x, sel, axis)));
    if (made) st().setSketch({ sel: made });
  };
  const btn = (key: MsgKey, onClick: () => void, testId: string, icon?: string, on?: boolean) => (
    <button className={on ? 'on' : ''} onClick={onClick} title={t(key)} aria-label={t(key)} data-testid={testId}>
      {icon && <Icon name={icon} size={14} />} {t(key)}
    </button>
  );
  return (
    <div className="sk-bar" dir="auto" data-testid="sketch-bar" onKeyDown={(e) => e.stopPropagation()}>
      {handle && hv ? (
        <div className="grp">
          <NumField label={t('sketch.bar.handleX')} value={hv.x} unit={mm} onCommit={(v) => edit((x) => setHandle(x, handle.seg, handle.end, { x: v, y: hv.y }))} testId="sk-handle-x" />
          <NumField label={t('sketch.bar.handleY')} value={hv.y} unit={mm} onCommit={(v) => edit((x) => setHandle(x, handle.seg, handle.end, { x: hv.x, y: v }))} testId="sk-handle-y" />
        </div>
      ) : (
        <div className="grp">
          <NumField label={t('sketch.bar.x')} value={onePt ? sk.pts[onePt].x : mid.x} unit={mm} onCommit={(v) => moveTo('x', v)} testId="sk-x" />
          <NumField label={t('sketch.bar.y')} value={onePt ? sk.pts[onePt].y : mid.y} unit={mm} onCommit={(v) => moveTo('y', v)} testId="sk-y" />
          {ids.length >= 2 && (
            <>
              <NumField label={t('sketch.bar.w')} value={b.max.x - b.min.x} unit={mm} min={0.1} onCommit={(v) => size('w', v)} testId="sk-w" />
              <NumField label={t('sketch.bar.h')} value={b.max.y - b.min.y} unit={mm} min={0.1} onCommit={(v) => size('h', v)} testId="sk-h" />
              <label className="check">
                <input type="checkbox" checked={keep} onChange={(e) => st().setPrefs({ keepRatio: e.target.checked })} data-testid="sk-keep-ratio" /> {t('scale.keepRatio')}
              </label>
            </>
          )}
        </div>
      )}
      {outlines.length >= 2 && (
        <div className="grp" role="group" aria-label={t('sketch.bar.align')}>
          {(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as AlignMode[]).map((m) => (
            <button key={m} className="icon-btn ghost" onClick={() => edit((x) => report(align(x, outlines, m)))} title={t(`align.${m}` as MsgKey)} aria-label={t(`align.${m}` as MsgKey)} data-testid={`sk-align-${m}`}>
              <Icon name={`align-${m}`} size={16} />
            </button>
          ))}
        </div>
      )}
      {ids.length > 0 && (
        <div className="grp">
          {btn('sketch.bar.corner', () => edit((x) => void (setSmooth(x, ids, false), setSegKind(x, segs, 'line'))), 'sk-corner')}
          {btn('sketch.bar.smooth', () => edit((x) => void setSmooth(x, ids, true)), 'sk-smooth')}
          <NumField label={t('sketch.bar.r')} value={r} unit={mm} min={0} onCommit={setR} testId="sk-fillet-r" />
          {btn('sketch.bar.fillet', () => corner(r > 0 ? { r } : null), 'sk-fillet', 'curve')}
          <NumField label={t('sketch.bar.ch')} value={ch} unit={mm} min={0} onCommit={setCh} testId="sk-chamfer-v" />
          {btn('sketch.bar.chamfer', () => corner(ch > 0 ? { ch } : null), 'sk-chamfer')}
          {btn(locked ? 'sketch.bar.unlock' : 'sketch.bar.lock', () => edit((x) => void setLock(x, ids, !locked)), 'sk-lock', undefined, locked)}
        </div>
      )}
      {segs.length > 0 && (
        <div className="grp">
          {btn('sketch.bar.curve', () => edit((x) => void setSegKind(x, segs, 'bez')), 'sk-curve')}
          {btn('sketch.bar.straight', () => edit((x) => void setSegKind(x, segs, 'line')), 'sk-straight')}
          {segs.every((g) => sk.segs[g]?.cons) ? btn('sketch.bar.real', () => edit((x) => void setCons(x, segs, false)), 'sk-real') : btn('sketch.bar.cons', () => edit((x) => void setCons(x, segs, true)), 'sk-cons-set')}
          {ids.length >= 3 && btn('sketch.bar.curveThrough', () => edit((x) => void curveThrough(x, sel.pts.length >= 3 ? sel.pts : ids)), 'sk-curve-through')}
        </div>
      )}
      <div className="grp">
        <span style={{ position: 'relative' }}>
          {btn('sketch.bar.mirror', () => setMirrorOpen((o) => !o), 'sk-mirror')}
          {mirrorOpen && (
            <span className="menu" role="menu" style={{ position: 'absolute', top: '100%', insetInlineStart: 0 }}>
              <button role="menuitem" onClick={() => doMirror('lr')} data-testid="sk-mirror-lr">
                {t('sketch.bar.mirrorLR')}
              </button>
              <button role="menuitem" onClick={() => doMirror('tb')} data-testid="sk-mirror-tb">
                {t('sketch.bar.mirrorTB')}
              </button>
              <button role="menuitem" onClick={() => doMirror('line')} data-testid="sk-mirror-line">
                {t('sketch.bar.mirrorLine')}
              </button>
            </span>
          )}
        </span>
        {btn('sketch.bar.duplicate', () => duplicateSketchSel(), 'sk-duplicate', 'copy')}
        {btn('sketch.bar.delete', () => edit((x) => void deleteSel(x, sel as SkSel)), 'sk-delete', 'trash')}
      </div>
      {note && (
        <span className="note" role="status" data-testid="sk-note">
          {note}
        </span>
      )}
    </div>
  );
}

/** Duplicate the selection 10 mm away, on a spot where it touches nothing; the copy is selected. */
export function duplicateSketchSel() {
  const k = st().sketch;
  if (!k) return;
  const clip = copySel(k.draft, k.sel);
  if (!clip) return;
  const d = pasteOffset(k.draft, clip);
  let made: SkSel | null = null;
  st().sketchEdit((x) => void (made = pasteClip(x as SketchGraph, clip, d)));
  if (made) st().setSketch({ sel: made });
}

sketchHandlers.duplicate = duplicateSketchSel;
