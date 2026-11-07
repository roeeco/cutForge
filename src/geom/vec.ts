import type { Vec2, Seg, Contour, Xform2, ArcSeg } from './types';
import { GEOM_EPS } from './types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const perpL = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const perpR = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const near = (a: Vec2, b: Vec2, eps = 1e-4) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
export const rotate = (p: Vec2, ang: number): Vec2 => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export const IDENTITY: Xform2 = { tx: 0, ty: 0, rot: 0 };

export function applyX(t: Xform2, p: Vec2): Vec2 {
  const q = t.mirror ? { x: -p.x, y: p.y } : p;
  const r = rotate(q, t.rot);
  return { x: r.x + t.tx, y: r.y + t.ty };
}
export function invertPoint(t: Xform2, p: Vec2): Vec2 {
  const r = rotate({ x: p.x - t.tx, y: p.y - t.ty }, -t.rot);
  return t.mirror ? { x: -r.x, y: r.y } : r;
}
/** Compose: first apply `inner`, then `outer`. */
export function composeX(outer: Xform2, inner: Xform2): Xform2 {
  const o = applyX(outer, { x: inner.tx, y: inner.ty });
  const mirror = !!outer.mirror !== !!inner.mirror;
  const rot = outer.mirror ? outer.rot - inner.rot : outer.rot + inner.rot;
  return { tx: o.x, ty: o.y, rot, mirror: mirror || undefined };
}

export function xformSeg(t: Xform2, s: Seg): Seg {
  if (s.k === 'L') return { k: 'L', a: applyX(t, s.a), b: applyX(t, s.b) };
  const ccw = t.mirror ? !s.ccw : s.ccw;
  return { k: 'A', a: applyX(t, s.a), b: applyX(t, s.b), c: applyX(t, s.c), r: s.r, ccw };
}
export function xformContour(t: Xform2, c: Contour): Contour {
  return { closed: c.closed, segs: c.segs.map((s) => xformSeg(t, s)) };
}

export const L = (a: Vec2, b: Vec2): Seg => ({ k: 'L', a, b });

/** Signed sweep angle of an arc (positive for ccw). */
export function arcSweep(s: ArcSeg): number {
  const a0 = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x);
  const a1 = Math.atan2(s.b.y - s.c.y, s.b.x - s.c.x);
  let d = a1 - a0;
  if (s.ccw) {
    while (d <= GEOM_EPS) d += Math.PI * 2;
  } else {
    while (d >= -GEOM_EPS) d -= Math.PI * 2;
  }
  return d;
}

/** Flatten a segment into points (excluding the start point). */
export function flattenSeg(s: Seg, tol = 0.01): Vec2[] {
  if (s.k === 'L') return [s.b];
  const sweep = arcSweep(s);
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(s.r, tol))));
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3)));
  const a0 = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x);
  const pts: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push(i === n ? s.b : { x: s.c.x + s.r * Math.cos(a), y: s.c.y + s.r * Math.sin(a) });
  }
  return pts;
}
export function flattenContour(c: Contour, tol = 0.01): Vec2[] {
  if (!c.segs.length) return [];
  const pts: Vec2[] = [c.segs[0].a];
  for (const s of c.segs) pts.push(...flattenSeg(s, tol));
  if (c.closed && pts.length > 1 && near(pts[0], pts[pts.length - 1], 1e-9)) pts.pop();
  return pts;
}

export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
/** Signed area of a contour (exact for arcs). Positive = CCW. */
export function contourArea(c: Contour): number {
  let a = 0;
  for (const s of c.segs) {
    a += (s.a.x * s.b.y - s.b.x * s.a.y) / 2;
    if (s.k === 'A') {
      const sw = arcSweep(s);
      // circular segment area between chord and arc, signed by sweep
      a += (s.r * s.r * (sw - Math.sin(sw))) / 2;
    }
  }
  return a;
}
export function reverseContour(c: Contour): Contour {
  return {
    closed: c.closed,
    segs: [...c.segs].reverse().map((s) => (s.k === 'L' ? { k: 'L', a: s.b, b: s.a } : { ...s, a: s.b, b: s.a, ccw: !s.ccw })),
  };
}

export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function bboxOf(pts: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
export type BBox = ReturnType<typeof bboxOf>;

/** Exact bbox of a contour including arc extrema. */
export function contourBBox(c: Contour): BBox {
  const pts: Vec2[] = [];
  for (const s of c.segs) {
    pts.push(s.a, s.b);
    if (s.k === 'A') {
      const sw = arcSweep(s);
      const a0 = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x);
      for (let k = -4; k <= 8; k++) {
        const ang = (k * Math.PI) / 2;
        const rel = sw > 0 ? ang - a0 : a0 - ang;
        const relN = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (relN > 0 && relN < Math.abs(sw)) pts.push({ x: s.c.x + s.r * Math.cos(ang), y: s.c.y + s.r * Math.sin(ang) });
      }
    }
  }
  return bboxOf(pts);
}

export function segDistPoint(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}

/** Rectangle contour (CCW) from (x0,y0) to (x1,y1). */
export function rectContour(x0: number, y0: number, x1: number, y1: number): Contour {
  const p = [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];
  return { closed: true, segs: p.map((a, i) => L(a, p[(i + 1) % 4])) };
}
/** Circle contour (CCW) as two half arcs. */
export function circleContour(cx: number, cy: number, r: number): Contour {
  const c = v(cx, cy);
  const a = v(cx + r, cy), b = v(cx - r, cy);
  return {
    closed: true,
    segs: [
      { k: 'A', a, b, c, r, ccw: true },
      { k: 'A', a: b, b: a, c, r, ccw: true },
    ],
  };
}
/** Rounded rectangle (CCW) centred at origin-agnostic corners. r is clamped. */
export function roundedRectContour(x0: number, y0: number, x1: number, y1: number, r: number): Contour {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2 - 1e-9, (y1 - y0) / 2 - 1e-9));
  if (rr < 1e-6) return rectContour(x0, y0, x1, y1);
  const segs: Seg[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const c = v(cx, cy);
    segs.push({ k: 'A', a: v(cx + rr * Math.cos(a0), cy + rr * Math.sin(a0)), b: v(cx + rr * Math.cos(a1), cy + rr * Math.sin(a1)), c, r: rr, ccw: true });
  };
  const H = Math.PI / 2;
  segs.push(L(v(x0 + rr, y0), v(x1 - rr, y0)));
  arc(x1 - rr, y0 + rr, -H, 0);
  segs.push(L(v(x1, y0 + rr), v(x1, y1 - rr)));
  arc(x1 - rr, y1 - rr, 0, H);
  segs.push(L(v(x1 - rr, y1), v(x0 + rr, y1)));
  arc(x0 + rr, y1 - rr, H, 2 * H);
  segs.push(L(v(x0, y1 - rr), v(x0, y0 + rr)));
  arc(x0 + rr, y0 + rr, 2 * H, 3 * H);
  return { closed: true, segs };
}
export function polygonContour(pts: Vec2[]): Contour {
  return { closed: true, segs: pts.map((a, i) => L(a, pts[(i + 1) % pts.length])) };
}
