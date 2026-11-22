// The unfolder (milestone 124, SHAPES_TO_DIELINES_PLAN.md §4.4): which edges of a closed
// solid stay folded, so it lies flat in as few pieces as fit the sheet, none overlapping
// itself, flaps included. `MODEL_MODES_RESEARCH.md` §3's pipeline, written fresh (the
// unfolders it names are GPL, behaviour references only):
//   1. edges in order of weight: flat and long first;
//   2. a greedy join with union-find, refused when the joined island would overlap itself
//      or no longer fit the sheet in any of 8 turns;
//   3. seeded restarts with jittered weights, keeping the fewest islands, then the shortest cut;
//   4. flap sides: the face with the smaller area-to-perimeter ratio carries the flap,
//      alternating along chains; a flap that does not fit is shrunk, then moved to the
//      other side, then dropped with an issue. Each flap is sized for the face it is glued
//      to (papercraft's way, behaviour only): each end narrows at no more than that face's
//      corner there allows, and it is no deeper than lies inside that face, folded;
//   5. a student's fixed edges first: a fixed cut is never folded;
//   6. the engine's rules (foldRules.ts): no fold it cannot lay (sharper than 5°, past 355°),
//      and each fold laid with the engine's crease shift, so the net checked here is the net
//      it lays. Make then checks that net and cuts what it could not lay (`avoid`).
// Pure and deterministic: restarts are counted, not timed (a time cap only guards against
// a runaway), so the same seed gives the same net on any machine.
import polygonClipping from 'polygon-clipping';
import type { P2 } from './types';
import type { Xform2 } from '../geom/types';
import type { EdgeKey, FaceKey, PEdge, PFace, Polyhedron } from './polyhedron';
import { ringOf } from './polyhedron';
import { v3dot, v3sub } from '../geom/v3';
import { creaseSum, seamFoldable, TAPER_MAX } from './foldRules';

export type UnfoldSpec = {
  /** The sheet less its margins (mm). */
  sheet: { w: number; h: number };
  /** A cut edge's flap depth (0: none, as on boards). */
  flap: (e: PEdge) => number;
  /** Fewest pieces, or fewer cuts (long edges kept folded). */
  prefer?: 'pieces' | 'cuts';
  /** The student's choices, kept. */
  fixed?: Record<EdgeKey, 'fold' | 'cut'>;
  /** Faces left out. */
  open?: FaceKey[];
  /** The design's id: the same seed gives the same net. */
  seed: string;
  /** Restarts after the first pass (default 40); 0 for the first pass only. */
  restarts?: number;
  /** How far a flap keeps clear of the faces and flaps round it (mm): a crease moves a board by up to its thickness. */
  clearance?: number;
  /** A safety cap on the time spent (ms, default 2000). */
  capMs?: number;
  /** The material's fold allowance (mm, as `foldLay` adds it): how far out a folded face lies beyond the crease's place. */
  foldAllowance?: number;
  /** Edges never folded: the ones Make found the engine could not lay in an earlier try (not the student's choices). */
  avoid?: EdgeKey[];
};

export type UnfoldIssue =
  | { kind: 'faceTooBig'; face: FaceKey }
  | { kind: 'split'; n: number; why: 'sheet' | 'overlap' | 'fixed' }
  | { kind: 'flapDropped'; edge: EdgeKey }
  | { kind: 'fixedFoldRefused'; edge: EdgeKey };

export type Unfolding = {
  folds: Set<EdgeKey>;
  islands: FaceKey[][];
  /** Each cut edge's flap: the face that carries it, and its depth (shrunk where needed). */
  flapOn: Record<EdgeKey, FaceKey>;
  flapDepth: Record<EdgeKey, number>;
  /** How far each flap narrows at the start of its edge on the face carrying it (mm along the edge; its depth for 45°). */
  flapTaper: Record<EdgeKey, number>;
  /** How far it narrows at the edge's other end. */
  flapTaperB: Record<EdgeKey, number>;
  /** How far in from each end it starts (milestone 191; absent: at the corner). */
  flapInset: Record<EdgeKey, number>;
  flapInsetB: Record<EdgeKey, number>;
  /** Where each face lies in its island's flat layout. */
  place: Record<FaceKey, Xform2>;
  issues: UnfoldIssue[];
  /** How many restarts ran, and how long the first pass took (ms). */
  restarts: number;
  firstPassMs: number;
};

type X = { c: number; s: number; tx: number; ty: number };
const ap = (t: X, p: P2): P2 => ({ x: t.c * p.x - t.s * p.y + t.tx, y: t.s * p.x + t.c * p.y + t.ty });
const comp = (a: X, b: X): X => ({ c: a.c * b.c - a.s * b.s, s: a.s * b.c + a.c * b.s, tx: a.c * b.tx - a.s * b.ty + a.tx, ty: a.s * b.tx + a.c * b.ty + a.ty });
const ID: X = { c: 1, s: 0, tx: 0, ty: 0 };
function match(p1: P2, q1: P2, p2: P2, q2: P2): X {
  const a1 = Math.atan2(q1.y - p1.y, q1.x - p1.x), a2 = Math.atan2(q2.y - p2.y, q2.x - p2.x);
  const c = Math.cos(a2 - a1), s = Math.sin(a2 - a1);
  return { c, s, tx: p2.x - (c * p1.x - s * p1.y), ty: p2.y - (s * p1.x + c * p1.y) };
}
const to2 = (f: PFace, p: [number, number, number]): P2 => {
  const d = v3sub(p, f.frame.o);
  return { x: v3dot(d, f.frame.u), y: v3dot(d, f.frame.v) };
};

/** A seeded random (mulberry32) from a string. */
function rng(seed: string) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const bbox = (r: P2[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r) (x0 = Math.min(x0, p.x)), (y0 = Math.min(y0, p.y)), (x1 = Math.max(x1, p.x)), (y1 = Math.max(y1, p.y));
  return { x0, y0, x1, y1 };
};
const convex = (r: P2[]) => {
  let sgn = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) continue;
    if (sgn && Math.sign(z) !== sgn) return false;
    sgn = Math.sign(z);
  }
  return true;
};
function convexOverlap(a: P2[], b: P2[], tol: number): boolean {
  for (const r of [a, b])
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const nx = q.y - p.y, ny = p.x - q.x, L = Math.hypot(nx, ny) || 1;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const t of a) {
        const v = (t.x * nx + t.y * ny) / L;
        amin = Math.min(amin, v);
        amax = Math.max(amax, v);
      }
      for (const t of b) {
        const v = (t.x * nx + t.y * ny) / L;
        bmin = Math.min(bmin, v);
        bmax = Math.max(bmax, v);
      }
      if (amax <= bmin + tol || bmax <= amin + tol) return false;
    }
  return true;
}
const mpArea = (mp: polygonClipping.MultiPolygon) =>
  mp.reduce((s, poly) => s + poly.reduce((s2, r, k) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    return s2 + (k ? -1 : 1) * Math.abs(a / 2);
  }, 0), 0);

/** Do two placed outlines overlap (more than touching along an edge, within `tol` mm)? */
export function ringsOverlap(a: P2[], b: P2[], tol = 1e-3): boolean {
  const A = bbox(a), B = bbox(b);
  if (A.x1 <= B.x0 + tol || B.x1 <= A.x0 + tol || A.y1 <= B.y0 + tol || B.y1 <= A.y0 + tol) return false;
  if (convex(a) && convex(b)) return convexOverlap(a, b, tol);
  for (const g of [0, 1e-6, 1e-5, 1e-4]) {
    const snap = (v: number) => (g ? Math.round(v / g) * g : v);
    const ring = (r: P2[]) => [...r.map((p) => [snap(p.x), snap(p.y)] as [number, number]), [snap(r[0].x), snap(r[0].y)] as [number, number]];
    try {
      return mpArea(polygonClipping.intersection([ring(a)], [ring(b)])) > Math.max(0.01, tol * 10);
    } catch {
      /* the next grid */
    }
  }
  // a failure counts as an overlap: the join is refused, which is safe
  return true;
}

/** The part of `subject` inside the convex ring `clip` (Sutherland–Hodgman), its area: exact for any simple subject. */
function convexClipArea(subject: P2[], clip: P2[]): number {
  let sgn = 0;
  for (let i = 0; i < clip.length; i++) sgn += clip[i].x * clip[(i + 1) % clip.length].y - clip[(i + 1) % clip.length].x * clip[i].y;
  const s = sgn >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const p = clip[i], q = clip[(i + 1) % clip.length];
    const side = (x: P2) => s * ((q.x - p.x) * (x.y - p.y) - (q.y - p.y) * (x.x - p.x));
    const next: P2[] = [];
    for (let k = 0; k < out.length; k++) {
      const a = out[k], b = out[(k + 1) % out.length];
      const sa = side(a), sb = side(b);
      if (sa >= 0) next.push(a);
      if ((sa >= 0) !== (sb >= 0)) {
        const t = sa / (sa - sb);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    out = next;
  }
  let a2 = 0;
  for (let i = 0; i < out.length; i++) a2 += out[i].x * out[(i + 1) % out.length].y - out[(i + 1) % out.length].x * out[i].y;
  return Math.abs(a2) / 2;
}

/** The area two outlines share (Infinity when polygon-clipping cannot tell: the caller has found them overlapping by then). */
export function overlapArea(a: P2[], b: P2[], aConvex?: boolean): number {
  // a flap is always convex, and most faces are: no sweep needed
  if (convex(b)) return convexClipArea(a, b);
  if (aConvex === false) return sweepArea(a, b);
  if (aConvex ?? convex(a)) return convexClipArea(b, a);
  return sweepArea(a, b);
}
function sweepArea(a: P2[], b: P2[]): number {
  const ring = (r: P2[]) => [...r.map((p) => [p.x, p.y] as [number, number]), [r[0].x, r[0].y] as [number, number]];
  try {
    return mpArea(polygonClipping.intersection([ring(a)], [ring(b)]));
  } catch {
    return Infinity;
  }
}

/** Does a set of outlines fit a W × H sheet in one of 8 turns? */
export function fitsSheet(rings: P2[][], W: number, H: number, turns = 8): boolean {
  const pts = rings.flat();
  // the cut plan lays a piece square to its first board (0° or 90°): `turns` 2 tests only those
  for (let k = 0; k < 8; k += 8 / turns) {
    const a = (k * Math.PI) / 8, c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = c * p.x - s * p.y, y = s * p.x + c * p.y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const w = x1 - x0, h = y1 - y0;
    if ((w <= W + 1e-6 && h <= H + 1e-6) || (w <= H + 1e-6 && h <= W + 1e-6)) return true;
  }
  return false;
}

/** A flap's ring pushed out along its edge by `c` at both ends (its base stays on the edge's line). */
function grow(r: P2[], c: number): P2[] {
  const [a, b, cc, dd] = r;
  const L = Math.hypot(dd.x - a.x, dd.y - a.y) || 1;
  const ux = (dd.x - a.x) / L, uy = (dd.y - a.y) / L;
  return [{ x: a.x - ux * c, y: a.y - uy * c }, { x: b.x - ux * c, y: b.y - uy * c }, { x: cc.x + ux * c, y: cc.y + uy * c }, { x: dd.x + ux * c, y: dd.y + uy * c }];
}

/** A flap's ring with its far corners pushed out along its edge by `c` (its base corners kept). */
function growTop(r: P2[], c: number): P2[] {
  const g = grow(r, c);
  return [r[0], g[1], g[2], r[3]];
}

/** A flap placed in an island's flat layout. */
/** `uses`: what it overlaps beyond the usual 3t² (a face beside its own edge), so a pair of boards never adds up past the export check. */
type PlacedFlap = { edge: EdgeKey; on: FaceKey; depth: number; taper: number; taperB: number; ring: P2[]; uses?: { face: FaceKey; area: number }[]; inset?: number; insetB?: number };
type Island = { faces: FaceKey[]; xf: Map<FaceKey, X>; flaps: PlacedFlap[] };
type Pass = { islands: Island[]; folds: Set<EdgeKey>; refusedFixed: EdgeKey[]; why: Set<'sheet' | 'overlap'> };

const boxApart = (a: Box, b: Box, tol: number) => a.x1 <= b.x0 + tol || b.x1 <= a.x0 + tol || a.y1 <= b.y0 + tol || b.y1 <= a.y0 + tol;

/**
 * The face a flap on edge e (carried by `on`) is glued to, as the flap lies on it folded:
 * the steepest each end may rise from the edge (radians, a little less than the face's
 * corner there, at most 85°), and whether a flap of a depth and two tapers lies
 * inside it, `clear` short of its other edges (where the boards round it stand).
 */
function receiver(P: Polyhedron, e: PEdge, on: FaceKey, clear: number) {
  const O = P.faces[on], R = P.faces[on === e.a ? e.b : e.a];
  const refO = on === e.a ? e.ea : e.eb, refR = on === e.a ? e.eb : e.ea;
  const ro = ringOf(O, refO.ring), rr = ringOf(R, refR.ring);
  // the carrying face's edge starts at e.p or e.q: the same corner on the receiver is the flap's start there
  const o0 = faceWorldPt(O, ro[refO.i]);
  const startP = Math.hypot(o0[0] - e.p[0], o0[1] - e.p[1], o0[2] - e.p[2]) <= Math.hypot(o0[0] - e.q[0], o0[1] - e.q[1], o0[2] - e.q[2]);
  const n = rr.length, i = refR.i;
  const r0 = rr[i], r1 = rr[(i + 1) % n];
  const near = (p: P2) => (Math.hypot(p.x - r0.x, p.y - r0.y) <= Math.hypot(p.x - r1.x, p.y - r1.y) ? 0 : 1);
  const startAt0 = near(to2(R, startP ? e.p : e.q)) === 0;
  const R0 = startAt0 ? r0 : r1, R1 = startAt0 ? r1 : r0;
  const L = Math.hypot(R1.x - R0.x, R1.y - R0.y) || 1;
  const u = { x: (R1.x - R0.x) / L, y: (R1.y - R0.y) / L };
  // inside the receiver: to the left of its counter-clockwise edge r0 → r1
  const lr = Math.hypot(r1.x - r0.x, r1.y - r0.y) || 1;
  const nv = { x: -(r1.y - r0.y) / lr, y: (r1.x - r0.x) / lr };
  // the receiver's corner at each end: between this edge and the next one round it
  const corner = (v: P2, along: P2, nb: P2) => {
    const bx = along.x - v.x, by = along.y - v.y, cx = nb.x - v.x, cy = nb.y - v.y;
    const a = Math.acos(Math.max(-1, Math.min(1, (bx * cx + by * cy) / ((Math.hypot(bx, by) || 1) * (Math.hypot(cx, cy) || 1)))));
    return cx * nv.x + cy * nv.y >= 0 ? a : 2 * Math.PI - a;
  };
  const at0 = corner(r0, r1, rr[(i - 1 + n) % n]), at1 = corner(r1, r0, rr[(i + 2) % n]);
  const [c0, c1] = startAt0 ? [at0, at1] : [at1, at0];
  const MARGIN = (2 * Math.PI) / 180;
  const theta = (c: number) => Math.max(0, Math.min((85 * Math.PI) / 180, c - MARGIN));
  const convexR = R.holes.length === 0 && convex(R.outer);
  const area = Math.abs(R.area);
  const inside = (depth: number, ta: number, tb: number): boolean => {
    // tested `clear` deeper, its ends at the same angles (so its far edge keeps clear of the receiver's other edges)
    const d = depth + clear, k = depth > 0 ? d / depth : 1;
    if ((ta + tb) * k >= L) return false;
    const q = (s: number, w: number): P2 => ({ x: R0.x + u.x * s + nv.x * w, y: R0.y + u.y * s + nv.y * w });
    const trap = [R0, q(ta * k, d), q(L - tb * k, d), R1];
    if (convexR) {
      const r = R.outer;
      for (const t of trap)
        for (let k = 0; k < r.length; k++) {
          const p = r[k], p2 = r[(k + 1) % r.length];
          const el = Math.hypot(p2.x - p.x, p2.y - p.y) || 1;
          // left of each counter-clockwise edge (a hair outside is the shared edge itself)
          if (((p2.x - p.x) * (t.y - p.y) - (p2.y - p.y) * (t.x - p.x)) / el < -1e-4) return false;
        }
      return true;
    }
    const ring = (rg: P2[]) => [...rg.map((p) => [p.x, p.y] as [number, number]), [rg[0].x, rg[0].y] as [number, number]];
    try {
      const out = polygonClipping.difference([ring(trap)], [ring(R.outer), ...R.holes.map(ring)]);
      return mpArea(out) <= Math.max(0.02, 1e-5 * area);
    } catch {
      return false;
    }
  };
  return { L, thA: theta(c0), thB: theta(c1), inside };
}

/** A face-local point in 3D. */
const faceWorldPt = (f: PFace, p: P2): [number, number, number] => [f.frame.o[0] + f.frame.u[0] * p.x + f.frame.v[0] * p.y, f.frame.o[1] + f.frame.u[1] * p.x + f.frame.v[1] * p.y, f.frame.o[2] + f.frame.u[2] * p.x + f.frame.v[2] * p.y];

/**
 * The deepest flap on one side that lies inside the face it is glued to (by halving), with
 * the sizes to try at a fraction of that depth: the ends at the receiver's corners' angles,
 * then narrowing more steeply. Null when no useful flap fits there.
 */
/** `sizesFor`'s answers, per face graph: they depend on the edge, its side, the depth asked and the clearance only, so every join and restart asks once. */
const sizesMemo = new WeakMap<Polyhedron, Map<string, ((level: number) => [number, number, number][]) | null>>();
function sizesFor(P: Polyhedron, e: PEdge, on: FaceKey, want: number, clear: number): ((level: number) => [number, number, number][]) | null {
  let m = sizesMemo.get(P);
  if (!m) sizesMemo.set(P, (m = new Map()));
  const key = `${e.key}|${on}|${want}|${clear}`;
  if (m.has(key)) return m.get(key)!;
  const f = sizesNow(P, e, on, want, clear);
  const byLevel = new Map<number, [number, number, number][]>();
  const g = f && ((level: number) => byLevel.get(level) ?? (byLevel.set(level, f(level)), byLevel.get(level)!));
  m.set(key, g);
  return g;
}
function sizesNow(P: Polyhedron, e: PEdge, on: FaceKey, want: number, clear: number): ((level: number) => [number, number, number][]) | null {
  const R = receiver(P, e, on, clear);
  const { L, thA, thB } = R;
  if (thA <= 1e-3 || thB <= 1e-3) return null;
  // the least each end must narrow by at a depth (its end at the receiver's corner's angle)
  const tA = (d: number) => d / Math.tan(thA), tB = (d: number) => d / Math.tan(thB);
  // each end narrows by at most TAPER_MAX of the edge, leaving a top at least a tenth of it (a long wedge on a
  // sliver of a face, papercraft's way): deeper would make an end steeper than the corner allows
  const mt = TAPER_MAX * L;
  // an end narrows at 45° (`k` times steeper or shallower), at most a third of the edge as before, more only
  // where the corner needs it
  const taper = (k: number, d: number, tmin: number) => Math.min(Math.max(k * d, tmin), Math.max(L / 3, tmin), mt);
  const cap = Math.min(want, mt * Math.tan(thA), mt * Math.tan(thB), (0.9 * L) / (1 / Math.tan(thA) + 1 / Math.tan(thB)));
  const fits = (d: number) => R.inside(d, taper(1, d, tA(d)), taper(1, d, tB(d)));
  let dmax = 0;
  if (fits(cap)) dmax = cap;
  else {
    let lo = 0, hi = cap;
    for (let k = 0; k < 12; k++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    dmax = lo;
  }
  // too shallow to glue: the caller falls back to a flap sized by the net alone
  if (dmax < Math.min(want, Math.max(2, 0.3 * want))) return null;
  return (level) => {
    const d = dmax * level;
    const out: [number, number, number][] = [];
    for (const k of [1, 2.5, 5]) {
      const ta = taper(k, d, tA(d)), tb = taper(k, d, tB(d));
      if (ta + tb <= 0.9 * L && R.inside(d, ta, tb)) out.push([d, ta, tb]);
    }
    // one end narrowing as steeply as a flap may (TAPER_MAX of the edge), the other as little as its corner
    // allows: a flap in the narrow wedge where a face hangs off its neighbour's edge (a cylinder's cap beside
    // its strip) fits by leaning away from that face only
    const a1 = taper(1, d, tA(d)), b1 = taper(1, d, tB(d));
    for (const [ta, tb] of [[mt, b1], [a1, mt]] as const)
      if (ta >= tA(d) && tb >= tB(d) && ta + tb <= 0.9 * L + 1e-9 && R.inside(d, ta, tb)) out.push([d, ta, tb]);
    return out;
  };
}

/**
 * A flap for cut edge e inside an island (faces and flaps it must miss): the face with the
 * smaller area-to-perimeter ratio first (the one carrying fewer flaps on a near tie), sized
 * for the face it is glued to (`sizesFor`) on either side; failing that, as before, full depth
 * at 45°, then narrowing more steeply at its ends, then shallower; or null.
 */
/** The faces that meet edge e at one of its ends (its own two among them). */
const cornerMemo = new WeakMap<Polyhedron, Map<EdgeKey, Set<FaceKey>>>();
function cornerFaces(P: Polyhedron, e: PEdge): Set<FaceKey> {
  let m = cornerMemo.get(P);
  if (!m) cornerMemo.set(P, (m = new Map()));
  let out = m.get(e.key);
  if (out) return out;
  out = new Set();
  const at = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;
  for (const x of Object.values(P.edges))
    if ([x.p, x.q].some((v) => at(v, e.p) || at(v, e.q))) for (const f of [x.a, x.b]) out.add(f);
  m.set(e.key, out);
  return out;
}

function fitFlap(P: Polyhedron, e: PEdge, want: number, I: Island, rings: P2[][], W: number, H: number, carried: Map<FaceKey, number>, clear = 0, only?: FaceKey): PlacedFlap | null {
  const ra = ratio(P.faces[e.a]), rb = ratio(P.faces[e.b]);
  const ca = carried.get(e.a) ?? 0, cb = carried.get(e.b) ?? 0;
  const first = Math.abs(ra - rb) < 0.05 * Math.max(ra, rb) ? (ca <= cb ? e.a : e.b) : ra <= rb ? e.a : e.b;
  const sides = (only ? [only] : [first, first === e.a ? e.b : e.a]).filter((k) => I.xf.has(k));
  const others = [...rings, ...I.flaps.map((f) => f.ring)];
  const boxes = others.map(bbox);
  const cvx = others.map(convex);
  // a flap may meet a face or flap at a corner by 3t² (as faces may), tested with its clearance. A face that shares a
  // corner with the flap's own edge (the face it is glued to among them) may take more: where a face hangs off the
  // next one's edge the creases shift the two by about a thickness (a cylinder's cap beside its strip). There the flap
  // as cut may overlap it by what the export check leaves (`netOverlaps`: 4t², and under 0.5 mm² is no overlap) once a
  // 3t² corner sliver is counted: t² + 0.5 for each pair of boards, all their flaps together (the check adds them up).
  const near = cornerFaces(P, e);
  const budget = clear * clear + 0.5;
  const used = (a: FaceKey, b: FaceKey) => I.flaps.reduce((s, f) => s + (f.uses ?? []).reduce((t, u) => t + ((f.on === a && u.face === b) || (f.on === b && u.face === a) ? u.area : 0), 0), 0);
  const all = boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const tryOne = (on: FaceKey, depth: number, taper: number, taperB: number, inset = 0, insetB = 0, strict = false): PlacedFlap | null => {
    const ring = flapRing(P, e, on, depth, I.xf.get(on)!, taper, taperB, inset, insetB);
    // tested deeper by the clearance, its far corners further along the edge; its base stays on the
    // edge's ends (past them is the corner its neighbours share, where the creases meet anyway)
    const tb = clear > 0 ? growTop(flapRing(P, e, on, depth + clear, I.xf.get(on)!, taper + clear, taperB + clear, inset, insetB), clear) : ring;
    const bb = bbox(tb);
    // with a clearance the area decides (one convex clip, no separating-axis test first)
    const uses: { face: FaceKey; area: number }[] = [];
    const hit = (r: P2[], i: number) => {
      if (!(clear > 0)) return ringsOverlap(r, tb, 0.05);
      // a tooth set in from a corner touches nothing (with its clearance): touching the face beside it would close the
      // wedge between them into a chip the laser cuts out, or join the two if it were not cut (milestone 191)
      if (strict) return overlapArea(r, tb, cvx[i]) > 1e-3;
      if (overlapArea(r, tb, cvx[i]) <= 3 * clear * clear) return false;
      if (!(i < rings.length && near.has(I.faces[i]))) return true;
      const a = overlapArea(r, ring, cvx[i]);
      if (a + used(on, I.faces[i]) + uses.filter((u) => u.face === I.faces[i]).reduce((t, u) => t + u.area, 0) > budget) return true;
      uses.push({ face: I.faces[i], area: a });
      return false;
    };
    if (others.some((r, i) => !boxApart(boxes[i], bb, 0.05) && hit(r, i))) return null;
    // the sheet, square to the piece (as `fitsSheet` with 2 turns): the island's box with the flap's
    const fb = bbox(ring);
    const w = Math.max(all.x1, fb.x1) - Math.min(all.x0, fb.x0), h = Math.max(all.y1, fb.y1) - Math.min(all.y0, fb.y0);
    if (!((w <= W + 1e-6 && h <= H + 1e-6) || (w <= H + 1e-6 && h <= W + 1e-6))) return null;
    return { edge: e.key, on, depth, taper, taperB, ring, ...(uses.length ? { uses } : {}), ...(inset > 0 ? { inset } : {}), ...(insetB > 0 ? { insetB } : {}) };
  };
  // deepest first, either side, as below
  const sized = sides.map((on) => [on, sizesFor(P, e, on, want, clear)] as const);
  // a quarter of the depth asked as a last resort (milestone 190: a narrow tooth beside a cap hanging off a strip of
  // facets 16 mm wide), never under 2 mm or 1.5 thicknesses, below which nothing is glued
  const shallow = want * 0.25 >= Math.max(2, 1.5 * clear) ? [0.25] : [];
  for (const level of [1, 0.6, 0.35, ...shallow])
    for (const [on, sizes] of sized)
      for (const [depth, ta, tb] of sizes?.(level) ?? []) {
        const f = tryOne(on, depth, ta, tb);
        if (f) return f;
      }
  const tries = [want, want * 0.6, want * 0.35].flatMap((depth) => [[depth, depth], [depth, depth * 2.5], [depth, depth * 5]]);
  for (const [depth, taper] of tries)
    for (const on of sides) {
      const t = flapTaperLen(e.len, depth, taper);
      const f = tryOne(on, depth, t, t);
      if (f) return f;
    }
  // then leaning away at one end only (see `sizesFor`)
  const steep = TAPER_MAX * e.len;
  for (const depth of [want * 0.6, want * 0.35, ...shallow.map((k) => want * k)])
    for (const on of sides) {
      const t = flapTaperLen(e.len, depth);
      for (const [ta, tb] of [[steep, t], [t, steep]]) {
        const f = tryOne(on, depth, ta, tb);
        if (f) return f;
      }
    }
  // last, a tooth set in from a corner (milestone 191): where a face hangs off the next one's edge the room at that
  // corner is a wedge of a few degrees, and a flap that starts a fifth or a third of the edge in stands clear of it
  // (it must still lie on the face it is glued to, as a flap reaching to the corner would)
  const L = e.len;
  for (const depth of [want, want * 0.6, want * 0.35, ...shallow.map((k) => want * k)])
    for (const on of sides) {
      const R = receiver(P, e, on, clear);
      const t = flapTaperLen(L, depth);
      for (const k of [0.2, 0.35])
        for (const [ia, ib] of [[k * L, 0], [0, k * L], [k * L, k * L]]) {
          // a base of at least a third of the edge and 3 mm, and room for both tapers
          if (L - ia - ib < Math.max(L / 3, 3) || ia + ib + 2 * t > 0.95 * L) continue;
          if (!R.inside(depth, ia + t, ib + t)) continue;
          const f = tryOne(on, depth, t, t, ia, ib, true);
          if (f) return f;
        }
    }
  return null;
}

/** An island copied, so a pass that starts from it changes the copy only. */
const copyIsland = (I: Island): Island => ({ faces: I.faces.slice(), xf: new Map(I.xf), flaps: I.flaps.slice() });

/**
 * One greedy pass: every face its own island (or `init`'s islands as they stand, and its
 * folds), then the edges of `order` joined where the joined island fits the sheet and does
 * not overlap itself, flaps included.
 */
function pass(P: Polyhedron, faces: FaceKey[], order: PEdge[], W: number, H: number, fixedFolds: PEdge[], flap: (e: PEdge) => number, live: PEdge[], clear = 0, fa = 0, init?: { islands: Island[]; folds: Set<EdgeKey> }): Pass {
  const of = new Map<FaceKey, Island>();
  for (const I of init?.islands ?? []) {
    const J = copyIsland(I);
    for (const k of J.faces) of.set(k, J);
  }
  for (const k of faces) if (!of.has(k)) of.set(k, { faces: [k], xf: new Map([[k, ID]]), flaps: [] });
  const folds = new Set<EdgeKey>(init?.folds ?? []);
  const refusedFixed: EdgeKey[] = [];
  const why = new Set<'sheet' | 'overlap'>();
  const byFace = new Map<FaceKey, PEdge[]>();
  for (const e of live) {
    byFace.set(e.a, [...(byFace.get(e.a) ?? []), e]);
    byFace.set(e.b, [...(byFace.get(e.b) ?? []), e]);
  }
  const carried = new Map<FaceKey, number>();
  for (const I of new Set(of.values())) for (const f of I.flaps) carried.set(f.on, (carried.get(f.on) ?? 0) + 1);
  const tryJoin = (e: PEdge, fixedFold: boolean): boolean => {
    const IA = of.get(e.a), IB = of.get(e.b);
    if (!IA || !IB || IA === IB) return false;
    const A = P.faces[e.a], B = P.faces[e.b];
    const xa = IA.xf.get(A.key)!, xb = IB.xf.get(B.key)!;
    const pA = ap(xa, to2(A, e.p)), qA = ap(xa, to2(A, e.q));
    const pB = ap(xb, to2(B, e.p)), qB = ap(xb, to2(B, e.q));
    let M = match(pB, qB, pA, qA);
    // the crease (the overhaul's rule), as the engine lays it (`foldLay`): B lies across A's edge by the
    // crease's depths less the fold allowance; past 180° the crease lies outside, so B lies further out
    const ov = creaseSum(clear, clear, e.dihedral) - fa;
    if (Math.abs(ov) > 1e-12) {
      const L = Math.hypot(qA.x - pA.x, qA.y - pA.y) || 1;
      // into A: to the left of A's counter-clockwise edge p → q
      const ix = -(qA.y - pA.y) / L, iy = (qA.x - pA.x) / L;
      M = { ...M, tx: M.tx + ix * ov, ty: M.ty + iy * ov };
    }
    const moved = new Map([...IB.xf].map(([k, t]) => [k, comp(M, t)] as [FaceKey, X]));
    const ringsA = IA.faces.map((k) => P.faces[k].outer.map((p) => ap(IA.xf.get(k)!, p)));
    const ringsB = IB.faces.map((k) => P.faces[k].outer.map((p) => ap(moved.get(k)!, p)));
    const flapsB = IB.flaps.map((f) => ({ ...f, ring: f.ring.map((p) => ap(M, p)) }));
    const allA = [...ringsA, ...IA.flaps.map((f) => f.ring)], allB = [...ringsB, ...flapsB.map((f) => f.ring)];
    if (!fitsSheet([...allA, ...allB], W, H, 2)) return void why.add('sheet'), false;
    const boxesA = allA.map(bbox);
    const ia = IA.faces.indexOf(e.a), ib = IB.faces.indexOf(e.b);
    for (let jb = 0; jb < allB.length; jb++) {
      const rb = allB[jb];
      const bb = bbox(rb);
      for (let i = 0; i < allA.length; i++) {
        // the two faces of the fold share the crease's strip: one board, not an overlap
        if (i === ia && jb === ib) continue;
        if (boxApart(boxesA[i], bb, 1e-3)) continue;
        // two faces may meet at a corner by up to a thickness (the creases shift them, as the engine lays them);
        // a face may touch a flap along the edge it hangs from; anything more is an overlap
        const faces = i < ringsA.length && jb < ringsB.length;
        if (ringsOverlap(allA[i], rb, faces ? 1e-3 : 0.05) && !(clear > 0 && overlapArea(allA[i], rb) <= 3 * clear * clear)) return void why.add('overlap'), false;
      }
    }
    const J: Island = { faces: [...IA.faces, ...IB.faces], xf: new Map([...IA.xf, ...moved]), flaps: [...IA.flaps, ...flapsB] };
    // the edges this join closes inside the island (never to be folded): each needs room for its flap
    const inB = new Set(IB.faces);
    const closed = IA.faces.flatMap((k) => byFace.get(k) ?? []).filter((x) => x.key !== e.key && (inB.has(x.a) !== inB.has(x.b)) && (IA.xf.has(x.a) || IA.xf.has(x.b)));
    const rings = [...ringsA, ...ringsB];
    const added: PlacedFlap[] = [];
    for (const x of closed) {
      const want = flap(x);
      if (!(want > 0)) continue;
      const f = fitFlap(P, x, want, J, rings, W, H, carried, clear);
      // a fold the student fixed is made even so: the flap is then dropped at the end
      if (!f) {
        if (fixedFold) continue;
        return void why.add('overlap'), false;
      }
      J.flaps.push(f);
      added.push(f);
    }
    for (const f of added) carried.set(f.on, (carried.get(f.on) ?? 0) + 1);
    for (const k of J.faces) of.set(k, J);
    folds.add(e.key);
    return true;
  };
  for (const e of fixedFolds) if (!tryJoin(e, true)) refusedFixed.push(e.key);
  for (const e of order) tryJoin(e, false);
  return { islands: [...new Set(of.values())], folds, refusedFixed, why };
}

/** How many groups `faces` fall into, joined by `edges` (union-find). */
function components(faces: FaceKey[], edges: PEdge[]): number {
  const parent = new Map(faces.map((k) => [k, k]));
  const find = (k: FaceKey): FaceKey => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  for (const e of edges) if (parent.has(e.a) && parent.has(e.b)) parent.set(find(e.a), find(e.b));
  return new Set(faces.map(find)).size;
}

/** A face's area over its perimeter: the smaller carries the flap (it is the easier one to glue onto the other). */
function ratio(f: PFace): number {
  const per = f.outer.reduce((s, p, i) => s + Math.hypot(f.outer[(i + 1) % f.outer.length].x - p.x, f.outer[(i + 1) % f.outer.length].y - p.y), 0);
  return Math.abs(f.area) / (per || 1);
}

/** How far a flap narrows at each end along its edge: the taper asked (its depth for 45°), at most a third of the edge. */
export const flapTaperLen = (L: number, depth: number, taper = depth) => Math.max(0, Math.min(taper, L / 3));


/** The flap on edge e as placed on face `on` (a trapezoid outward from the edge, narrowing by `taper` and `taperB` at its ends, as given). */
function flapRing(P: Polyhedron, e: PEdge, on: FaceKey, depth: number, xf: X, taper = depth, taperB = taper, inset = 0, insetB = 0): P2[] {
  const f = P.faces[on];
  const ref = on === e.a ? e.ea : e.eb;
  const ring = ringOf(f, ref.ring);
  const a = ring[ref.i], b = ring[(ref.i + 1) % ring.length];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  // outward: to the right of a counter-clockwise outline's edge
  const ox = dy, oy = -dx;
  const tp = Math.max(0, Math.min(taper, TAPER_MAX * L)), tq = Math.max(0, Math.min(taperB, TAPER_MAX * L));
  const q = (s: number, u: number): P2 => ap(xf, { x: a.x + dx * s + ox * u, y: a.y + dy * s + oy * u });
  // inset from either end (milestone 191): its base starts and ends that far in, its tapers from there
  return [q(inset, 0), q(inset + tp, depth), q(L - insetB - tq, depth), q(L - insetB, 0)];
}

type Flaps = { flapOn: Record<EdgeKey, FaceKey>; flapDepth: Record<EdgeKey, number>; flapTaper: Record<EdgeKey, number>; flapTaperB: Record<EdgeKey, number>; flapInset: Record<EdgeKey, number>; flapInsetB: Record<EdgeKey, number>; dropped: EdgeKey[] };

/** Flaps on a pass's cut edges: those placed while joining, then the edges between islands (each on its own island's side). */
function placeFlaps(P: Polyhedron, b: Pass, live: PEdge[], flap: (e: PEdge) => number, W: number, H: number, clear = 0, rims: PEdge[] = []): Flaps {
  const islandOf = new Map<FaceKey, Island>();
  for (const I of b.islands) for (const k of I.faces) islandOf.set(k, I);
  const flapOn: Record<EdgeKey, FaceKey> = {};
  const flapDepth: Record<EdgeKey, number> = {};
  const flapTaper: Record<EdgeKey, number> = {};
  const flapTaperB: Record<EdgeKey, number> = {};
  const flapInset: Record<EdgeKey, number> = {};
  const flapInsetB: Record<EdgeKey, number> = {};
  const dropped: EdgeKey[] = [];
  const carried = new Map<FaceKey, number>();
  const extra = new Map<Island, PlacedFlap[]>();
  for (const I of b.islands)
    for (const f of I.flaps) {
      flapOn[f.edge] = f.on;
      flapDepth[f.edge] = f.depth;
      flapTaper[f.edge] = f.taper;
      flapTaperB[f.edge] = f.taperB;
      if (f.inset) flapInset[f.edge] = f.inset;
      if (f.insetB) flapInsetB[f.edge] = f.insetB;
      carried.set(f.on, (carried.get(f.on) ?? 0) + 1);
    }
  const rings = new Map<Island, P2[][]>();
  const ringsOf = (I: Island) => {
    let r = rings.get(I);
    if (!r) rings.set(I, (r = I.faces.map((k) => P.faces[k].outer.map((p) => ap(I.xf.get(k)!, p)))));
    return r;
  };
  const cuts = live.filter((e) => !b.folds.has(e.key) && !(e.key in flapOn)).sort((x, y) => y.len - x.len || (x.key < y.key ? -1 : 1));
  // a hole's rim (milestone 186): the flap goes on the wall, the face whose outline runs along it
  const rimWall = new Map(rims.map((e) => [e.key, e.ea.ring === 0 ? e.a : e.b]));
  for (const e of [...cuts, ...rims.slice().sort((x, y) => y.len - x.len || (x.key < y.key ? -1 : 1))]) {
    const want = flap(e);
    if (!(want > 0)) continue;
    let got: PlacedFlap | null = null;
    const wall = rimWall.get(e.key);
    // between two islands: try each island with its own face
    for (const side of wall ? [islandOf.get(wall)!] : [islandOf.get(e.a)!, islandOf.get(e.b)!]) {
      const view: Island = { ...side, flaps: [...side.flaps, ...(extra.get(side) ?? [])] };
      const only: PEdge = { ...e };
      const f = fitFlap(P, only, want, view, ringsOf(side), W, H, carried, clear, wall);
      if (f) {
        extra.set(side, [...(extra.get(side) ?? []), f]);
        got = f;
        break;
      }
    }
    if (!got) {
      dropped.push(e.key);
      continue;
    }
    flapOn[e.key] = got.on;
    flapDepth[e.key] = got.depth;
    flapTaper[e.key] = got.taper;
    flapTaperB[e.key] = got.taperB;
    if (got.inset) flapInset[e.key] = got.inset;
    if (got.insetB) flapInsetB[e.key] = got.insetB;
    carried.set(got.on, (carried.get(got.on) ?? 0) + 1);
  }
  return { flapOn, flapDepth, flapTaper, flapTaperB, flapInset, flapInsetB, dropped };
}

/** Unfold a solid (see the file's head). */
export function unfold(P: Polyhedron, spec: UnfoldSpec): Unfolding {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const open = new Set(spec.open ?? []);
  const faces = Object.keys(P.faces).filter((k) => !open.has(k));
  const live = Object.values(P.edges).filter((e) => !open.has(e.a) && !open.has(e.b) && e.ea.ring === 0 && e.eb.ring === 0);
  // a wall along a hole's rim: never folded (a hole is a cut-out, no board edge), glued by a flap on the wall
  const rims = Object.values(P.edges).filter((e) => !open.has(e.a) && !open.has(e.b) && (e.ea.ring === 0) !== (e.eb.ring === 0));
  const fixed = spec.fixed ?? {};
  const avoid = new Set(spec.avoid ?? []);
  // what the engine can lay as a fold (a fixed fold it cannot is refused, as one that would overlap)
  const foldable = (e: PEdge) => seamFoldable(e.dihedral) && !avoid.has(e.key);
  const fixedFolds = live.filter((e) => fixed[e.key] === 'fold' && foldable(e));
  const free = live.filter((e) => !fixed[e.key] && foldable(e));
  const issues: UnfoldIssue[] = [];
  for (const e of live) if (fixed[e.key] === 'fold' && !foldable(e)) issues.push({ kind: 'fixedFoldRefused', edge: e.key });
  const { w: W, h: H } = spec.sheet;
  for (const k of faces) if (!fitsSheet([P.faces[k].outer], W, H, 2)) issues.push({ kind: 'faceTooBig', face: k });
  const avg = live.reduce((s, e) => s + e.len, 0) / Math.max(1, live.length);
  const lenW = spec.prefer === 'cuts' ? 0.3 : 0.05;
  const weight = (e: PEdge, j: number) => {
    const bend = Math.abs(180 - e.dihedral) / 180;
    return (e.dihedral < 180 ? 0.5 : 1) * bend - lenW * (e.len / (avg || 1)) + j;
  };
  // the fewest islands there can be: faces joined only by a hole's rim (a tube through a box) never fold together
  const least = components(faces, [...free, ...fixedFolds]);
  const rand = rng(spec.seed);
  const maxRestarts = spec.restarts ?? 40;
  const cap = spec.capMs ?? 2000;
  type Scored = Pass & { cut: number; flaps: Flaps; score: number };
  let best: Scored | null = null;
  const scoreOf = (r: Pass): Scored => {
    const cut = live.filter((e) => !r.folds.has(e.key)).reduce((s, e) => s + e.len, 0);
    const flaps = placeFlaps(P, r, live, spec.flap, W, H, spec.clearance ?? 0, rims);
    return { ...r, cut, flaps, score: r.islands.length + flaps.dropped.length };
  };
  const better = (a: Scored, b: Scored) => a.score < b.score - 1e-9 || (Math.abs(a.score - b.score) < 1e-9 && a.cut < b.cut - 1e-9);
  /**
   * The merge pass: the smallest island not yet tried is dissolved into loose faces, which then
   * join the islands that are left (and each other) edge by edge, in the order of weight; kept
   * when it leaves fewer pieces. Repeated until no island can be dissolved to advantage. A
   * greedy pass builds islands early, before the large ones exist to take their faces; here
   * the large ones stand, and a cap or a strip's last facets find the room left round them.
   */
  const merge = (from: Scored): Scored | null => {
    let cur = from, gained = false;
    const tried = new Set<string>();
    for (let round = 0; round < 12 && cur.islands.length > least && now() - t0 < cap; round++) {
      const sorted = cur.islands.slice().sort((x, y) => x.faces.length - y.faces.length || (x.faces[0] < y.faces[0] ? -1 : 1));
      // each island alone, smallest first (dissolving pairs was tried: no fewer pieces, a sixth slower on a ring)
      const sets: Island[][] = sorted.map((I) => [I]);
      let improved = false;
      for (const set of sets) {
        const S = { faces: set.flatMap((I) => I.faces) };
        const sig = S.faces.slice().sort().join(',');
        if (tried.has(sig) || S.faces.length === faces.length) continue;
        tried.add(sig);
        const inS = new Set(S.faces);
        // its own folds the student fixed stay (they are made again first); the rest of its folds come undone
        const keep = new Set([...cur.folds].filter((k) => !(inS.has(P.edges[k].a) && inS.has(P.edges[k].b))));
        const touch = free.filter((e) => !keep.has(e.key) && (inS.has(e.a) || inS.has(e.b)));
        const order = touch.map((e) => ({ e, w: weight(e, 0) })).sort((a, b) => a.w - b.w || (a.e.key < b.e.key ? -1 : 1)).map((x) => x.e);
        const others = cur.islands.filter((I) => !set.includes(I));
        const r = pass(P, faces, order, W, H, fixedFolds.filter((e) => inS.has(e.a) && inS.has(e.b)), spec.flap, live, spec.clearance ?? 0, spec.foldAllowance ?? 0, { islands: others, folds: keep });
        if (r.refusedFixed.length) continue;
        const sc = scoreOf({ ...r, refusedFixed: cur.refusedFixed, why: new Set([...cur.why, ...r.why]) });
        if (better(sc, cur)) {
          cur = sc;
          gained = improved = true;
          break;
        }
      }
      if (!improved) break;
    }
    return gained ? cur : null;
  };
  let restarts = 0, firstPassMs = 0;
  for (;;) {
    const jitter = restarts === 0 ? 0 : 0.35;
    // a stable order: weight, then key (ties broken the same way everywhere)
    const order = free.map((e) => ({ e, w: weight(e, (rand() - 0.5) * jitter) })).sort((a, b) => a.w - b.w || (a.e.key < b.e.key ? -1 : 1)).map((x) => x.e);
    const r = pass(P, faces, order, W, H, fixedFolds, spec.flap, live, spec.clearance ?? 0, spec.foldAllowance ?? 0);
    const cut = live.filter((e) => !r.folds.has(e.key)).reduce((s, e) => s + e.len, 0);
    const flaps = placeFlaps(P, r, live, spec.flap, W, H, spec.clearance ?? 0, rims);
    if (restarts === 0) firstPassMs = now() - t0;
    // a dropped flap costs a piece: a seam that cannot be glued is as bad as another piece to glue on
    const score = r.islands.length + flaps.dropped.length;
    const was: Scored | null = best;
    if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && cut < best.cut - 1e-9)) best = { ...r, cut, flaps, score };
    if ((best.islands.length <= least && !best.flaps.dropped.length) || restarts >= maxRestarts || now() - t0 > cap) break;
    // the merge pass (milestone 190) on each new best: its small islands dissolved and grown onto the others
    if (best !== was && best.islands.length > least) {
      const m = merge(best);
      if (m) best = m;
      if (best.islands.length <= least && !best.flaps.dropped.length) break;
    }
    restarts++;
  }
  if (best && best.islands.length > least) {
    const m = merge(best);
    if (m) best = m;
  }
  const b = best!;
  for (const k of b.refusedFixed) issues.push({ kind: 'fixedFoldRefused', edge: k });
  // the islands, largest first, each with its faces in a stable order
  const islands = b.islands.map((I) => I.faces.slice().sort()).sort((x, y) => y.length - x.length || (x[0] < y[0] ? -1 : 1));
  if (islands.length > 1) issues.push({ kind: 'split', n: islands.length, why: Object.values(fixed).includes('cut') && b.why.size === 0 ? 'fixed' : b.why.has('sheet') ? 'sheet' : 'overlap' });
  for (const k of b.flaps.dropped) issues.push({ kind: 'flapDropped', edge: k });
  const { flapOn, flapDepth, flapTaper, flapTaperB, flapInset, flapInsetB } = b.flaps;
  const place: Record<FaceKey, Xform2> = {};
  for (const I of b.islands) for (const [k, t] of I.xf) place[k] = { tx: t.tx, ty: t.ty, rot: Math.atan2(t.s, t.c) };
  return { folds: b.folds, islands, flapOn, flapDepth, flapTaper, flapTaperB, flapInset, flapInsetB, place, issues, restarts, firstPassMs };
}

/** The faces of each island in the order a net is walked: the island's first face, then by breadth along its folds. */
export function islandOrder(P: Polyhedron, u: Pick<Unfolding, 'islands' | 'folds'> & Partial<Pick<Unfolding, 'place'>>): FaceKey[] {
  const out: FaceKey[] = [];
  for (const I of u.islands) {
    // the face the island's layout is measured in roots it (the cut plan lays the piece square to it, as the
    // unfolder fitted it to the sheet); else the largest face
    const base = u.place ? I.find((k) => { const x = u.place![k]; return x && Math.abs(x.rot) < 1e-12 && Math.abs(x.tx) < 1e-9 && Math.abs(x.ty) < 1e-9; }) : undefined;
    const root = base ?? I.slice().sort((a, b) => Math.abs(P.faces[b].area) - Math.abs(P.faces[a].area) || (a < b ? -1 : 1))[0];
    out.push(root, ...I.filter((k) => k !== root));
  }
  return out;
}
