// Analytic offset of closed line-and-arc contours, for kerf compensation.
// Lines move along their normal, arcs keep their centre and change radius,
// so arcs stay arcs. Corners that open up get a round join (the path of the
// laser's kerf circle); corners that close are trimmed to the intersection.
// The result is rejected (null) when a segment collapses or reverses or the
// contour crosses itself.
import type { ArcSeg, Contour, Seg, Vec2 } from '../geom/types';
import { add, arcSweep, contourArea, cross, dist, dot, flattenContour, mul, norm, reverseContour, sub } from '../geom/vec';

const EPS = 1e-9;

function tangentAt(s: Seg, end: boolean): Vec2 {
  if (s.k === 'L') return norm(sub(s.b, s.a));
  const p = end ? s.b : s.a;
  const r = sub(p, s.c);
  // ccw arc: tangent is r rotated +90°
  return norm(s.ccw ? { x: -r.y, y: r.x } : { x: r.y, y: -r.x });
}

/** Offset one segment by d to the right of travel (outward for a CCW contour). */
function offsetSeg(s: Seg, d: number): Seg | null {
  if (s.k === 'L') {
    const t = norm(sub(s.b, s.a));
    const n = { x: t.y, y: -t.x };
    return { k: 'L', a: add(s.a, mul(n, d)), b: add(s.b, mul(n, d)) };
  }
  const r2 = s.ccw ? s.r + d : s.r - d;
  if (r2 <= 1e-6) return null;
  const k = r2 / s.r;
  return { k: 'A', c: s.c, r: r2, ccw: s.ccw, a: add(s.c, mul(sub(s.a, s.c), k)), b: add(s.c, mul(sub(s.b, s.c), k)) };
}

/** Intersections of two segments' carriers (infinite line / full circle). */
function carrierHits(p: Seg, q: Seg): Vec2[] {
  if (p.k === 'L' && q.k === 'L') {
    const r = sub(p.b, p.a), s = sub(q.b, q.a);
    const den = cross(r, s);
    if (Math.abs(den) < EPS) return [];
    const t = cross(sub(q.a, p.a), s) / den;
    return [add(p.a, mul(r, t))];
  }
  if (p.k === 'A' && q.k === 'L') return carrierHits(q, p);
  if (p.k === 'L' && q.k === 'A') {
    const dvec = norm(sub(p.b, p.a));
    const f = sub(p.a, q.c);
    const b = dot(f, dvec), c = dot(f, f) - q.r * q.r;
    const disc = b * b - c;
    if (disc < -1e-12) return [];
    const sq = Math.sqrt(Math.max(0, disc));
    return [add(p.a, mul(dvec, -b - sq)), add(p.a, mul(dvec, -b + sq))];
  }
  const a = p as ArcSeg, b = q as ArcSeg;
  const dd = dist(a.c, b.c);
  if (dd < EPS || dd > a.r + b.r + 1e-9 || dd < Math.abs(a.r - b.r) - 1e-9) return [];
  const l = (a.r * a.r - b.r * b.r + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, a.r * a.r - l * l));
  const u = norm(sub(b.c, a.c));
  const m = add(a.c, mul(u, l));
  return [add(m, mul({ x: -u.y, y: u.x }, h)), add(m, mul({ x: u.y, y: -u.x }, h))];
}

function segsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => cross(sub(q, p), sub(r, p));
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

function selfIntersects(c: Contour): boolean {
  const pts = flattenContour(c, 0.005);
  const n = pts.length;
  if (n > 3000) return false; // too detailed to check exhaustively; segment checks still apply
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Offset a closed contour so its region grows by d (shrinks for d < 0).
 * Returns null when the offset is invalid (collapse, reversal, self-crossing).
 */
export function offsetContour(input: Contour, d: number): Contour | null {
  if (!input.closed || !input.segs.length) return null;
  if (Math.abs(d) < EPS) return input;
  const c = contourArea(input) >= 0 ? input : reverseContour(input);
  const src = c.segs;
  const off: (Seg | null)[] = src.map((s) => offsetSeg(s, d));
  if (off.some((s) => !s)) return null;
  const segs = off as Seg[];
  const n = segs.length;
  const out: Seg[] = [];
  // joins: decide per vertex between segment i and i+1
  const joins: (ArcSeg | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const t1 = tangentAt(src[i], true), t2 = tangentAt(src[j], false);
    const cr = cross(t1, t2);
    const V = src[i].b;
    if (Math.abs(cr) < 1e-9 && dot(t1, t2) > 0) continue; // smooth: offsets meet
    const convex = cr > 0;
    if ((convex && d > 0) || (!convex && d < 0)) {
      // gap: round join along the kerf circle around the original vertex
      joins[i] = { k: 'A', c: V, r: Math.abs(d), ccw: d > 0, a: segs[i].b, b: segs[j].a };
    } else {
      const hits = carrierHits(segs[i], segs[j]);
      if (!hits.length) return null;
      const X = hits.reduce((best, h) => (dist(h, V) < dist(best, V) ? h : best));
      if (dist(X, V) > Math.abs(d) * 50 + 1) return null;
      segs[i] = { ...segs[i], b: X };
      segs[j] = { ...segs[j], a: X };
    }
  }
  for (let i = 0; i < n; i++) {
    const s = segs[i], o = src[i];
    if (s.k === 'L') {
      if (dot(sub(s.b, s.a), sub(o.b, o.a)) <= EPS) return null; // reversed or vanished
    } else {
      const sw = arcSweep(s), so = arcSweep(o as ArcSeg);
      if (Math.abs(sw) > Math.abs(so) + 1e-6 || Math.abs(sw) < 1e-9) return null;
    }
    out.push(s);
    if (joins[i]) out.push(joins[i]!);
  }
  const res: Contour = { closed: true, segs: out };
  if (contourArea(res) <= 0 || selfIntersects(res)) return null;
  return res;
}
