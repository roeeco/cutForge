// 2D cut plan: every piece flat on its sheet, edited with the same tools and
// selection as the 3D workspace. Edits go to the same panel model.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useT } from '../store/store';
import { pack, pieceCopies, placementXform, sheetCount, type PieceCopy } from '../model/pack';
import { contourPathD } from '../export/svg';
import { applyX, invertPoint, xformContour } from '../geom/vec';
import type { Vec2, Xform2 } from '../geom/types';
import { addDetail, findDetail, newId, updateDetail } from '../model/ops';
import { LAYERS } from '../export/layers';
import { fmtNum } from '../i18n';
import type { Detail } from '../model/types';

const GAP = 40;
const snap = (x: number) => Math.round(x);

type Placed = { copy: PieceCopy; sheet: number; xf: Xform2; ox: number };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vb: VB }
  | { kind: 'move'; id: string; placed: Placed; start: Vec2; orig: { cx: number; cy: number } }
  | { kind: 'resize'; id: string; placed: Placed; fixed: Vec2; circle: boolean }
  | { kind: 'draw'; id: string; placed: Placed; start: Vec2 };

type VB = { x: number; y: number; w: number; h: number };

export function CutPlan() {
  const t = useT();
  const d = useStore((s) => s.design);
  const sel = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const svgRef = useRef<SVGSVGElement>(null);
  const { sheetW: W, sheetH: H } = d.material;

  const layout = useMemo(() => {
    const copies = pieceCopies(d);
    const placements = pack(d, copies);
    const placed: Placed[] = copies
      .filter((c) => placements[c.key])
      .map((c) => {
        const pl = placements[c.key];
        return { copy: c, sheet: pl.sheet, xf: placementXform(pl, c.h), ox: pl.sheet * (W + GAP) };
      });
    return { placed, sheets: sheetCount(placements) };
  }, [d, W]);

  const fitVB = (): VB => {
    const totalW = layout.sheets * W + (layout.sheets - 1) * GAP;
    return { x: -20, y: -30, w: totalW + 40, h: H + 60 };
  };
  const [vb, setVB] = useState<VB>(fitVB);
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  // keep aspect: adapt viewBox height to element aspect
  const svgPoint = (ev: { clientX: number; clientY: number }): Vec2 => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };
  /** SVG point to piece-local coordinates for a placed copy. */
  const toLocal = (pl: Placed, p: Vec2): Vec2 => {
    const q = invertPoint(pl.xf, { x: p.x - pl.ox, y: H - p.y });
    return { x: q.x + pl.copy.origin.x, y: q.y + pl.copy.origin.y };
  };
  const toSvg = (pl: Placed, p: Vec2): Vec2 => {
    const q = applyX(pl.xf, { x: p.x - pl.copy.origin.x, y: p.y - pl.copy.origin.y });
    return { x: q.x + pl.ox, y: H - q.y };
  };

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const st = useStore.getState();
      if (g.kind === 'pan') {
        const svg = svgRef.current!;
        const k = g.vb.w / svg.clientWidth;
        setVB({ ...g.vb, x: g.vb.x - (ev.clientX - g.sx) * k, y: g.vb.y - (ev.clientY - g.sy) * k });
        return;
      }
      const l = toLocal(g.placed, svgPoint(ev));
      if (g.kind === 'move') {
        st.preview((x) => updateDetail(x, g.id, { cx: g.orig.cx + snap(l.x - g.start.x), cy: g.orig.cy + snap(l.y - g.start.y) }));
      } else if (g.kind === 'resize') {
        const px = snap(l.x), py = snap(l.y);
        let w = Math.abs(px - g.fixed.x), h = Math.abs(py - g.fixed.y);
        if (g.circle) w = h = Math.max(w, h);
        const cx = g.fixed.x + (Math.sign(px - g.fixed.x) || 1) * w / 2;
        const cy = g.fixed.y + (Math.sign(py - g.fixed.y) || 1) * h / 2;
        st.preview((x) => updateDetail(x, g.id, { cx, cy, w: Math.max(0.5, w), h: Math.max(0.5, h) }));
        setLabel({ text: g.circle ? `Ø ${fmtNum(w)}` : `${fmtNum(w)} × ${fmtNum(h)}`, ...svgPoint(ev) });
      } else if (g.kind === 'draw') {
        const shape = st.tool === 'select' || st.tool === 'panel' ? 'rect' : st.tool;
        const px = snap(l.x), py = snap(l.y);
        let w = Math.abs(px - g.start.x), h = Math.abs(py - g.start.y);
        if (shape === 'circle') w = h = Math.max(w, h);
        if (w < 0.5 && h < 0.5) return;
        const cx = g.start.x + (Math.sign(px - g.start.x) || 1) * w / 2;
        const cy = g.start.y + (Math.sign(py - g.start.y) || 1) * h / 2;
        st.preview((x) => void addDetail(x, g.placed.copy.pieceKey, shape, st.shapeOp, cx, cy, w, h, g.id));
        setLabel({ text: shape === 'circle' ? `Ø ${fmtNum(w)}` : `${fmtNum(w)} × ${fmtNum(h)}`, ...svgPoint(ev) });
      }
    };
    const up = () => {
      const g = drag.current;
      if (!g) return;
      drag.current = null;
      setLabel(null);
      const st = useStore.getState();
      if (g.kind === 'draw') {
        const made = !!st.txnBase;
        st.commit();
        if (made) st.select({ kind: 'detail', id: g.id });
      } else if (g.kind !== 'pan') st.commit();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && drag.current) {
        drag.current = null;
        setLabel(null);
        useStore.getState().cancel();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  });

  const onWheel = (ev: React.WheelEvent) => {
    const p = svgPoint(ev);
    const k = Math.exp(ev.deltaY * 0.0015);
    setVB((v) => {
      const w = Math.min(20000, Math.max(20, v.w * k));
      const s = w / v.w;
      return { x: p.x - (p.x - v.x) * s, y: p.y - (p.y - v.y) * s, w, h: v.h * s };
    });
  };
  const zoom = (k: number) => setVB((v) => ({ x: v.x + (v.w * (1 - k)) / 2, y: v.y + (v.h * (1 - k)) / 2, w: v.w * k, h: v.h * k }));

  const shapeTool = tool === 'rect' || tool === 'circle' || tool === 'roundrect';
  const onPieceDown = (pl: Placed) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (shapeTool) {
      const l = toLocal(pl, svgPoint(ev));
      drag.current = { kind: 'draw', id: newId('x'), placed: pl, start: { x: snap(l.x), y: snap(l.y) } };
    } else useStore.getState().select({ kind: 'panel', id: pl.copy.pieceKey });
  };
  const onDetailDown = (pl: Placed, dt: Detail) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    if (shapeTool) return onPieceDown(pl)(ev);
    ev.stopPropagation();
    useStore.getState().select({ kind: 'detail', id: dt.id });
    drag.current = { kind: 'move', id: dt.id, placed: pl, start: toLocal(pl, svgPoint(ev)), orig: { cx: dt.cx, cy: dt.cy } };
  };
  const onBackDown = (ev: React.PointerEvent) => {
    if (ev.button === 0 && tool === 'select') useStore.getState().select(null);
    drag.current = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vb };
  };

  const selDetail = sel?.kind === 'detail' ? findDetail(d, sel.id) : null;
  const selPanelId = sel?.kind === 'panel' ? sel.id : sel?.kind === 'edge' ? sel.panelId : selDetail?.panel.id;
  const handlePl = selDetail ? layout.placed.find((p) => p.copy.pieceKey === selDetail.panel.id) : undefined;
  const px = vb.w / 900; // ≈ one screen pixel in mm at typical width

  return (
    <div className="cutplan" dir="ltr" data-testid="cutplan">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onBackDown}
        className={shapeTool ? 'drawing' : ''}
      >
        {Array.from({ length: layout.sheets }, (_, i) => (
          <g key={i}>
            <rect x={i * (W + GAP)} y={0} width={W} height={H} className="sheet" />
            <rect x={i * (W + GAP) + d.sheetMargin} y={d.sheetMargin} width={W - 2 * d.sheetMargin} height={H - 2 * d.sheetMargin} className="sheet-margin" />
            <text x={i * (W + GAP)} y={-8} className="sheet-label" fontSize={Math.max(8, px * 13)}>
              {t('view.sheet', { n: i + 1 })} · {W} × {H} {t('unit.mm')}
            </text>
          </g>
        ))}
        {layout.placed.map((pl) => {
          const panel = d.panels[pl.copy.pieceKey];
          const isSel = selPanelId === pl.copy.pieceKey;
          return (
            <g key={pl.copy.key} data-piece={pl.copy.pieceKey}>
              {pl.copy.contours.map((c, i) => {
                const dpath = contourPathD(xformContour(pl.xf, c.contour), H, pl.ox, 0);
                if (c.role === 'outer')
                  return <path key={i} d={dpath} className={`piece ${isSel ? 'sel' : ''}`} fillRule="evenodd" onPointerDown={onPieceDown(pl)} stroke={LAYERS.cut.hex} strokeWidth={px * (isSel ? 2 : 1)} />;
                const dt = panel?.details.find((x) => x.id === c.ref?.detailId);
                const dsel = !!dt && sel?.kind === 'detail' && sel.id === dt.id;
                return (
                  <path
                    key={i}
                    d={dpath}
                    className={`detail ${dsel ? 'sel' : ''} op-${c.op}`}
                    stroke={dsel ? '#2563eb' : LAYERS[c.op].hex}
                    strokeWidth={px * (dsel ? 2.5 : 1)}
                    onPointerDown={dt ? onDetailDown(pl, dt) : undefined}
                    data-testid={dt && pl.copy.copy === 0 ? `detail-${dt.id}` : undefined}
                  />
                );
              })}
              {panel && pl.copy.copy === 0 && (
                <text {...(() => { const c = toSvg(pl, { x: panel.w / 2, y: panel.h / 2 }); return { x: c.x, y: c.y }; })()} className="piece-label" fontSize={Math.max(6, px * 12)} textAnchor="middle" pointerEvents="none">
                  {panel.name}
                  {(d.pieces[panel.id]?.quantity ?? 1) > 1 ? ` ${t('view.copies', { n: d.pieces[panel.id].quantity })}` : ''}
                </text>
              )}
            </g>
          );
        })}
        {selDetail && handlePl && tool === 'select' && (
          <Handles dt={selDetail.detail} toSvg={(p) => toSvg(handlePl, p)} size={px * 9} onDown={(fixed) => (ev) => {
            ev.stopPropagation();
            drag.current = { kind: 'resize', id: selDetail.detail.id, placed: handlePl, fixed, circle: selDetail.detail.shape === 'circle' };
          }} />
        )}
        {label && (
          <text x={label.x + px * 12} y={label.y - px * 12} className="dim-text" fontSize={px * 13}>
            {label.text} {t('unit.mm')}
          </text>
        )}
      </svg>
      <div className="view-controls">
        <button onClick={() => zoom(0.8)} aria-label={t('view.zoomIn')}>+</button>
        <button onClick={() => zoom(1.25)} aria-label={t('view.zoomOut')}>−</button>
        <button onClick={() => setVB(fitVB())}>{t('view.fit')}</button>
      </div>
      <div className="view-hint" dir="auto">{d.order.length === 0 ? t('view.empty2d') : shapeTool ? t('tool.hint.shape2d') : t('tool.hint.select')}</div>
    </div>
  );
}

function Handles({ dt, toSvg, size, onDown }: { dt: Detail; toSvg: (p: Vec2) => Vec2; size: number; onDown: (fixed: Vec2) => (ev: React.PointerEvent) => void }) {
  const x0 = dt.cx - dt.w / 2, x1 = dt.cx + dt.w / 2, y0 = dt.cy - dt.h / 2, y1 = dt.cy + dt.h / 2;
  const corners: [Vec2, Vec2][] = [
    [{ x: x0, y: y0 }, { x: x1, y: y1 }],
    [{ x: x1, y: y0 }, { x: x0, y: y1 }],
    [{ x: x1, y: y1 }, { x: x0, y: y0 }],
    [{ x: x0, y: y1 }, { x: x1, y: y0 }],
  ];
  return (
    <g className="handles">
      {corners.map(([p, fixed], i) => {
        const s = toSvg(p);
        return <rect key={i} x={s.x - size / 2} y={s.y - size / 2} width={size} height={size} className="handle" onPointerDown={onDown(fixed)} data-testid={`handle-${i}`} />;
      })}
    </g>
  );
}
