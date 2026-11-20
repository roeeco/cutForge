// Segments as points (SKETCH_OVERHAUL.md §5.3): arcs cut so every chord is within
// the tolerance and every point lies on the circle; Beziers by subdivision;
// rounded and chamfered corners where exactly two straight lines meet.
import type { P2 } from '../model/types';
import { segsAt, otherEnd, type Chain, type Sketch } from './model';

/** Flattening tolerance (mm): a chord's largest distance from the curve. */
export const SK_TOL = 0.02;

const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P2, b: P2): P2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P2, k: number): P2 => ({ x: a.x * k, y: a.y * k });
const len = (a: P2) => Math.hypot(a.x, a.y);
const unit = (a: P2): P2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const lerp = (a: P2, b: P2, t: number): P2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The circle of an arc from a to b with this bulge: centre, radius, start angle and signed sweep (radians). */
export function arcOf(a: P2, b: P2, bulge: number): { c: P2; r: number; a0: number; sweep: number } {
  const sweep = 4 * Math.atan(bulge);
  const ch = len(sub(b, a));
  const m = lerp(a, b, 0.5);
  if (Math.abs(bulge) < 1e-12 || ch < 1e-12) return { c: m, r: Infinity, a0: 0, sweep: 0 };
  // the centre is off the chord's middle, on the left for a positive bulge
  const n = { x: -(b.y - a.y) / ch, y: (b.x - a.x) / ch };
  const off = ((ch / 2) * (1 - bulge * bulge)) / (2 * bulge);
  const c = add(m, mul(n, off));
  const r = Math.hypot(a.x - c.x, a.y - c.y);
  return { c, r, a0: Math.atan2(a.y - c.y, a.x - c.x), sweep };
}

/** The bulge of the arc from a to b that passes through `via` (0 when the three are in line). */
export function bulgeThrough(a: P2, b: P2, via: P2): number {
  const u = sub(a, via), v = sub(b, via);
  const cross = (b.x - a.x) * (via.y - a.y) - (b.y - a.y) * (via.x - a.x);
  if (Math.abs(cross) < 1e-12 || len(u) < 1e-12 || len(v) < 1e-12) return 0;
  // the inscribed angle at via; via to the right of a→b means counter-clockwise
  const th = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (len(u) * len(v)))));
  return (cross < 0 ? 1 : -1) / Math.tan(th / 2);
}

/** Points along an arc (both ends included), every point on the circle, chords within tol. */
export function arcPts(a: P2, b: P2, bulge: number, tol = SK_TOL, facets?: number): P2[] {
  const f = arcOf(a, b, bulge);
  if (!Number.isFinite(f.r) || f.sweep === 0) return [a, b];
  let k: number;
  if (facets) k = Math.max(1, Math.ceil((Math.abs(f.sweep) / (Math.PI / 2)) * facets));
  else {
    const step = 2 * Math.acos(Math.max(-1, 1 - tol / Math.max(f.r, tol)));
    k = Math.max(1, Math.min(1024, Math.ceil(Math.abs(f.sweep) / step)));
  }
  const out: P2[] = [a];
  for (let j = 1; j < k; j++) {
    const t = f.a0 + (f.sweep * j) / k;
    out.push({ x: f.c.x + f.r * Math.cos(t), y: f.c.y + f.r * Math.sin(t) });
  }
  out.push(b);
  return out;
}

/** A point on a cubic Bezier given by its four control points. */
export function bezAt(P: [P2, P2, P2, P2], t: number): P2 {
  const u = 1 - t;
  return {
    x: u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x,
    y: u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y,
  };
}
/** Split a cubic at t (de Casteljau): the two halves' control points. */
export function bezSplit(P: [P2, P2, P2, P2], t: number): [[P2, P2, P2, P2], [P2, P2, P2, P2]] {
  const q0 = lerp(P[0], P[1], t), q1 = lerp(P[1], P[2], t), q2 = lerp(P[2], P[3], t);
  const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t);
  const s = lerp(r0, r1, t);
  return [
    [P[0], q0, r0, s],
    [s, r1, q2, P[3]],
  ];
}
/** Points along a cubic (ends included) by recursive subdivision, within tol; with `params`, the t of each. */
export function bezPts(P: [P2, P2, P2, P2], tol = SK_TOL, facets?: number): { pts: P2[]; ts: number[] } {
  if (facets) {
    const n = Math.max(1, facets * 4);
    const ts = Array.from({ length: n + 1 }, (_, i) => i / n);
    return { pts: ts.map((t) => bezAt(P, t)), ts };
  }
  const pts: P2[] = [P[0]], ts: number[] = [0];
  const flat = (Q: [P2, P2, P2, P2]) => {
    // the control points' distance from the chord bounds the curve's
    const d = sub(Q[3], Q[0]), L = len(d);
    const dist = (p: P2) => (L < 1e-12 ? len(sub(p, Q[0])) : Math.abs((p.x - Q[0].x) * d.y - (p.y - Q[0].y) * d.x) / L);
    return Math.max(dist(Q[1]), dist(Q[2])) * 0.75 <= tol;
  };
  const rec = (Q: [P2, P2, P2, P2], t0: number, t1: number, depth: number) => {
    if (depth > 16 || flat(Q)) {
      pts.push(Q[3]);
      ts.push(t1);
      return;
    }
    const [l, r] = bezSplit(Q, 0.5);
    const tm = (t0 + t1) / 2;
    rec(l, t0, tm, depth + 1);
    rec(r, tm, t1, depth + 1);
  };
  rec(P, 0, 1, 0);
  return { pts, ts };
}

/** A Bezier segment's four control points. */
export function bezCtl(sk: Sketch, segId: string): [P2, P2, P2, P2] | null {
  const s = sk.segs[segId];
  if (!s || s.k !== 'bez') return null;
  const a = sk.pts[s.a], b = sk.pts[s.b];
  return [a, add(a, s.ha), add(b, s.hb), b];
}

/** A segment as points from its a end to its b end (ends included). */
export function segPoints(sk: Sketch, segId: string, tol = SK_TOL, facets?: number): P2[] {
  const s = sk.segs[segId];
  if (!s) return [];
  const a = sk.pts[s.a], b = sk.pts[s.b];
  if (!a || !b) return [];
  const A = { x: a.x, y: a.y }, B = { x: b.x, y: b.y };
  if (s.k === 'line') return [A, B];
  if (s.k === 'arc') return arcPts(A, B, s.bulge, tol, facets);
  return bezPts(bezCtl(sk, segId)!, tol, facets).pts;
}

/** A segment's point at parameter t (0 at a, 1 at b): along a line, by angle on an arc, the curve's own t on a Bezier. */
export function segAt(sk: Sketch, segId: string, t: number): P2 {
  const s = sk.segs[segId];
  const a = sk.pts[s.a], b = sk.pts[s.b];
  if (s.k === 'line') return lerp(a, b, t);
  if (s.k === 'arc') {
    const f = arcOf(a, b, s.bulge);
    if (!Number.isFinite(f.r)) return lerp(a, b, t);
    const ang = f.a0 + f.sweep * t;
    return { x: f.c.x + f.r * Math.cos(ang), y: f.c.y + f.r * Math.sin(ang) };
  }
  return bezAt(bezCtl(sk, segId)!, t);
}

/** The direction a segment leaves a point (unit), along its curve. */
export function tangentAt(sk: Sketch, segId: string, ptId: string): P2 {
  const s = sk.segs[segId];
  const a = sk.pts[s.a], b = sk.pts[s.b];
  const fromA = s.a === ptId;
  if (s.k === 'line') return unit(fromA ? sub(b, a) : sub(a, b));
  if (s.k === 'bez') {
    const h = fromA ? s.ha : s.hb;
    if (len(h) > 1e-9) return unit(h);
    return unit(fromA ? sub(b, a) : sub(a, b));
  }
  const f = arcOf(a, b, s.bulge);
  if (!Number.isFinite(f.r)) return unit(fromA ? sub(b, a) : sub(a, b));
  const p = fromA ? a : b;
  const rad = unit(sub(p, f.c));
  // counter-clockwise from a: the tangent is the radius turned left; walked back from b, the other way
  const ccw = f.sweep > 0;
  const t = ccw ? { x: -rad.y, y: rad.x } : { x: rad.y, y: -rad.x };
  return fromA ? t : mul(t, -1);
}

/** The cut at a corner: tangent points on its two lines (in the order of `segsAt`), and the arc's centre and radius for a fillet. */
export type Cut = { t1: P2; t2: P2; c?: P2; r?: number; s1: string; s2: string };

/** Is the point a corner between exactly two straight non-construction lines? */
export function isLineCorner(sk: Sketch, ptId: string): [string, string] | null {
  const gs = segsAt(sk, ptId, { cons: false });
  if (gs.length !== 2) return null;
  if (gs.some((g) => sk.segs[g].k !== 'line' || sk.segs[g].a === sk.segs[g].b)) return null;
  return [gs[0], gs[1]];
}

/** How far a corner's cut reaches along each of its two lines, before the clamp. */
function cutReach(sk: Sketch, ptId: string): { L: number; half: number; u1: P2; u2: P2; s: [string, string] } | null {
  const p = sk.pts[ptId];
  if (!p || !((p.r ?? 0) > 0 || (p.ch ?? 0) > 0)) return null;
  const s = isLineCorner(sk, ptId);
  if (!s) return null;
  const q1 = sk.pts[otherEnd(sk, s[0], ptId)], q2 = sk.pts[otherEnd(sk, s[1], ptId)];
  const u1 = unit(sub(q1, p)), u2 = unit(sub(q2, p));
  const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
  if (th < 1e-6 || Math.PI - th < 1e-6) return null;
  const L = (p.r ?? 0) > 0 ? p.r! / Math.tan(th / 2) : p.ch!;
  return { L, half: th / 2, u1, u2, s };
}

/**
 * The fillet or chamfer at a point with `r` or `ch`, valid only where exactly two
 * non-construction lines meet. A corner takes at most 45 % of a line whose other
 * end is cut too, and all but a hair of one whose other end is not.
 */
export function cornerCut(sk: Sketch, ptId: string): Cut | null {
  const R = cutReach(sk, ptId);
  if (!R) return null;
  const p = sk.pts[ptId];
  let L = R.L;
  for (const g of R.s) {
    const q = otherEnd(sk, g, ptId);
    const side = len(sub(sk.pts[q], p));
    const other = cutReach(sk, q);
    L = Math.min(L, other ? 0.45 * side : side * 0.999);
  }
  const t1 = add(p, mul(R.u1, L)), t2 = add(p, mul(R.u2, L));
  if ((p.r ?? 0) > 0) {
    const r = L * Math.tan(R.half);
    const bis = unit(add(R.u1, R.u2));
    const c = add(p, mul(bis, r / Math.sin(R.half)));
    return { t1, t2, c, r, s1: R.s[0], s2: R.s[1] };
  }
  return { t1, t2, s1: R.s[0], s2: R.s[1] };
}

/** The points of a corner's cut from the side of segment `from` to the other (ends included). */
export function cutPoints(cut: Cut, from: string, tol = SK_TOL, facets?: number): P2[] {
  const [p, q] = from === cut.s1 ? [cut.t1, cut.t2] : [cut.t2, cut.t1];
  if (!cut.c || !cut.r) return [p, q];
  const a1 = Math.atan2(p.y - cut.c.y, p.x - cut.c.x), a2 = Math.atan2(q.y - cut.c.y, q.x - cut.c.x);
  let da = a2 - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da <= -Math.PI) da += 2 * Math.PI;
  return arcPts(p, q, Math.tan(da / 4), tol, facets);
}

/** A segment's points between its corner cuts (from a to b): a line shortened at a cut end. */
export function trimmedSegPoints(sk: Sketch, segId: string, cuts: Map<string, Cut | null>, tol = SK_TOL, facets?: number): P2[] {
  const s = sk.segs[segId];
  const pts = segPoints(sk, segId, tol, facets);
  if (s.k !== 'line' || pts.length < 2) return pts;
  const ca = cuts.get(s.a), cb = cuts.get(s.b);
  const A = ca ? (ca.s1 === segId ? ca.t1 : ca.t2) : pts[0];
  const B = cb ? (cb.s1 === segId ? cb.t1 : cb.t2) : pts[pts.length - 1];
  return [A, B];
}

/** Every point's cut (null where it has none), computed once. */
export function allCuts(sk: Sketch): Map<string, Cut | null> {
  const m = new Map<string, Cut | null>();
  for (const id of Object.keys(sk.pts)) m.set(id, cornerCut(sk, id));
  return m;
}

/** A chain as one polyline with its corner cuts applied (closed chains: without repeating the first point). */
export function flatChain(sk: Sketch, chain: Chain, tol = SK_TOL, cuts = allCuts(sk), facets?: number): P2[] {
  const out: P2[] = [];
  const push = (p: P2) => {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-9) out.push({ x: p.x, y: p.y });
  };
  chain.segs.forEach((g, i) => {
    let pts = trimmedSegPoints(sk, g, cuts, tol, facets);
    if (chain.rev[i]) pts = [...pts].reverse();
    pts.forEach(push);
    // the cut at the point this segment ends on
    const end = chain.rev[i] ? sk.segs[g].a : sk.segs[g].b;
    const last = i === chain.segs.length - 1;
    const c = cuts.get(end);
    if (c && (!last || chain.closed)) {
      const cp = cutPoints(c, g, tol, facets);
      cp.forEach(push);
    }
  });
  if (chain.closed && out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) out.pop();
  }
  return out;
}

/** The cuts' extra pieces (fillet arcs and chamfers) as polylines, one per cut corner. */
export function cutPieces(sk: Sketch, cuts = allCuts(sk), tol = SK_TOL, facets?: number): P2[][] {
  const out: P2[][] = [];
  for (const c of cuts.values()) if (c) out.push(cutPoints(c, c.s1, tol, facets));
  return out;
}
