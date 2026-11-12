// The 2D sketch view (SKETCH_OVERHAUL.md §6.4): a flat sheet facing the sketch's
// plane, sketch y up. Layers from the bottom: the grid (and a revolve's axis),
// the other shapes as faint outlines, the filled area, the segments, the points,
// the tool's overlay, and the selection frame with its measurements.
import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { useStore, useT } from '../../store/store';
import type { P2, SketchGraph } from '../../model/types';
import { useViewBox, type Box, type VB } from '../../views/canvas2d';
import { sketchRegion, openEnds, sketchState } from '../../sketch/regions';
import { allCuts, cutPieces, segPoints, trimmedSegPoints } from '../../sketch/flatten';
import { bounds, selPts } from '../../sketch/model';
import { underlay } from '../underlay';
import { kernelNow } from '../kernel';
import { SketchRail } from './sketch2d/SketchRail';
import { SketchOverlay, sketchViewInfo, useSketchPointer } from './sketch2d/useSketchPointer';
import { SelectionLayer } from './sketch2d/SelectionLayer';
import { SketchBar } from './sketch2d/SketchBar';
import { Icon } from '../../ui/icons';
import './sketch2d/keys';

const Preview3D = lazy(() => import('./sketch2d/Preview3D'));

/** Sketch → SVG (y up on the sheet). */
export const toSvg = (p: P2): P2 => ({ x: p.x, y: -p.y });
export const fromSvg = (p: P2): P2 => ({ x: p.x, y: -p.y });
const path = (pts: P2[], close = false) => (pts.length ? `M${pts.map((p) => `${p.x} ${-p.y}`).join('L')}${close ? 'Z' : ''}` : '');

/** The box of the sketch (and of the shapes underneath), in SVG units. */
function contentBox(draft: SketchGraph, under: P2[][]): Box | null {
  const b = bounds(draft);
  const pts: P2[] = b ? [b.min, b.max] : [];
  for (const r of under) pts.push(...r);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => -p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function GridLayer({ vb, px, step }: { vb: VB; px: number; step: number }) {
  // minor lines only when 6 px apart or more; majors every ten, coarser while they are too close
  let minor = step > 0 ? step : 1;
  const showMinor = minor / px >= 6;
  let major = minor * 10;
  while (major / px < 6) major *= 10;
  if (!showMinor) minor = major;
  const lines: { d: string; cls: string }[] = [];
  const add = (s: number, cls: string, skip?: number) => {
    let d = '';
    for (let x = Math.ceil(vb.x / s) * s; x <= vb.x + vb.w; x += s) if (!skip || Math.abs(Math.round(x / skip) * skip - x) > 1e-6) d += `M${x} ${vb.y}V${vb.y + vb.h}`;
    for (let y = Math.ceil(vb.y / s) * s; y <= vb.y + vb.h; y += s) if (!skip || Math.abs(Math.round(y / skip) * skip - y) > 1e-6) d += `M${vb.x} ${y}H${vb.x + vb.w}`;
    lines.push({ d, cls });
  };
  if (showMinor) add(minor, 'sk-grid-minor', major);
  add(major, 'sk-grid-major');
  return (
    <g className="sk-grid" pointerEvents="none">
      {lines.map((l, i) => (
        <path key={i} d={l.d} className={l.cls} strokeWidth={px} />
      ))}
      <path d={`M${-12 * px} 0H${12 * px}M0 ${-12 * px}V${12 * px}`} className="sk-origin" strokeWidth={px * 1.5} />
    </g>
  );
}

function AxisLayer({ px, vb }: { px: number; vb: VB }) {
  const t = useT();
  const k = useStore((s) => s.sketch);
  const shape = useStore((s) => (s.sketch?.shapeId ? s.design.sculpt?.shapes[s.sketch.shapeId] : null));
  if (k?.mode !== 'revolve') return null;
  const seg = shape?.axis?.kind === 'seg' ? k.draft.segs[shape.axis.id] : null;
  let a: P2, b: P2;
  if (seg?.k === 'line') {
    const p = k.draft.pts[seg.a], q = k.draft.pts[seg.b];
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1, ux = (q.x - p.x) / L, uy = (q.y - p.y) / L, far = (vb.w + vb.h) * 2;
    a = { x: p.x - ux * far, y: p.y - uy * far };
    b = { x: p.x + ux * far, y: p.y + uy * far };
  } else {
    a = { x: 0, y: -(vb.y + vb.h) };
    b = { x: 0, y: -vb.y };
  }
  const label = seg ? k.draft.pts[seg.b] : { x: 0, y: -(vb.y + 40 * px) };
  return (
    <g pointerEvents="none" data-testid="sketch-axis">
      <path d={path([a, b])} className="sk-axis" strokeWidth={px * 1.6} strokeDasharray={`${px * 8} ${px * 5}`} />
      <text x={label.x + px * 6} y={-label.y} className="sk-axis-label" fontSize={px * 12}>
        {t('sketch.axis')}
      </text>
    </g>
  );
}

function SketchLayers({ draft, px, sel }: { draft: SketchGraph; px: number; sel: { pts: string[]; segs: string[] } }) {
  const region = useMemo(() => sketchRegion(draft), [draft]);
  const cuts = useMemo(() => allCuts(draft), [draft]);
  const open = useMemo(() => new Set(openEnds(draft)), [draft]);
  const selSegs = new Set(sel.segs), selP = new Set(sel.pts);
  const fill = region.flatMap((poly) => poly.map((r) => path(r, true))).join('');
  return (
    <>
      <path d={fill} className="sk-region" fillRule="evenodd" pointerEvents="none" data-testid="sketch-region" />
      <g className="sk-segs">
        {draft.order.map((g) => {
          const s = draft.segs[g];
          if (!s || !draft.pts[s.a] || !draft.pts[s.b]) return null;
          const pts = s.cons ? segPoints(draft, g) : trimmedSegPoints(draft, g, cuts);
          const locked = draft.pts[s.a].lock && draft.pts[s.b].lock;
          const cls = `sk-seg ${s.cons ? 'cons' : ''} ${locked ? 'locked' : ''} ${selSegs.has(g) ? 'sel' : ''}`;
          return (
            <g key={g}>
              <path d={path(pts)} className={cls} strokeWidth={px * 2} strokeDasharray={s.cons ? `${px * 6} ${px * 4}` : undefined} data-testid={`sk-seg-${g}`} />
              <path d={path(pts)} className="sk-seg-hit" strokeWidth={px * 12} data-seg={g} />
            </g>
          );
        })}
        {cutPieces(draft, cuts).map((c, i) => (
          <path key={`c${i}`} d={path(c)} className="sk-seg cut" strokeWidth={px * 2} pointerEvents="none" />
        ))}
      </g>
      <g className="sk-pts">
        {Object.entries(draft.pts).map(([id, p]) => {
          const q = toSvg(p);
          const size = px * (selP.has(id) ? 9 : 7);
          const cls = `sk-pt ${p.r || p.ch ? 'cut' : ''} ${p.lock ? 'locked' : ''} ${selP.has(id) ? 'sel' : ''}`;
          return (
            <g key={id}>
              {open.has(id) && <circle cx={q.x} cy={q.y} r={px * 9} className="sk-open" strokeWidth={px * 2} pointerEvents="none" />}
              {p.smooth ? <circle cx={q.x} cy={q.y} r={size / 2} className={cls} strokeWidth={px * 1.5} data-pt={id} data-testid={`sk-pt-${id}`} /> : <rect x={q.x - size / 2} y={q.y - size / 2} width={size} height={size} className={cls} strokeWidth={px * 1.5} data-pt={id} data-testid={`sk-pt-${id}`} />}
            </g>
          );
        })}
      </g>
      <HandlesLayer draft={draft} px={px} sel={sel} />
    </>
  );
}

/** The handles of the curves at the selected points (and of selected curves). */
function HandlesLayer({ draft, px, sel }: { draft: SketchGraph; px: number; sel: { pts: string[]; segs: string[] } }) {
  const pts = new Set(selPts(draft, sel));
  const out: { key: string; seg: string; end: 'a' | 'b'; p: P2; h: P2 }[] = [];
  for (const g of draft.order) {
    const s = draft.segs[g];
    if (s.k !== 'bez') continue;
    if (pts.has(s.a) || sel.segs.includes(g)) out.push({ key: `${g}a`, seg: g, end: 'a', p: draft.pts[s.a], h: { x: draft.pts[s.a].x + s.ha.x, y: draft.pts[s.a].y + s.ha.y } });
    if (pts.has(s.b) || sel.segs.includes(g)) out.push({ key: `${g}b`, seg: g, end: 'b', p: draft.pts[s.b], h: { x: draft.pts[s.b].x + s.hb.x, y: draft.pts[s.b].y + s.hb.y } });
  }
  return (
    <g className="sk-handles">
      {out.map((o) => (
        <g key={o.key}>
          <path d={path([o.p, o.h])} className="sk-handle-line" strokeWidth={px} pointerEvents="none" />
          <circle cx={o.h.x} cy={-o.h.y} r={px * 4.5} className="sk-handle" data-handle={`${o.seg}:${o.end}`} data-testid={`sk-handle-${o.seg}-${o.end}`} />
        </g>
      ))}
    </g>
  );
}

function UnderlayLayer({ px }: { px: number }) {
  const k = useStore((s) => s.sketch);
  const sc = useStore((s) => s.design.sculpt);
  const ready = useStore((s) => s.sculpt.ready);
  const under = useMemo(() => (k?.rigid && ready ? underlay(sc, k.shapeId, k.M) : []), [sc, k?.shapeId, k?.M, k?.rigid, ready]);
  return (
    <g className="sk-underlay" pointerEvents="none" data-testid="sketch-underlay">
      {under.map((u) => (
        <path key={u.id} d={u.rings.map((r) => path(r, true)).join('')} strokeWidth={px * 1.2} fillRule="evenodd" />
      ))}
    </g>
  );
}

function StatusLine() {
  const t = useT();
  const draft = useStore((s) => s.sketch?.draft);
  if (!draft) return null;
  const st = sketchState(draft);
  const n = st.open.length;
  const text = n === 1 ? t('sketch.oneOpenEnd') : n > 1 ? t('sketch.openEnds', { n }) : st.empty ? t('sketch.empty') : t('sketch.ready');
  return (
    <div className={`sk-status ${n ? 'warn' : ''}`} dir="auto" data-testid="sketch-status">
      {text}
    </div>
  );
}

export function SketchView2D() {
  const t = useT();
  const k = useStore((s) => s.sketch)!;
  const gridStep = useStore((s) => s.viewPrefs.gridStep);
  const svgRef = useRef<SVGSVGElement>(null);
  const sc = useStore((s) => s.design.sculpt);
  const initial = (): VB => {
    const under = k.rigid && kernelNow() ? underlay(sc, k.shapeId, k.M).flatMap((u) => u.rings) : [];
    const b = contentBox(k.draft, under) ?? { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const el = svgRef.current;
    const cw = el?.clientWidth || 1200, ch = el?.clientHeight || 760;
    const w0 = Math.max(40, b.maxX - b.minX) * 1.5, h0 = Math.max(40, b.maxY - b.minY) * 1.5;
    const kk = Math.min(cw / w0, ch / h0);
    const w = cw / kk, h = ch / kk;
    return { x: (b.minX + b.maxX) / 2 - w / 2, y: (b.minY + b.maxY) / 2 - h / 2, w, h };
  };
  const view = useViewBox(svgRef, `sketch:${k.shapeId ?? 'new'}`, initial);
  const { vb, setVB, mmPerPx, onWheel, zoom, fit } = view;
  const px = mmPerPx();
  const ptr = useSketchPointer(view);
  useEffect(() => {
    sketchViewInfo.canvas = svgRef.current;
    return () => void (sketchViewInfo.canvas = null);
  }, []);
  const fitAll = () => {
    const b = contentBox(k.draft, []);
    if (b) fit(b, 0.25);
    else setVB(initial());
  };
  // view keys: Home fits the sketch, F the selection, + and − zoom
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStore.getState().sketch;
      if (!s) return;
      if (e.key === 'Home') {
        e.preventDefault();
        fitAll();
      } else if ((e.key === 'f' || e.key === 'F') && (s.sel.pts.length || s.sel.segs.length)) {
        const b = bounds(s.draft, selPts(s.draft, s.sel));
        if (b) (e.preventDefault(), fit({ minX: b.min.x, maxX: b.max.x, minY: -b.max.y, maxY: -b.min.y }, 0.5));
      } else if (e.key === '+' || e.key === '=') zoom(0.8);
      else if (e.key === '-') zoom(1.25);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <div className="sketch-view" dir="ltr" data-testid="sketch-view">
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" onWheel={onWheel} onPointerDown={ptr.onDown} onPointerMove={ptr.onMove} onDoubleClick={ptr.onDouble} onContextMenu={(e) => e.preventDefault()} className={`sk-canvas tool-${k.tool}`} data-testid="sketch-canvas">
        <GridLayer vb={vb} px={px} step={gridStep} />
        <AxisLayer px={px} vb={vb} />
        <UnderlayLayer px={px} />
        <SketchLayers draft={k.draft} px={px} sel={k.sel} />
        <SketchOverlay ptr={ptr} px={px} />
        <SelectionLayer view={view} px={px} />
      </svg>
      <SketchRail />
      <SketchBar />
      <Suspense fallback={null}>
        <Preview3D />
      </Suspense>
      <div className="view-dock sk-dock" dir="auto">
        <div className="cluster">
          <button onClick={() => zoom(0.8)} aria-label={t('sketch.zoomIn')} title={t('sketch.zoomIn')}>
            <Icon name="plus" />
          </button>
          <button onClick={() => zoom(1.25)} aria-label={t('sketch.zoomOut')} title={t('sketch.zoomOut')}>
            <Icon name="minus" />
          </button>
          <button onClick={fitAll} aria-label={t('sketch.fit')} title={`${t('sketch.fit')} (Home)`} data-testid="sketch-fit">
            <Icon name="fit" />
          </button>
        </div>
      </div>
      <StatusLine />
      <div className="view-hint" dir="auto">
        {ptr.hint ?? t('sketch.hint.view')}
      </div>
    </div>
  );
}
