// Sketch edits (SKETCH_OVERHAUL.md §5.3): each works in place on a sketch (an
// immer draft in the store) and returns false, changing nothing, when refused.
// Locked points never move.
import type { P2 } from '../model/types';
import { addPt, addSeg, bounds, dropSeg, otherEnd, segsAt, selPts, degree, type Sketch, type SkPt, type SkSeg, type SkSel } from './model';
import { arcOf, bezAt, bezCtl, bezPts, bezSplit, isLineCorner, lerp, segAt, segPoints, tangentAt } from './flatten';

const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P2, b: P2): P2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P2, k: number): P2 => ({ x: a.x * k, y: a.y * k });
const len = (a: P2) => Math.hypot(a.x, a.y);
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const at = (sk: Sketch, id: string): P2 => ({ x: sk.pts[id].x, y: sk.pts[id].y });

/** An end given as an existing point id or a new position. */
export type End = string | P2;
const endId = (sk: Sketch, e: End): string => (typeof e === 'string' ? e : addPt(sk, { x: r9(e.x), y: r9(e.y) }));

// ---- moving points ----------------------------------------------------------

export function movePts(sk: Sketch, ids: string[], dx: number, dy: number): boolean {
  const list = ids.filter((id) => sk.pts[id]);
  if (list.some((id) => sk.pts[id].lock)) return false;
  for (const id of list) {
    sk.pts[id].x = r9(sk.pts[id].x + dx);
    sk.pts[id].y = r9(sk.pts[id].y + dy);
  }
  return true;
}

export function setPt(sk: Sketch, id: string, p: P2): boolean {
  const q = sk.pts[id];
  if (!q || q.lock) return false;
  q.x = r9(p.x);
  q.y = r9(p.y);
  return true;
}

// ---- splitting and removing ---------------------------------------------------

/**
 * A point on a segment at parameter t (a line by length, an arc by angle, a
 * Bezier by its own t): a line becomes two lines, an arc two arcs on its circle,
 * a Bezier two Beziers. Returns the new point's id ('' when refused).
 */
export function splitSeg(sk: Sketch, segId: string, t: number, use?: string): string {
  const s = sk.segs[segId];
  if (!s || !(t > 1e-9 && t < 1 - 1e-9)) return '';
  const a = at(sk, s.a), b = at(sk, s.b);
  let p: P2, s1: SkSeg, s2: SkSeg;
  const flag = s.cons ? { cons: true as const } : {};
  let id = use ?? '';
  if (s.k === 'line') {
    p = lerp(a, b, t);
    id ||= addPt(sk, { x: r9(p.x), y: r9(p.y) });
    s1 = { a: s.a, b: id, k: 'line', ...flag };
    s2 = { a: id, b: s.b, k: 'line', ...flag };
  } else if (s.k === 'arc') {
    const sw = 4 * Math.atan(s.bulge);
    p = segAt(sk, segId, t);
    id ||= addPt(sk, { x: r9(p.x), y: r9(p.y) });
    s1 = { a: s.a, b: id, k: 'arc', bulge: Math.tan((sw * t) / 4), ...flag };
    s2 = { a: id, b: s.b, k: 'arc', bulge: Math.tan((sw * (1 - t)) / 4), ...flag };
  } else {
    const [L, R] = bezSplit(bezCtl(sk, segId)!, t);
    p = L[3];
    id ||= addPt(sk, { x: r9(p.x), y: r9(p.y), smooth: true });
    s1 = { a: s.a, b: id, k: 'bez', ha: sub(L[1], L[0]), hb: sub(L[2], L[3]), ...flag };
    s2 = { a: id, b: s.b, k: 'bez', ha: sub(R[1], R[0]), hb: sub(R[2], R[3]), ...flag };
  }
  // the pieces take the segment's id with a or b added, in its place in the drawing order
  const i = sk.order.indexOf(segId);
  delete sk.segs[segId];
  const g1 = freeId(sk, `${segId}a`), g2 = freeId(sk, `${segId}b`);
  sk.segs[g1] = s1;
  sk.segs[g2] = s2;
  sk.order.splice(i, 1, g1, g2);
  return id;
}
const freeId = (sk: Sketch, want: string) => {
  let id = want;
  while (sk.segs[id]) id += 'x';
  return id;
};
/** The first piece of a segment split by splitSeg (the part from its a end to the new point). */
export const firstPiece = (sk: Sketch, segId: string, pt: string) => sk.order.find((g) => g.startsWith(segId) && sk.segs[g].b === pt) ?? segId;

/** Remove a point: where two segments meet they are joined (a line, or a Bezier if either was curved); otherwise its segments go too. */
export function removePt(sk: Sketch, id: string): boolean {
  if (!sk.pts[id]) return false;
  const gs = segsAt(sk, id);
  if (gs.length === 2 && gs.every((g) => sk.segs[g].a !== sk.segs[g].b)) {
    const [g1, g2] = gs.map((g) => sk.segs[g]);
    const p = otherEnd(sk, gs[0], id), q = otherEnd(sk, gs[1], id);
    if (p === q) {
      // two segments between the same two points: removing the point leaves a single line there
      for (const g of gs) dropSeg(sk, g);
      delete sk.pts[id];
      return true;
    }
    const curved = g1.k !== 'line' || g2.k !== 'line';
    const cons = g1.cons && g2.cons;
    const i = Math.min(sk.order.indexOf(gs[0]), sk.order.indexOf(gs[1]));
    let seg: SkSeg;
    if (!curved) seg = { a: p, b: q, k: 'line' };
    else {
      // keep each side's far handle (a third of the new chord where it had none)
      const P = at(sk, p), Q = at(sk, q);
      const far = (g: string, end: string, toward: P2): P2 => {
        const s = sk.segs[g];
        if (s.k === 'bez') return s.a === end ? s.ha : s.hb;
        return mul(sub(toward, at(sk, end)), 1 / 3);
      };
      seg = { a: p, b: q, k: 'bez', ha: far(gs[0], p, Q), hb: far(gs[1], q, P) };
    }
    if (cons) seg.cons = true;
    for (const g of gs) dropSeg(sk, g);
    delete sk.pts[id];
    const nid = addSeg(sk, seg);
    sk.order.pop();
    sk.order.splice(Math.max(0, i), 0, nid);
    return true;
  }
  for (const g of gs) dropSeg(sk, g);
  delete sk.pts[id];
  return true;
}

/** Remove a segment; its ends go too when nothing else uses them. */
export function eraseSeg(sk: Sketch, segId: string): boolean {
  const s = sk.segs[segId];
  if (!s) return false;
  dropSeg(sk, segId);
  for (const p of [s.a, s.b]) if (sk.pts[p] && !segsAt(sk, p).length) delete sk.pts[p];
  return true;
}

/** Move every segment end from `drop` to `keep`; zero-length and duplicate segments go. */
export function weld(sk: Sketch, keep: string, drop: string): boolean {
  if (keep === drop || !sk.pts[keep] || !sk.pts[drop]) return false;
  for (const g of [...sk.order]) {
    const s = sk.segs[g];
    if (s.a === drop) s.a = keep;
    if (s.b === drop) s.b = keep;
  }
  delete sk.pts[drop];
  dedupe(sk);
  return true;
}

/** Remove zero-length segments and straight lines that repeat another between the same points. */
function dedupe(sk: Sketch) {
  const seen = new Set<string>();
  for (const g of [...sk.order]) {
    const s = sk.segs[g];
    if (s.a === s.b && s.k !== 'arc') {
      dropSeg(sk, g);
      continue;
    }
    if (s.k !== 'line') continue;
    const key = [s.a, s.b].sort().join('|') + (s.cons ? 'c' : '');
    if (seen.has(key)) dropSeg(sk, g);
    else seen.add(key);
  }
}

// ---- adding segments ----------------------------------------------------------

/** Points along a segment with their parameters (for crossings). */
function paramPolyline(sk: Sketch, g: string): { p: P2; t: number }[] {
  const s = sk.segs[g];
  if (s.k === 'line') return [{ p: at(sk, s.a), t: 0 }, { p: at(sk, s.b), t: 1 }];
  if (s.k === 'arc') {
    const pts = segPoints(sk, g, 0.01);
    return pts.map((p, i) => ({ p, t: i / (pts.length - 1) }));
  }
  const { pts, ts } = bezPts(bezCtl(sk, g)!, 0.01);
  return pts.map((p, i) => ({ p, t: ts[i] }));
}

/** Refine a crossing so both segments meet exactly: Newton's method on segAt(g, t) = segAt(h, u). */
function refinePair(sk: Sketch, g: string, t: number, h: string, u: number): [number, number] {
  const eps = 1e-7;
  for (let i = 0; i < 12; i++) {
    const P = segAt(sk, g, t), Q = segAt(sk, h, u);
    const fx = P.x - Q.x, fy = P.y - Q.y;
    if (Math.hypot(fx, fy) < 1e-12) break;
    const Pt = sub(segAt(sk, g, t + eps), P), Qu = sub(segAt(sk, h, u + eps), Q);
    // [Pt/eps, −Qu/eps] [dt, du] = −f
    const a = Pt.x / eps, b = -Qu.x / eps, c = Pt.y / eps, d = -Qu.y / eps;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-14) break;
    const dt = (-fx * d + fy * b) / det, du = (-a * fy + c * fx) / det;
    t = Math.max(0, Math.min(1, t + dt));
    u = Math.max(0, Math.min(1, u + du));
  }
  return [t, u];
}

/** Where two segments cross, away from their shared ends: parameters on each and the point. */
function crossings(sk: Sketch, g: string, h: string): { t: number; u: number; p: P2 }[] {
  const A = paramPolyline(sk, g), B = paramPolyline(sk, h);
  const out: { t: number; u: number; p: P2 }[] = [];
  for (let i = 0; i + 1 < A.length; i++)
    for (let j = 0; j + 1 < B.length; j++) {
      const a = A[i], a2 = A[i + 1], b = B[j], b2 = B[j + 1];
      const r = sub(a2.p, a.p), s = sub(b2.p, b.p);
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-14) continue;
      const q = sub(b.p, a.p);
      const tt = (q.x * s.y - q.y * s.x) / den, uu = (q.x * r.y - q.y * r.x) / den;
      if (tt < -1e-9 || tt > 1 + 1e-9 || uu < -1e-9 || uu > 1 + 1e-9) continue;
      const [t, u] = refinePair(sk, g, a.t + (a2.t - a.t) * tt, h, b.t + (b2.t - b.t) * uu);
      const p = segAt(sk, h, u);
      if (out.some((o) => Math.hypot(o.p.x - p.x, o.p.y - p.y) < 1e-6)) continue;
      out.push({ t, u, p });
    }
  // not at either segment's ends
  const S = sk.segs[g], H = sk.segs[h];
  const ends = [S.a, S.b, H.a, H.b].map((id) => at(sk, id));
  return out.filter((o) => ends.every((e) => Math.hypot(e.x - o.p.x, e.y - o.p.y) > 1e-6));
}

/**
 * Put a shared point wherever this segment crosses an existing non-construction
 * one. Construction segments are never cut and never cut others. Returns the
 * ids of the pieces the segment became.
 */
export function splitCrossings(sk: Sketch, segId: string): string[] {
  const me = sk.segs[segId];
  if (!me || me.cons) return [segId];
  const hits: { t: number; pt: string }[] = [];
  for (const h of [...sk.order]) {
    if (h === segId || !sk.segs[h] || sk.segs[h].cons) continue;
    const xs = crossings(sk, segId, h).sort((p, q) => q.u - p.u);
    let cur = h, scale = 1;
    // split the other segment from its far end back, so earlier parameters stay valid
    for (const x of xs) {
      const id = splitSeg(sk, cur, x.u / scale);
      if (!id) continue;
      if (!sk.pts[id].lock) (sk.pts[id].x = r9(x.p.x)), (sk.pts[id].y = r9(x.p.y));
      cur = firstPiece(sk, cur, id);
      scale = x.u;
      hits.push({ t: x.t, pt: id });
    }
  }
  if (!hits.length) return [segId];
  // now cut this segment at each shared point, from its far end back
  hits.sort((p, q) => q.t - p.t);
  let cur = segId, scale = 1;
  for (const hit of hits) {
    const id = splitSeg(sk, cur, hit.t / scale, hit.pt);
    if (!id) continue;
    cur = firstPiece(sk, cur, id);
    scale = hit.t;
  }
  return sk.order.filter((g) => g.startsWith(segId));
}

export type Added = { seg: string; segs: string[]; a: string; b: string };

function added(sk: Sketch, seg: SkSeg, opts?: { cons?: boolean }): Added {
  if (opts?.cons) seg.cons = true;
  const id = addSeg(sk, seg);
  const segs = splitCrossings(sk, id);
  return { seg: id, segs, a: seg.a, b: seg.b };
}

/** A straight line between two ends (existing point ids or new positions). */
export function addLine(sk: Sketch, a: End, b: End, opts?: { cons?: boolean }): Added {
  const A = endId(sk, a), B = endId(sk, b);
  return added(sk, { a: A, b: B, k: 'line' }, opts);
}
export function addArc(sk: Sketch, a: End, b: End, bulge: number, opts?: { cons?: boolean }): Added {
  const A = endId(sk, a), B = endId(sk, b);
  return added(sk, { a: A, b: B, k: 'arc', bulge }, opts);
}
export function addBez(sk: Sketch, a: End, b: End, ha: P2, hb: P2, opts?: { cons?: boolean }): Added {
  const A = endId(sk, a), B = endId(sk, b);
  return added(sk, { a: A, b: B, k: 'bez', ha: { ...ha }, hb: { ...hb } }, opts);
}

// ---- curves -------------------------------------------------------------------

/** Curve line: a handle a third of the way along the chord at each end. Straight line: handles dropped (an arc becomes its chord). */
export function setSegKind(sk: Sketch, ids: string[], k: 'line' | 'bez'): boolean {
  let any = false;
  for (const g of ids) {
    const s = sk.segs[g];
    if (!s || s.k === k) continue;
    const a = at(sk, s.a), b = at(sk, s.b);
    const base = { a: s.a, b: s.b, ...(s.cons ? { cons: true as const } : {}) };
    if (k === 'line') sk.segs[g] = { ...base, k: 'line' };
    else if (s.k === 'arc') {
      // an arc as one Bezier through its middle (close for small sweeps)
      const sw = 4 * Math.atan(s.bulge), f = arcOf(a, b, s.bulge);
      const kk = (4 / 3) * Math.abs(Math.tan(sw / 4)) * f.r;
      sk.segs[g] = { ...base, k: 'bez', ha: mul(tangentAt(sk, g, s.a), kk), hb: mul(tangentAt(sk, g, s.b), kk) };
    } else sk.segs[g] = { ...base, k: 'bez', ha: mul(sub(b, a), 1 / 3), hb: mul(sub(a, b), 1 / 3) };
    any = true;
  }
  return any;
}

/** The handle a segment has at one of its ends (a Bezier's), or null. */
function handleAt(sk: Sketch, g: string, p: string): P2 | null {
  const s = sk.segs[g];
  if (s.k !== 'bez') return null;
  return s.a === p ? s.ha : s.hb;
}
function setHandle(sk: Sketch, g: string, p: string, h: P2) {
  const s = sk.segs[g];
  if (s.k !== 'bez') return;
  if (s.a === p) s.ha = { x: r9(h.x), y: r9(h.y) };
  else s.hb = { x: r9(h.x), y: r9(h.y) };
}

/** Smooth points: the two handles at each point are put in line, their lengths kept (lines on either side get handles). */
export function setSmooth(sk: Sketch, ptIds: string[], on: boolean): boolean {
  let any = false;
  for (const id of ptIds) {
    const p = sk.pts[id];
    if (!p) continue;
    if (!on) {
      if (p.smooth) (delete p.smooth, (any = true));
      continue;
    }
    const gs = segsAt(sk, id, { cons: false });
    if (gs.length !== 2) continue;
    // lines become curves so the point can be smooth
    for (const g of gs) if (sk.segs[g].k === 'line') setSegKind(sk, [g], 'bez');
    if (gs.some((g) => sk.segs[g].k !== 'bez')) continue;
    const h1 = handleAt(sk, gs[0], id)!, h2 = handleAt(sk, gs[1], id)!;
    const l1 = len(h1) || len(sub(at(sk, otherEnd(sk, gs[0], id)), p)) / 3;
    const l2 = len(h2) || len(sub(at(sk, otherEnd(sk, gs[1], id)), p)) / 3;
    // the direction halfway between the first handle and the second one reversed
    let d = sub(mul(h1, 1 / (len(h1) || 1)), mul(h2, 1 / (len(h2) || 1)));
    if (len(d) < 1e-9) d = { x: -h1.y, y: h1.x };
    const u = mul(d, 1 / (len(d) || 1));
    setHandle(sk, gs[0], id, mul(u, l1));
    setHandle(sk, gs[1], id, mul(u, -l2));
    p.smooth = true;
    any = true;
  }
  return any;
}

/** Catmull-Rom handles through an ordered run of points (the segments between them become curves). */
export function curveThrough(sk: Sketch, ptIds: string[]): boolean {
  const ids = ptIds.filter((id) => sk.pts[id]);
  if (ids.length < 3) return false;
  const between = (p: string, q: string) => sk.order.find((g) => (sk.segs[g].a === p && sk.segs[g].b === q) || (sk.segs[g].a === q && sk.segs[g].b === p));
  const closed = !!between(ids[ids.length - 1], ids[0]) && ids.length >= 3;
  const run = closed ? [...ids, ids[0]] : ids;
  const gs: string[] = [];
  for (let i = 0; i + 1 < run.length; i++) {
    const g = between(run[i], run[i + 1]);
    if (!g) return false;
    gs.push(g);
  }
  setSegKind(sk, gs, 'bez');
  const n = ids.length;
  const P = (i: number) => at(sk, ids[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]);
  ids.forEach((id, i) => {
    const T = mul(sub(P(i + 1), P(i - 1)), 0.5);
    const next = closed || i < n - 1 ? gs[i % gs.length] : null;
    const prev = closed || i > 0 ? gs[(i - 1 + gs.length) % gs.length] : null;
    if (next) setHandle(sk, next, id, mul(T, 1 / 3));
    if (prev) setHandle(sk, prev, id, mul(T, -1 / 3));
    if (next && prev) sk.pts[id].smooth = true;
  });
  return true;
}

/** Round (`r`) or chamfer (`ch`) corners, or make them sharp (null). Returns how many points were skipped (not a corner between two straight lines). */
export function setCorner(sk: Sketch, ptIds: string[], v: { r: number } | { ch: number } | null): number {
  let skipped = 0;
  for (const id of ptIds) {
    const p = sk.pts[id];
    if (!p) continue;
    if (v && !isLineCorner(sk, id)) {
      skipped++;
      continue;
    }
    delete p.r;
    delete p.ch;
    if (v && 'r' in v && v.r > 0) p.r = v.r;
    if (v && 'ch' in v && v.ch > 0) p.ch = v.ch;
  }
  return skipped;
}

// ---- transforms -----------------------------------------------------------------

/** An affine map [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Affine = [number, number, number, number, number, number];
const apply = (M: Affine, p: P2): P2 => ({ x: M[0] * p.x + M[2] * p.y + M[4], y: M[1] * p.x + M[3] * p.y + M[5] });
const applyV = (M: Affine, v: P2): P2 => ({ x: M[0] * v.x + M[2] * v.y, y: M[1] * v.x + M[3] * v.y });
/** Does the map keep shapes (a turn, a uniform scale, a mirror and a move)? Its scale, or null. */
export function similarity(M: Affine): number | null {
  const [a, b, c, d] = M;
  const rot = Math.abs(a - d) < 1e-9 && Math.abs(b + c) < 1e-9;
  const refl = Math.abs(a + d) < 1e-9 && Math.abs(b - c) < 1e-9;
  return rot || refl ? Math.hypot(a, b) : null;
}

/** An arc as Beziers, one per 90° of sweep at most; returns the points it added. */
function arcToBeziers(sk: Sketch, g: string): string[] {
  const s = sk.segs[g];
  if (s.k !== 'arc') return [];
  const made: string[] = [];
  const sw = 4 * Math.atan(s.bulge);
  const n = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2) - 1e-9));
  let cur = g;
  const parts = [g];
  // n arcs of equal sweep: split off the first piece each time
  for (let i = n; i >= 2; i--) {
    const id = splitSeg(sk, cur, 1 / i);
    if (!id) break;
    sk.pts[id].smooth = true;
    made.push(id);
    const first = firstPiece(sk, cur, id);
    const rest = sk.order.find((x) => x.startsWith(cur) && x !== first && sk.segs[x].a === id)!;
    parts.push(first, rest);
    cur = rest;
  }
  for (const x of parts) if (sk.segs[x]?.k === 'arc') setSegKind(sk, [x], 'bez');
  return made;
}

/** Apply an affine map to the selected points with their handles and arcs. Refused when a selected point is locked. */
export function transform(sk: Sketch, sel: Partial<SkSel>, M: Affine): boolean {
  const ids = selPts(sk, sel);
  if (!ids.length) return false;
  if (ids.some((id) => sk.pts[id].lock)) return false;
  const k = similarity(M);
  const flip = M[0] * M[3] - M[1] * M[2] < 0;
  const moved = new Set(ids);
  // arcs carried whole: kept (a mirror turns them the other way) under a similarity, else curves
  for (const g of [...sk.order]) {
    const s = sk.segs[g];
    if (!s || s.k !== 'arc' || !moved.has(s.a) || !moved.has(s.b)) continue;
    if (k === null) for (const id of arcToBeziers(sk, g)) moved.add(id);
  }
  for (const g of sk.order) {
    const s = sk.segs[g];
    if (s.k === 'arc' && moved.has(s.a) && moved.has(s.b) && flip) s.bulge = -s.bulge;
    if (s.k !== 'bez') continue;
    if (moved.has(s.a)) s.ha = applyV(M, s.ha);
    if (moved.has(s.b)) s.hb = applyV(M, s.hb);
  }
  for (const id of moved) {
    const p = sk.pts[id];
    const q = apply(M, p);
    p.x = r9(q.x);
    p.y = r9(q.y);
    if (k !== null) {
      if (p.r) p.r = r9(p.r * k);
      if (p.ch) p.ch = r9(p.ch * k);
    }
  }
  return true;
}

export function scaleSel(sk: Sketch, sel: Partial<SkSel>, anchor: P2, sx: number, sy: number): boolean {
  return transform(sk, sel, [sx, 0, 0, sy, anchor.x - sx * anchor.x, anchor.y - sy * anchor.y]);
}
export function rotateSel(sk: Sketch, sel: Partial<SkSel>, centre: P2, deg: number): boolean {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return transform(sk, sel, [c, s, -s, c, centre.x - c * centre.x + s * centre.y, centre.y - s * centre.x - c * centre.y]);
}
/** Scale the whole sketch about its origin. */
export function scaleSketch(sk: Sketch, sx: number, sy: number): boolean {
  const all = Object.keys(sk.pts);
  const locked = all.filter((id) => sk.pts[id].lock);
  // a whole-sketch scale (the shape's size) ignores locks
  for (const id of locked) delete sk.pts[id].lock;
  const ok = scaleSel(sk, { pts: all }, { x: 0, y: 0 }, sx, sy);
  for (const id of locked) sk.pts[id].lock = true;
  return ok;
}

/** Mirrored copies of the selection across the line a–b; points on the line are shared. Returns the copies. */
export function mirror(sk: Sketch, sel: Partial<SkSel>, axis: { a: P2; b: P2 }): SkSel {
  const d = sub(axis.b, axis.a);
  const L = len(d);
  if (L < 1e-9) return { pts: [], segs: [] };
  const u = mul(d, 1 / L);
  // reflection: v' = 2 (v·u) u − v about a
  const M: Affine = [2 * u.x * u.x - 1, 2 * u.x * u.y, 2 * u.x * u.y, 2 * u.y * u.y - 1, 0, 0];
  const refl = (p: P2) => add(axis.a, applyV(M, sub(p, axis.a)));
  const onAxis = (p: P2) => Math.abs((p.x - axis.a.x) * u.y - (p.y - axis.a.y) * u.x) < 1e-6;
  const ids = selPts(sk, sel);
  const map = new Map<string, string>();
  for (const id of ids) {
    const p = sk.pts[id];
    if (onAxis(p)) map.set(id, id);
    else {
      const q = refl(p);
      const { lock: _l, ...rest } = p;
      map.set(id, addPt(sk, { ...rest, x: r9(q.x), y: r9(q.y) } as SkPt));
    }
  }
  const segs = sk.order.filter((g) => map.has(sk.segs[g].a) && map.has(sk.segs[g].b) && (sel.segs?.includes(g) || (sel.pts?.includes(sk.segs[g].a) && sel.pts?.includes(sk.segs[g].b))));
  const out: SkSel = { pts: [...new Set([...map.values()])].filter((x) => !ids.includes(x) || map.get(x) === x), segs: [] };
  for (const g of segs) {
    const s = sk.segs[g];
    const a = map.get(s.a)!, b = map.get(s.b)!;
    if (a === s.a && b === s.b) continue;
    const base = { a, b, ...(s.cons ? { cons: true as const } : {}) };
    const n: SkSeg = s.k === 'line' ? { ...base, k: 'line' } : s.k === 'arc' ? { ...base, k: 'arc', bulge: -s.bulge } : { ...base, k: 'bez', ha: applyV(M, s.ha), hb: applyV(M, s.hb) };
    out.segs.push(addSeg(sk, n));
  }
  dedupe(sk);
  return out;
}

// ---- lengths and angles -------------------------------------------------------------

/** The points reached from `from` without passing `stop` or a locked point (and not along `skip`). */
function reach(sk: Sketch, from: string, stop: string, skip: string): string[] {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const p = stack.pop()!;
    for (const g of segsAt(sk, p)) {
      if (g === skip) continue;
      const q = otherEnd(sk, g, p);
      if (q === stop || seen.has(q) || sk.pts[q].lock) continue;
      seen.add(q);
      stack.push(q);
    }
  }
  return [...seen];
}
/**
 * What hangs on `from`: the points reached from it (not past `stop` or a locked
 * point, not along `skip`) that cannot also be reached from `stop` without
 * passing `from`. On a closed outline that is `from` alone; on an open run, the
 * rest of the run.
 */
function carried(sk: Sketch, from: string, stop: string, skip: string): string[] {
  const mine = reach(sk, from, stop, skip);
  const theirs = new Set(reach(sk, stop, from, skip));
  return mine.filter((p) => p === from || !theirs.has(p));
}

/**
 * Set a straight line's length: the end that is not `fixed` moves along the line
 * and carries every point reached from it (not past a locked point or the fixed
 * one). With `both`, the line grows from its middle. Refused when a moving end is locked.
 */
export function setLength(sk: Sketch, segId: string, L: number, o: { fixed: string; both?: boolean }): boolean {
  const s = sk.segs[segId];
  if (!s || s.k !== 'line' || !(L > 0)) return false;
  const fixed = o.fixed === s.b ? s.b : s.a;
  const moving = fixed === s.a ? s.b : s.a;
  const F = at(sk, fixed), Mv = at(sk, moving);
  const cur = len(sub(Mv, F));
  if (cur < 1e-9) return false;
  const u = mul(sub(Mv, F), 1 / cur);
  if (o.both) {
    if (sk.pts[fixed].lock || sk.pts[moving].lock) return false;
    const dd = (L - cur) / 2;
    const A = carried(sk, moving, fixed, segId), B = carried(sk, fixed, moving, segId).filter((p) => !A.includes(p));
    for (const p of A) (sk.pts[p].x = r9(sk.pts[p].x + u.x * dd)), (sk.pts[p].y = r9(sk.pts[p].y + u.y * dd));
    for (const p of B) (sk.pts[p].x = r9(sk.pts[p].x - u.x * dd)), (sk.pts[p].y = r9(sk.pts[p].y - u.y * dd));
    return true;
  }
  if (sk.pts[moving].lock) return false;
  const dd = L - cur;
  for (const p of carried(sk, moving, fixed, segId)) {
    sk.pts[p].x = r9(sk.pts[p].x + u.x * dd);
    sk.pts[p].y = r9(sk.pts[p].y + u.y * dd);
  }
  return true;
}

/** The inside angle (degrees) at a point where two straight lines meet on a closed outline; null otherwise. */
export function cornerAngleOf(sk: Sketch, ptId: string): number | null {
  const gs = segsAt(sk, ptId, { cons: false });
  if (gs.length !== 2 || gs.some((g) => sk.segs[g].k !== 'line')) return null;
  const p = at(sk, ptId);
  const a = at(sk, otherEnd(sk, gs[0], ptId)), b = at(sk, otherEnd(sk, gs[1], ptId));
  const u = sub(a, p), v = sub(b, p);
  let ang = (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / ((len(u) || 1) * (len(v) || 1))))) * 180) / Math.PI;
  // on a closed outline: the side the outline's area is on
  const loop = loopThrough(sk, ptId, gs);
  if (loop) {
    let A = 0;
    for (let i = 0; i < loop.length; i++) {
      const P = loop[i], Q = loop[(i + 1) % loop.length];
      A += P.x * Q.y - Q.x * P.y;
    }
    // loop runs p → b … a → p: the inside is on the left when A > 0
    const turn = (b.x - p.x) * (a.y - p.y) - (b.y - p.y) * (a.x - p.x);
    const convex = A > 0 ? turn > 0 : turn < 0;
    if (!convex) ang = 360 - ang;
  }
  return ang;
}
/** The closed run of points through a degree-2 point, from it along gs[1] back along gs[0]; null if it is open. */
function loopThrough(sk: Sketch, ptId: string, gs: string[]): P2[] | null {
  const out: P2[] = [at(sk, ptId)];
  let p = ptId, g = gs[1];
  for (let i = 0; i < 100000; i++) {
    const q = otherEnd(sk, g, p);
    if (q === ptId) return out;
    out.push(at(sk, q));
    if (degree(sk, q, { cons: false }) !== 2) return null;
    const next = segsAt(sk, q, { cons: false }).find((x) => x !== g);
    if (!next) return null;
    p = q;
    g = next;
  }
  return null;
}

/**
 * Set the angle at a corner by turning one of its lines about it; the line's far
 * end carries what hangs on it (as setLength). Its length is kept.
 */
export function setAngle(sk: Sketch, ptId: string, deg: number, turnSeg: string): boolean {
  const cur = cornerAngleOf(sk, ptId);
  const s = sk.segs[turnSeg];
  if (cur === null || !s || (s.a !== ptId && s.b !== ptId)) return false;
  const far = otherEnd(sk, turnSeg, ptId);
  if (sk.pts[far].lock) return false;
  const moving = carried(sk, far, ptId, turnSeg);
  const c = at(sk, ptId);
  const before = moving.map((id) => ({ id, p: at(sk, id) }));
  const tryTurn = (d: number) => {
    const r = (d * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    for (const { id, p } of before) {
      const v = sub(p, c);
      sk.pts[id].x = r9(c.x + v.x * co - v.y * si);
      sk.pts[id].y = r9(c.y + v.x * si + v.y * co);
    }
    return Math.abs((cornerAngleOf(sk, ptId) ?? 0) - deg);
  };
  const d = deg - cur;
  const e1 = tryTurn(d);
  if (e1 < 1e-6) return true;
  const e2 = tryTurn(-d);
  if (e2 <= e1) return true;
  tryTurn(d);
  return true;
}

// ---- arranging ------------------------------------------------------------------------

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
/** Align groups of points (outlines) to the box around them all. */
export function align(sk: Sketch, groups: string[][], mode: AlignMode): boolean {
  const gs = groups.filter((g) => g.length);
  if (gs.length < 2) return false;
  if (gs.some((g) => g.some((id) => sk.pts[id]?.lock))) return false;
  const all = bounds(sk, gs.flat())!;
  for (const g of gs) {
    const b = bounds(sk, g)!;
    let dx = 0, dy = 0;
    if (mode === 'left') dx = all.min.x - b.min.x;
    if (mode === 'right') dx = all.max.x - b.max.x;
    if (mode === 'hcenter') dx = (all.min.x + all.max.x) / 2 - (b.min.x + b.max.x) / 2;
    if (mode === 'bottom') dy = all.min.y - b.min.y;
    if (mode === 'top') dy = all.max.y - b.max.y;
    if (mode === 'vcenter') dy = (all.min.y + all.max.y) / 2 - (b.min.y + b.max.y) / 2;
    movePts(sk, g, dx, dy);
  }
  return true;
}

/** Copies of the selection (its points and the segments between them), moved by (dx, dy). */
export function duplicate(sk: Sketch, sel: Partial<SkSel>, dx: number, dy: number): SkSel {
  const ids = selPts(sk, sel);
  const map = new Map<string, string>();
  for (const id of ids) {
    const { lock: _l, ...p } = sk.pts[id];
    map.set(id, addPt(sk, { ...p, x: r9(p.x + dx), y: r9(p.y + dy) } as SkPt));
  }
  const segs: string[] = [];
  for (const g of [...sk.order]) {
    const s = sk.segs[g];
    if (!map.has(s.a) || !map.has(s.b)) continue;
    if (sel.segs && !sel.segs.includes(g) && !(sel.pts?.includes(s.a) && sel.pts?.includes(s.b))) continue;
    segs.push(addSeg(sk, { ...JSON.parse(JSON.stringify(s)), a: map.get(s.a)!, b: map.get(s.b)! }));
  }
  return { pts: [...map.values()], segs };
}

export function setCons(sk: Sketch, segIds: string[], on: boolean): boolean {
  for (const g of segIds) {
    const s = sk.segs[g];
    if (!s) continue;
    if (on) s.cons = true;
    else delete s.cons;
  }
  if (!on) for (const g of segIds) if (sk.segs[g]) splitCrossings(sk, g);
  return true;
}
export function setLock(sk: Sketch, ptIds: string[], on: boolean): boolean {
  for (const id of ptIds) {
    const p = sk.pts[id];
    if (!p) continue;
    if (on) p.lock = true;
    else delete p.lock;
  }
  return true;
}

// ---- ready-made outlines ---------------------------------------------------------------

export type StampKind = 'rect' | 'circle' | 'oval' | 'halfcircle' | 'triangle' | 'hexagon' | 'polygon' | 'star';
export const STAMPS: StampKind[] = ['rect', 'circle', 'oval', 'halfcircle', 'triangle', 'hexagon', 'polygon', 'star'];

/** A closed run of lines through these positions. */
function polyOutline(sk: Sketch, pts: P2[]): SkSel {
  const ids = pts.map((p) => addPt(sk, { x: r9(p.x), y: r9(p.y) }));
  const segs = ids.map((id, i) => addSeg(sk, { a: id, b: ids[(i + 1) % ids.length], k: 'line' }));
  return { pts: ids, segs };
}
const ring = (n: number, r: number, at: P2, a0 = Math.PI / 2): P2[] => Array.from({ length: n }, (_, i) => ({ x: at.x + r * Math.cos(a0 + (2 * Math.PI * i) / n), y: at.y + r * Math.sin(a0 + (2 * Math.PI * i) / n) }));

/**
 * A ready-made outline as ordinary points and segments, centred at `at`, `size`
 * mm across (20 by default). Polygons take 3–24 sides; stars 3–24 points with
 * an inner size of 10–90 %.
 */
export function stamp(sk: Sketch, kind: StampKind, at: P2, opts: { size?: number; w?: number; h?: number; n?: number; inner?: number } = {}): SkSel {
  const S = opts.size ?? 20, W = opts.w ?? S, H = opts.h ?? S;
  const n = Math.max(3, Math.min(24, Math.round(opts.n ?? 5)));
  let out: SkSel;
  switch (kind) {
    case 'rect':
      out = polyOutline(sk, [
        { x: at.x - W / 2, y: at.y - H / 2 },
        { x: at.x + W / 2, y: at.y - H / 2 },
        { x: at.x + W / 2, y: at.y + H / 2 },
        { x: at.x - W / 2, y: at.y + H / 2 },
      ]);
      break;
    case 'circle': {
      const a = addPt(sk, { x: r9(at.x - W / 2), y: at.y, smooth: true }), b = addPt(sk, { x: r9(at.x + W / 2), y: at.y, smooth: true });
      out = { pts: [a, b], segs: [addSeg(sk, { a, b, k: 'arc', bulge: 1 }), addSeg(sk, { a: b, b: a, k: 'arc', bulge: 1 })] };
      break;
    }
    case 'oval': {
      const K = 0.5522847498;
      const P = [
        { x: at.x + W / 2, y: at.y },
        { x: at.x, y: at.y + H / 2 },
        { x: at.x - W / 2, y: at.y },
        { x: at.x, y: at.y - H / 2 },
      ];
      const ids = P.map((p) => addPt(sk, { x: r9(p.x), y: r9(p.y), smooth: true }));
      // tangents counter-clockwise at each point
      const T = [
        { x: 0, y: (H / 2) * K },
        { x: (-W / 2) * K, y: 0 },
        { x: 0, y: (-H / 2) * K },
        { x: (W / 2) * K, y: 0 },
      ];
      const segs = ids.map((id, i) => addSeg(sk, { a: id, b: ids[(i + 1) % 4], k: 'bez', ha: T[i], hb: mul(T[(i + 1) % 4], -1) }));
      out = { pts: ids, segs };
      break;
    }
    case 'halfcircle': {
      const a = addPt(sk, { x: r9(at.x + W / 2), y: at.y }), b = addPt(sk, { x: r9(at.x - W / 2), y: at.y });
      out = { pts: [a, b], segs: [addSeg(sk, { a, b, k: 'arc', bulge: 1 }), addSeg(sk, { a: b, b: a, k: 'line' })] };
      break;
    }
    case 'triangle':
      out = polyOutline(sk, ring(3, S / 2, at));
      break;
    case 'hexagon':
      out = polyOutline(sk, ring(6, S / 2, at, 0));
      break;
    case 'polygon':
      out = polyOutline(sk, ring(n, S / 2, at));
      break;
    case 'star': {
      const inner = Math.max(0.1, Math.min(0.9, opts.inner ?? 0.5));
      const o = ring(n, S / 2, at), i = ring(n, (S / 2) * inner, at, Math.PI / 2 + Math.PI / n);
      out = polyOutline(sk, o.flatMap((p, k) => [p, i[k]]));
      break;
    }
  }
  return out;
}

export { bezAt };
