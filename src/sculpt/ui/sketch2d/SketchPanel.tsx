// The sketch's card, docked like the stage's card: how the sketch becomes a
// body (Extrude | Revolve), then what fits the moment: the tool's help and
// options while drawing, or the selection's position, size, corners, lines and
// actions; Cancel and Finish stay at the bottom.
import { useEffect, useState } from 'react';
import { useStore, useT } from '../../../store/store';
import type { MsgKey } from '../../../i18n';
import type { SketchGraph } from '../../../model/types';
import { NumField, Segmented } from '../../../ui/NumField';
import { Icon } from '../../../ui/icons';
import { bounds, selPts, type SkSel } from '../../../sketch/model';
import { align, curveThrough, mirror, movePts, setCons, setCorner, setLength, setLock, setSegKind, setSmooth, type AlignMode } from '../../../sketch/ops';
import { copySel, deleteSel, outlinesIn, pasteClip, pasteOffset, scaleSelection, typedSize } from '../../../sketch/select';
import { segLength } from '../../../sketch/dims';
import { sketchState } from '../../../sketch/regions';
import { setHandle } from '../../../sketch/tools';
import { finishBlock } from '../../session';
import { cancelSketchAsked } from '../../../ui/SketchTopBar';
import { sketchPick } from './useSketchPointer';
import { sketchHandlers } from '../commands';

const st = () => useStore.getState();
const edit = (fn: (sk: SketchGraph) => unknown) => st().sketchEdit((x) => fn(x as SketchGraph));
const DRAWING = new Set(['line', 'arc', 'bezier', 'smooth']);

/** What is selected, in words: "1 point", "2 lines", "Outline". */
function selTitle(t: ReturnType<typeof useT>, sk: SketchGraph, sel: SkSel, ids: string[]): string {
  if (sel.handle) return t('sketch.sel.handle');
  if (sel.pts.length && !sel.segs.length) return sel.pts.length === 1 ? t('sketch.sel.point') : t('sketch.sel.points', { n: sel.pts.length });
  if (sel.segs.length && !sel.pts.length) return sel.segs.length === 1 ? t(sk.segs[sel.segs[0]]?.k === 'line' ? 'sketch.sel.line' : 'sketch.sel.curve') : t('sketch.sel.lines', { n: sel.segs.length });
  return t('sketch.sel.points', { n: ids.length });
}

function Selection() {
  const t = useT();
  const k = useStore((s) => s.sketch)!;
  const keep = useStore((s) => !!s.viewPrefs.keepRatio);
  const radius = useStore((s) => s.sculptRadius);
  const [r, setR] = useState(radius || 5);
  const [ch, setCh] = useState(3);
  const [note, setNote] = useState<string | null>(null);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  useEffect(() => {
    if (!note) return;
    const tm = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(tm);
  }, [note]);
  const sk = k.draft;
  const sel = k.sel;
  const ids = selPts(sk, sel);
  const mm = t('unit.mm');
  const b = bounds(sk, ids);
  if (!b) return null;
  const onePt = sel.pts.length === 1 && !sel.segs.length ? sel.pts[0] : null;
  const segs = sel.segs.length ? sel.segs : sk.order.filter((g) => ids.includes(sk.segs[g].a) && ids.includes(sk.segs[g].b));
  const oneLine = sel.segs.length === 1 && !sel.pts.length && sk.segs[sel.segs[0]]?.k === 'line' ? sel.segs[0] : null;
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
  // corners: sharp, rounded or cut, read from the selected points
  const cornerOf = (id: string) => (sk.pts[id]?.r ? 'round' : sk.pts[id]?.ch ? 'cut' : 'sharp');
  const kinds = new Set(ids.map(cornerOf));
  const cornerKind = kinds.size === 1 ? [...kinds][0] : '';
  const curR = ids.map((id) => sk.pts[id]?.r).find((v) => v) ?? r;
  const curCh = ids.map((id) => sk.pts[id]?.ch).find((v) => v) ?? ch;
  const corner = (v: { r: number } | { ch: number } | null) => {
    let skipped = 0;
    edit((x) => void (skipped = setCorner(x, ids, v)));
    if (skipped) setNote(t('sketch.bar.skipped', { n: skipped }));
  };
  const segKinds = new Set(segs.map((g) => (sk.segs[g]?.k === 'line' ? 'line' : 'bez')));
  const segKind = segKinds.size === 1 ? [...segKinds][0] : '';
  const allCons = segs.length > 0 && segs.every((g) => sk.segs[g]?.cons);
  const curvy = sk.order.some((g) => sk.segs[g].k === 'bez' && (ids.includes(sk.segs[g].a) || ids.includes(sk.segs[g].b)));
  const allSmooth = ids.length > 0 && ids.every((id) => sk.pts[id]?.smooth);
  const handle = sel.handle && sk.segs[sel.handle.seg]?.k === 'bez' ? sel.handle : null;
  const hv = handle ? (() => {
    const s = sk.segs[handle.seg];
    return s.k === 'bez' ? (handle.end === 'a' ? s.ha : s.hb) : null;
  })() : null;
  const mid = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
  const W = b.max.x - b.min.x, H = b.max.y - b.min.y;
  const sized = ids.length >= 2 && !oneLine;
  const showW = sized && W > 0.000001, showH = sized && H > 0.000001;
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
  const act = (key: MsgKey, icon: string, onClick: () => void, testId: string, on?: boolean, danger?: boolean) => (
    <button className={`ghost icon-btn ${on ? 'on' : ''} ${danger ? 'danger' : ''}`} onClick={onClick} title={t(key)} aria-label={t(key)} aria-pressed={on} data-testid={testId}>
      <Icon name={icon} />
    </button>
  );
  return (
    <div className="subsection" data-testid="sketch-bar" onKeyDown={(e) => e.stopPropagation()}>
      <div className="card-head sk-sel-head">
        <h4>{selTitle(t, sk, sel as SkSel, ids)}</h4>
        <span className="sk-actions">
          <span style={{ position: 'relative' }}>
            {act('sketch.bar.mirror', 'mirror', () => setMirrorOpen((o) => !o), 'sk-mirror', mirrorOpen)}
            {mirrorOpen && (
              <span className="menu" role="menu" style={{ position: 'absolute', top: '100%', insetInlineEnd: 0 }}>
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
          {act('sketch.bar.duplicate', 'copy', () => duplicateSketchSel(), 'sk-duplicate')}
          {act(locked ? 'sketch.bar.unlock' : 'sketch.bar.lock', 'lock', () => edit((x) => void setLock(x, ids, !locked)), 'sk-lock', locked)}
          {act('sketch.bar.delete', 'trash', () => edit((x) => void deleteSel(x, sel as SkSel)), 'sk-delete', false, true)}
        </span>
      </div>
      {note && (
        <p className="note warn" role="status" data-testid="sk-note">
          {note}
        </p>
      )}
      {handle && hv ? (
        <div className="field-grid">
          <NumField label={t('sketch.bar.handleX')} value={hv.x} unit={mm} onCommit={(v) => edit((x) => setHandle(x, handle.seg, handle.end, { x: v, y: hv.y }))} testId="sk-handle-x" />
          <NumField label={t('sketch.bar.handleY')} value={hv.y} unit={mm} onCommit={(v) => edit((x) => setHandle(x, handle.seg, handle.end, { x: hv.x, y: v }))} testId="sk-handle-y" />
        </div>
      ) : (
        <>
          <div className="field-grid">
            {oneLine && <NumField label={t('sketch.typed.len')} value={segLength(sk, oneLine)} unit={mm} min={0.1} onCommit={(v) => edit((x) => report(setLength(x, oneLine, v, { fixed: sk.segs[oneLine].a })))} testId="sk-length" />}
            <NumField label={t(onePt ? 'sketch.bar.x' : 'sketch.bar.cx')} value={onePt ? sk.pts[onePt].x : mid.x} unit={mm} onCommit={(v) => moveTo('x', v)} testId="sk-x" />
            <NumField label={t(onePt ? 'sketch.bar.y' : 'sketch.bar.cy')} value={onePt ? sk.pts[onePt].y : mid.y} unit={mm} onCommit={(v) => moveTo('y', v)} testId="sk-y" />
            {showW && <NumField label={t('sculpt.width')} value={W} unit={mm} min={0.1} onCommit={(v) => size('w', v)} testId="sk-w" />}
            {showH && <NumField label={t('sculpt.height')} value={H} unit={mm} min={0.1} onCommit={(v) => size('h', v)} testId="sk-h" />}
          </div>
          {ids.length >= 2 && !oneLine && (
            <label className="check">
              <input type="checkbox" checked={keep} onChange={(e) => st().setPrefs({ keepRatio: e.target.checked })} data-testid="sk-keep-ratio" /> {t('scale.keepRatio')}
            </label>
          )}
        </>
      )}
      {outlines.length >= 2 && (
        <div className="field">
          <span className="label">{t('sketch.bar.align')}</span>
          <span className="sk-actions">
            {(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as AlignMode[]).map((m) => (
              <button key={m} className="icon-btn ghost" onClick={() => edit((x) => report(align(x, outlines, m)))} title={t(`align.${m}` as MsgKey)} aria-label={t(`align.${m}` as MsgKey)} data-testid={`sk-align-${m}`}>
                <Icon name={`align-${m}`} size={16} />
              </button>
            ))}
          </span>
        </div>
      )}
      {!handle && ids.length > 0 && (
        <>
          <Segmented
            label={t('sketch.corner')}
            value={cornerKind}
            options={[
              { value: 'sharp', label: t('sketch.corner.sharp'), testId: 'sk-corner-sharp' },
              { value: 'round', label: t('sketch.corner.round'), testId: 'sk-fillet' },
              { value: 'cut', label: t('sketch.corner.cut'), testId: 'sk-chamfer' },
            ]}
            onChange={(v) => corner(v === 'round' ? { r: curR } : v === 'cut' ? { ch: curCh } : null)}
          />
          {cornerKind === 'round' && <NumField label={t('sketch.corner.radius')} value={curR} unit={mm} min={0} onCommit={(v) => (setR(v), corner(v > 0 ? { r: v } : null))} testId="sk-fillet-r" />}
          {cornerKind === 'cut' && <NumField label={t('sketch.corner.size')} value={curCh} unit={mm} min={0} onCommit={(v) => (setCh(v), corner(v > 0 ? { ch: v } : null))} testId="sk-chamfer-v" />}
        </>
      )}
      {!handle && segs.length > 0 && (
        <>
          <Segmented
            label={t(segs.length === 1 ? 'sketch.lineKind' : 'sketch.lineKinds')}
            value={segKind}
            options={[
              { value: 'line', label: t('sketch.bar.straight'), testId: 'sk-straight' },
              { value: 'bez', label: t('sketch.bar.curve'), testId: 'sk-curve' },
            ]}
            onChange={(v) => edit((x) => void (v === 'line' ? (setSegKind(x, segs, 'line'), setSmooth(x, ids, false)) : setSegKind(x, segs, 'bez')))}
          />
          {curvy && (
            <label className="check">
              <input type="checkbox" checked={allSmooth} onChange={(e) => edit((x) => void setSmooth(x, ids, e.target.checked))} data-testid="sk-smooth" /> {t('sketch.smoothJoin')}
            </label>
          )}
          {ids.length >= 3 && segKind !== 'line' && (
            <button onClick={() => edit((x) => void curveThrough(x, sel.pts.length >= 3 ? sel.pts : ids))} data-testid="sk-curve-through">
              {t('sketch.bar.curveThrough')}
            </button>
          )}
          <label className="check" title={t('sketch.guideHelp')}>
            <input type="checkbox" checked={allCons} onChange={(e) => edit((x) => void setCons(x, segs, e.target.checked))} data-testid="sk-cons-set" /> {t('sketch.guide')}
          </label>
        </>
      )}
    </div>
  );
}

/** Nothing selected: what the tool does, and its options. */
function ToolHelp() {
  const t = useT();
  const k = useStore((s) => s.sketch)!;
  const tool = k.tool;
  const name = t(`sketch.tool.${tool}` as MsgKey);
  return (
    <div className="subsection" data-testid="sketch-tool-help">
      <h4>{name}</h4>
      <p className="note">{t(`sketch.hint.${tool}` as MsgKey)}</p>
      {DRAWING.has(tool) && (
        <label className="check" title={t('sketch.guideHelp')}>
          <input type="checkbox" checked={k.cons} onChange={(e) => st().setSketch({ cons: e.target.checked })} data-testid="sk-cons" /> {t('sketch.drawGuides')}
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={k.dims} onChange={(e) => st().setSketch({ dims: e.target.checked })} data-testid="sk-dims" /> {t('sketch.tool.dims')}
      </label>
    </div>
  );
}

export function SketchPanel() {
  const t = useT();
  const k = useStore((s) => s.sketch);
  const shape = useStore((s) => (s.sketch?.shapeId ? s.design.sculpt?.shapes[s.sketch.shapeId] : null));
  if (!k) return null;
  const state = sketchState(k.draft);
  const n = state.open.length;
  const block = finishBlock(k.draft, k.mode, shape);
  const status = block === 'crossesAxis' ? t('sketch.crossesAxis') : n === 1 ? t('sketch.oneOpenEnd') : n > 1 ? t('sketch.openEnds', { n }) : state.empty ? t('sketch.empty') : t('sketch.ready');
  const selected = k.tool === 'select' && (selPts(k.draft, k.sel).length > 0 || !!k.sel.handle);
  return (
    <div className="card-dock sk-card-dock">
      <aside className="card inspector sk-panel" aria-label={t('sketch.title')} dir="auto" data-testid="sketch-panel">
        <div className="card-head">
          <h3>{t('sketch.title')}</h3>
        </div>
        <Segmented
          label={t('sketch.mode')}
          value={k.mode}
          options={[
            { value: 'extrude', label: t('sketch.extrude'), testId: 'sketch-mode-extrude' },
            { value: 'revolve', label: t('sketch.revolve'), testId: 'sketch-mode-revolve' },
          ]}
          onChange={(m) => st().setSketch({ mode: m as 'extrude' | 'revolve' })}
          testId="sketch-mode"
        />
        {selected ? <Selection /> : <ToolHelp />}
        <div className="sk-foot">
          <p className={`sk-state ${block || n ? 'warn' : 'ok'}`} role="status" data-testid="sketch-status">
            <Icon name={block || n ? 'alert' : 'check'} size={14} /> {status}
          </p>
          <div className="row-buttons">
            <button onClick={() => cancelSketchAsked(t)} data-testid="sketch-cancel">
              {t('sketch.cancel')}
            </button>
            <button className="primary" onClick={() => st().finishSketch()} disabled={!!block} data-testid="sketch-finish">
              <Icon name="check" /> {t('sketch.finish')}
            </button>
          </div>
        </div>
      </aside>
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
