// Pieces shared by the 2D canvases (the cut plan and solo view, and the sketch
// view; SKETCH_OVERHAUL.md §6.1): the view box with zoom and pan, selection
// handles, the rotation ring and the marquee.
import { useEffect, useRef, useState } from 'react';
import type { Vec2 } from '../geom/types';

export type VB = { x: number; y: number; w: number; h: number };
export type Box = { minX: number; maxX: number; minY: number; maxY: number };

// view boxes survive switching views (solo → back restores the framing)
const savedVB = new Map<string, VB>();

/**
 * The view box of an SVG canvas, kept per `key` across remounts: the SVG point
 * under the pointer, mm per screen pixel, wheel zoom about the pointer, zoom
 * buttons, fitting a box, and a pan drag.
 */
export function useViewBox(svgRef: React.RefObject<SVGSVGElement | null>, key: string, initial: () => VB) {
  const [vb, setVBState] = useState<VB>(() => savedVB.get(key) ?? initial());
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const setVB = (v: VB | ((o: VB) => VB)) =>
    setVBState((o) => {
      const n = typeof v === 'function' ? v(o) : v;
      savedVB.set(key, n);
      return n;
    });
  useEffect(() => setVBState(savedVB.get(key) ?? initial()), [key]);
  // the first fit ran before the drawing had a size: fit again once it has one
  useEffect(() => {
    if (!savedVB.has(key)) setVBState(initial());
  }, []);

  const svgPoint = (ev: { clientX: number; clientY: number }): Vec2 => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };
  /** mm per screen pixel (fixed-pixel snap threshold at every zoom). */
  const mmPerPx = () => {
    const svg = svgRef.current;
    const v = vbRef.current;
    if (!svg || !svg.clientWidth) return v.w / 900;
    return Math.max(v.w / svg.clientWidth, v.h / svg.clientHeight);
  };
  const onWheel = (ev: React.WheelEvent) => {
    const p = svgPoint(ev);
    const k = Math.exp(ev.deltaY * 0.0015);
    setVB((v) => {
      const w = Math.min(20000, Math.max(5, v.w * k));
      const s = w / v.w;
      return { x: p.x - (p.x - v.x) * s, y: p.y - (p.y - v.y) * s, w, h: v.h * s };
    });
  };
  const zoom = (k: number) => setVB((v) => ({ x: v.x + (v.w * (1 - k)) / 2, y: v.y + (v.h * (1 - k)) / 2, w: v.w * k, h: v.h * k }));
  /** Frame a box (SVG units) with a margin, keeping the canvas's proportions. */
  const fit = (b: Box, margin = 0.12) => {
    const svg = svgRef.current;
    const cw = svg?.clientWidth || 1200, ch = svg?.clientHeight || 760;
    const w0 = Math.max(10, b.maxX - b.minX), h0 = Math.max(10, b.maxY - b.minY);
    const k = Math.min(cw / (w0 * (1 + 2 * margin)), ch / (h0 * (1 + 2 * margin)));
    const w = cw / k, h = ch / k;
    setVB({ x: (b.minX + b.maxX) / 2 - w / 2, y: (b.minY + b.maxY) / 2 - h / 2, w, h });
  };
  /** Start a pan drag (window listeners until the button is released). */
  const panFrom = (ev: { clientX: number; clientY: number }) => {
    const sx = ev.clientX, sy = ev.clientY, v0 = vbRef.current, k = mmPerPx();
    const move = (e: PointerEvent) => setVB({ ...v0, x: v0.x - (e.clientX - sx) * k, y: v0.y - (e.clientY - sy) * k });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { vb, setVB, svgPoint, mmPerPx, onWheel, zoom, fit, panFrom };
}

/**
 * Selection handles at a box's corners (and, with `side`, its sides' middles),
 * drawn in screen-sized units. `onDown(fixed, handle, kind)`: the handle grabbed
 * and the point that stays put (the opposite corner or side).
 */
export function Handles(props: {
  box: Box;
  rot?: number;
  toSvg: (p: Vec2) => Vec2;
  size: number;
  group?: boolean;
  side?: boolean;
  testPrefix?: string;
  onDown: (fixed: Vec2, corner: Vec2, kind?: 'corner' | 'side') => (ev: React.PointerEvent) => void;
}) {
  const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = props.box;
  // a turned shape: its corners turn about its centre
  const a = ((props.rot ?? 0) * Math.PI) / 180, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const T = (p: Vec2): Vec2 => (a ? { x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a), y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a) } : p);
  const corners: [Vec2, Vec2][] = (
    [
      [{ x: x0, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y0 }, { x: x0, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y0 }],
      [{ x: x0, y: y1 }, { x: x1, y: y0 }],
    ] as [Vec2, Vec2][]
  ).map(([p, q]) => [T(p), T(q)]);
  const sides: [Vec2, Vec2][] = props.side
    ? (
        [
          [{ x: cx, y: y0 }, { x: cx, y: y1 }],
          [{ x: x1, y: cy }, { x: x0, y: cy }],
          [{ x: cx, y: y1 }, { x: cx, y: y0 }],
          [{ x: x0, y: cy }, { x: x1, y: cy }],
        ] as [Vec2, Vec2][]
      ).map(([p, q]) => [T(p), T(q)])
    : [];
  const pts = corners.map(([p]) => props.toSvg(p));
  const pre = props.testPrefix ?? (props.group ? 'ghandle' : 'handle');
  return (
    <g className="handles">
      {props.group && <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="group-box" strokeWidth={props.size / 9} />}
      {corners.map(([p, fixed], i) => {
        const s = pts[i];
        return <rect key={i} x={s.x - props.size / 2} y={s.y - props.size / 2} width={props.size} height={props.size} className="handle" onPointerDown={props.onDown(fixed, p, 'corner')} data-testid={`${pre}-${i}`} />;
      })}
      {sides.map(([p, fixed], i) => {
        const s = props.toSvg(p);
        return <rect key={`s${i}`} x={s.x - props.size * 0.4} y={s.y - props.size * 0.4} width={props.size * 0.8} height={props.size * 0.8} className="handle side" onPointerDown={props.onDown(fixed, p, 'side')} data-testid={`${pre}-side-${i}`} />;
      })}
    </g>
  );
}

/** Rotation ring around the selected shapes: drag it to turn them (15° steps, Shift 1°, Alt free). */
export function RotRing(props: { centre: Vec2; r: number; px: number; onDown: (ev: React.PointerEvent) => void }) {
  const { centre: c, r, px } = props;
  return (
    <g className="rot-ring-g">
      <circle cx={c.x} cy={c.y} r={r} className="rot-ring" strokeWidth={px * 2} />
      <circle cx={c.x} cy={c.y} r={r} className="rot-ring-hit" strokeWidth={px * 14} onPointerDown={props.onDown} data-testid="rot-ring" />
      <circle cx={c.x} cy={c.y - r} r={px * 6} className="rot-knob" onPointerDown={props.onDown} data-testid="rot-knob" />
    </g>
  );
}

/** The selection rectangle being dragged. */
export function Marquee({ a, b, px }: { a: Vec2; b: Vec2; px: number }) {
  return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} className="marquee" strokeWidth={px} data-testid="marquee" />;
}
