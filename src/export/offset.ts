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

/** Does segment cd touch segment ab (an end on the other, or collinear overlap)? */
function segsTouch(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => cross(sub(q, p), sub(r, p));
  const on = (p: Vec2, q: Vec2, r: Vec2) => {
    const l = dist(p, q);
    if (l < 1e-9) return dist(p, r) < 1e-7;
    return Math.abs(o(p, q, r)) / l < 1e-7 && dot(sub(r, p), sub(q, p)) >= -1e-9 && dot(sub(r, q), sub(p, q)) >= -1e-9;
  };
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

/** The offset touches or crosses itself (a touching ring is two rings meeting at a point: not cuttable as one). */
function selfIntersects(c: Contour): boolean {
  // points closer than 1e-5 mm are one point (a tiny join): neighbours meeting there are not a touch
  const pts: Vec2[] = [];
  for (const p of flattenContour(c, 0.005)) if (!pts.length || dist(p, pts[pts.length - 1]) > 1e-5) pts.push(p);
  while (pts.length > 3 && dist(pts[0], pts[pts.length - 1]) <= 1e-5) pts.pop();
  const n = pts.length;
  if (n > 3000) return false; // too detailed to check exhaustively; segment checks still apply
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const p = pts[j], q = pts[(j + 1) % n];
      if (Math.max(a.x, b.x) < Math.min(p.x, q.x) - 1e-7 || Math.max(p.x, q.x) < Math.min(a.x, b.x) - 1e-7 || Math.max(a.y, b.y) < Math.min(p.y, q.y) - 1e-7 || Math.max(p.y, q.y) < Math.min(a.y, b.y) - 1e-7) continue;
      if (segsCross(a, b, p, q) || segsTouch(a, b, p, q)) return true;
    }
  }
  return false;
}

/** Shorter than this (mm) a segment is float noise (a fold strip's 1e-5 overlap), not a feature. */
const MICRO = 1e-4;
const segLen = (s: Seg) => dist(s.a, s.b);

/**
 * Drop micro-segments (joining their neighbours across them) and merge
 * collinear line neighbours, so float noise in an outline does not stop its
 * offset (BUGFIX_PLAN B12). Arcs are kept as they are.
 */
export function tidyContour(segs: Seg[]): Seg[] {
  let out = segs.map((x) => ({ ...x }) as Seg);
  for (let guard = 0; guard < 4 && out.length > 3; guard++) {
    let changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const s = out[i];
      if (s.k !== 'L' || segLen(s) >= MICRO) continue;
      const n = out.length, prev = out[(i + n - 1) % n], next = out[(i + 1) % n];
      if (next.k === 'L') next.a = s.a;
      else if (prev.k === 'L') prev.b = s.b;
      else continue;
      out.splice(i--, 1);
      changed = true;
    }
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const n = out.length, s = out[i], next = out[(i + 1) % n];
      if (s.k !== 'L' || next.k !== 'L') continue;
      const u = sub(s.b, s.a), v = sub(next.b, next.a);
      const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
      if (lu < EPS || lv < EPS || Math.abs(cross(u, v)) / (lu * lv) > 1e-6 || dot(u, v) <= 0) continue;
      out[i] = { k: 'L', a: s.a, b: next.b };
      out.splice((i + 1) % n, 1);
      if ((i + 1) % n === 0) i--;
      i--;
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

/**
 * Offset a closed contour so its region grows by d (shrinks for d < 0).
 * Returns null when the offset is invalid (collapse, reversal, self-crossing).
 * A short line that vanishes at a closing corner is removed (its neighbours
 * meet across it) rather than failing the whole contour.
 */
export function offsetContour(input: Contour, d: number): Contour | null {
  if (!input.closed || !input.segs.length) return null;
  if (Math.abs(d) < EPS) return input;
  const c = contourArea(input) >= 0 ? input : reverseContour(input);
  let src = tidyContour(c.segs);
  for (let tries = 0; tries < 24; tries++) {
    const r = offsetOnce(src, d);
    if (r.ok) return r.contour;
    // a line that collapsed: drop it if it is short next to the offset and its neighbours are lines that meet
    const i = r.collapsed;
    if (i === undefined || src.length <= 3) return null;
    const n = src.length, prev = src[(i + n - 1) % n], s = src[i], next = src[(i + 1) % n];
    if (s.k !== 'L' || prev.k !== 'L' || next.k !== 'L') return null;
    // both its corners close for this offset (trimmed, not rounded): the offset neighbours then meet
    // where the neighbours' own lines do, offset; the segment had no part in the result
    const closing = (a: Seg, b: Seg) => {
      const cr = cross(tangentAt(a, true), tangentAt(b, false));
      return d > 0 ? cr < -1e-9 : cr > 1e-9;
    };
    const hits = carrierHits(prev, next);
    if (!hits.length && segLen(s) <= 2 * Math.abs(d)) {
      // a jog between parallel lines, smaller than the kerf: taper it into a shallow slope the offset can follow
      const back = Math.min(segLen(prev) / 2, 4 * Math.abs(d));
      if (back < 4 * segLen(s)) return null;
      const u = norm(sub(prev.b, prev.a));
      src = src.map((x) => ({ ...x }) as Seg);
      const pb = sub(prev.b, mul(u, back));
      (src[(i + n - 1) % n] as Seg).b = pb;
      src[i] = { k: 'L', a: pb, b: next.a };
      continue;
    }
    // a short line both of whose corners are trimmed: the offset neighbours meet across it
    if (segLen(s) > 4 * Math.abs(d) || !(closing(prev, s) && closing(s, next))) return null;
    if (!hits.length || dist(hits[0], s.a) > Math.abs(d) * 50 + segLen(s) + 1) return null;
    src = src.map((x) => ({ ...x }) as Seg);
    (src[(i + n - 1) % n] as Seg).b = hits[0];
    (src[(i + 1) % n] as Seg).a = hits[0];
    src.splice(i, 1);
  }
  return null;
}

function offsetOnce(src: Seg[], d: number): { ok: true; contour: Contour } | { ok: false; collapsed?: number } {
  const fail = (collapsed?: number) => ({ ok: false as const, collapsed });
  const off: (Seg | null)[] = src.map((s) => offsetSeg(s, d));
  if (off.some((s) => !s)) return fail();
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
      if (!hits.length) return fail();
      const X = hits.reduce((best, h) => (dist(h, V) < dist(best, V) ? h : best));
      if (dist(X, V) > Math.abs(d) * 50 + 1) return fail();
      segs[i] = { ...segs[i], b: X };
      segs[j] = { ...segs[j], a: X };
    }
  }
  for (let i = 0; i < n; i++) {
    const s = segs[i], o = src[i];
    if (s.k === 'L') {
      if (dot(sub(s.b, s.a), sub(o.b, o.a)) <= EPS) return fail(i); // reversed or vanished
    } else {
      const sw = arcSweep(s), so = arcSweep(o as ArcSeg);
      if (Math.abs(sw) > Math.abs(so) + 1e-6 || Math.abs(sw) < 1e-9) return fail();
    }
    out.push(s);
    if (joins[i]) out.push(joins[i]!);
  }
  const res: Contour = { closed: true, segs: out };
  if (contourArea(res) <= 0 || selfIntersects(res)) return fail();
  return { ok: true, contour: res };
}
