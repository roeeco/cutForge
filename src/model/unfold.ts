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
//      other side, then dropped with an issue;
//   5. a student's fixed edges first: a fixed cut is never folded.
// Pure and deterministic: restarts are counted, not timed (a time cap only guards against
// a runaway), so the same seed gives the same net on any machine.
import polygonClipping from 'polygon-clipping';
import type { P2 } from './types';
import type { Xform2 } from '../geom/types';
import type { EdgeKey, FaceKey, PEdge, PFace, Polyhedron } from './polyhedron';
import { ringOf } from './polyhedron';
import { v3dot, v3sub } from '../geom/v3';

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
  /** How far each flap narrows at its ends (mm along the edge; its depth for 45°). */
  flapTaper: Record<EdgeKey, number>;
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

/** Does a set of outlines fit a W × H sheet in one of 8 turns? */
export function fitsSheet(rings: P2[][], W: number, H: number): boolean {
  const pts = rings.flat();
  for (let k = 0; k < 8; k++) {
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

/** A flap placed in an island's flat layout. */
type PlacedFlap = { edge: EdgeKey; on: FaceKey; depth: number; taper: number; ring: P2[] };
type Island = { faces: FaceKey[]; xf: Map<FaceKey, X>; flaps: PlacedFlap[] };
type Pass = { islands: Island[]; folds: Set<EdgeKey>; refusedFixed: EdgeKey[]; why: Set<'sheet' | 'overlap'> };

const boxApart = (a: Box, b: Box, tol: number) => a.x1 <= b.x0 + tol || b.x1 <= a.x0 + tol || a.y1 <= b.y0 + tol || b.y1 <= a.y0 + tol;

/**
 * A flap for cut edge e inside an island (faces and flaps it must miss): the face with the
 * smaller area-to-perimeter ratio first (the one carrying fewer flaps on a near tie), full
 * depth at 45°, then narrowing more steeply at its ends, then shallower; or null.
 */
function fitFlap(P: Polyhedron, e: PEdge, want: number, I: Island, rings: P2[][], W: number, H: number, carried: Map<FaceKey, number>, clear = 0): PlacedFlap | null {
  const ra = ratio(P.faces[e.a]), rb = ratio(P.faces[e.b]);
  const ca = carried.get(e.a) ?? 0, cb = carried.get(e.b) ?? 0;
  const first = Math.abs(ra - rb) < 0.05 * Math.max(ra, rb) ? (ca <= cb ? e.a : e.b) : ra <= rb ? e.a : e.b;
  const sides = [first, first === e.a ? e.b : e.a].filter((k) => I.xf.has(k));
  const tries = [want, want * 0.6, want * 0.35].flatMap((depth) => [[depth, depth], [depth, depth * 2.5], [depth, depth * 5]]);
  const others = [...rings, ...I.flaps.map((f) => f.ring)];
  const boxes = others.map(bbox);
  for (const [depth, taper] of tries)
    for (const on of sides) {
      const ring = flapRing(P, e, on, depth, I.xf.get(on)!, taper);
      // tested grown by the clearance, away from its own edge (it may touch the face it hangs from)
      const test = clear > 0 ? flapRing(P, e, on, depth + clear, I.xf.get(on)!, taper + clear).map((p, i, r) => (i === 0 || i === r.length - 1 ? p : p)) : ring;
      const tb = clear > 0 ? grow(test, clear) : test;
      const bb = bbox(tb);
      if (others.some((r, i) => !boxApart(boxes[i], bb, 0.05) && ringsOverlap(r, tb, 0.05))) continue;
      if (!fitsSheet([...others, ring], W, H)) continue;
      return { edge: e.key, on, depth, taper, ring };
    }
  return null;
}

function pass(P: Polyhedron, faces: FaceKey[], order: PEdge[], W: number, H: number, fixedFolds: PEdge[], flap: (e: PEdge) => number, live: PEdge[], clear = 0): Pass {
  const of = new Map<FaceKey, Island>();
  for (const k of faces) of.set(k, { faces: [k], xf: new Map([[k, ID]]), flaps: [] });
  const folds = new Set<EdgeKey>();
  const refusedFixed: EdgeKey[] = [];
  const why = new Set<'sheet' | 'overlap'>();
  const byFace = new Map<FaceKey, PEdge[]>();
  for (const e of live) {
    byFace.set(e.a, [...(byFace.get(e.a) ?? []), e]);
    byFace.set(e.b, [...(byFace.get(e.b) ?? []), e]);
  }
  const carried = new Map<FaceKey, number>();
  const tryJoin = (e: PEdge, fixedFold: boolean): boolean => {
    const IA = of.get(e.a), IB = of.get(e.b);
    if (!IA || !IB || IA === IB) return false;
    const A = P.faces[e.a], B = P.faces[e.b];
    const xa = IA.xf.get(A.key)!, xb = IB.xf.get(B.key)!;
    const pA = ap(xa, to2(A, e.p)), qA = ap(xa, to2(A, e.q));
    const pB = ap(xb, to2(B, e.p)), qB = ap(xb, to2(B, e.q));
    const M = match(pB, qB, pA, qA);
    const moved = new Map([...IB.xf].map(([k, t]) => [k, comp(M, t)] as [FaceKey, X]));
    const ringsA = IA.faces.map((k) => P.faces[k].outer.map((p) => ap(IA.xf.get(k)!, p)));
    const ringsB = IB.faces.map((k) => P.faces[k].outer.map((p) => ap(moved.get(k)!, p)));
    const flapsB = IB.flaps.map((f) => ({ ...f, ring: f.ring.map((p) => ap(M, p)) }));
    const allA = [...ringsA, ...IA.flaps.map((f) => f.ring)], allB = [...ringsB, ...flapsB.map((f) => f.ring)];
    if (!fitsSheet([...allA, ...allB], W, H)) return void why.add('sheet'), false;
    const boxesA = allA.map(bbox);
    for (const rb of allB) {
      const bb = bbox(rb);
      for (let i = 0; i < allA.length; i++) {
        if (boxApart(boxesA[i], bb, 1e-3)) continue;
        // a face may touch a flap along the edge it hangs from; anything more is an overlap
        if (ringsOverlap(allA[i], rb, i < ringsA.length && rb.length === 4 ? 0.05 : 1e-3)) return void why.add('overlap'), false;
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

/** A face's area over its perimeter: the smaller carries the flap (it is the easier one to glue onto the other). */
function ratio(f: PFace): number {
  const per = f.outer.reduce((s, p, i) => s + Math.hypot(f.outer[(i + 1) % f.outer.length].x - p.x, f.outer[(i + 1) % f.outer.length].y - p.y), 0);
  return Math.abs(f.area) / (per || 1);
}

/** How far a flap narrows at each end along its edge: the taper asked (its depth for 45°), at most a third of the edge. */
export const flapTaperLen = (L: number, depth: number, taper = depth) => Math.max(0, Math.min(taper, L / 3));

/** The flap on edge e as placed on face `on` (a trapezoid outward from the edge, tapered at 45°). */
function flapRing(P: Polyhedron, e: PEdge, on: FaceKey, depth: number, xf: X, taper = depth): P2[] {
  const f = P.faces[on];
  const ref = on === e.a ? e.ea : e.eb;
  const ring = ringOf(f, ref.ring);
  const a = ring[ref.i], b = ring[(ref.i + 1) % ring.length];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  // outward: to the right of a counter-clockwise outline's edge
  const ox = dy, oy = -dx;
  const tp = flapTaperLen(L, depth, taper);
  const q = (s: number, u: number): P2 => ap(xf, { x: a.x + dx * s + ox * u, y: a.y + dy * s + oy * u });
  return [q(0, 0), q(tp, depth), q(L - tp, depth), q(L, 0)];
}

type Flaps = { flapOn: Record<EdgeKey, FaceKey>; flapDepth: Record<EdgeKey, number>; flapTaper: Record<EdgeKey, number>; dropped: EdgeKey[] };

/** Flaps on a pass's cut edges: those placed while joining, then the edges between islands (each on its own island's side). */
function placeFlaps(P: Polyhedron, b: Pass, live: PEdge[], flap: (e: PEdge) => number, W: number, H: number, clear = 0): Flaps {
  const islandOf = new Map<FaceKey, Island>();
  for (const I of b.islands) for (const k of I.faces) islandOf.set(k, I);
  const flapOn: Record<EdgeKey, FaceKey> = {};
  const flapDepth: Record<EdgeKey, number> = {};
  const flapTaper: Record<EdgeKey, number> = {};
  const dropped: EdgeKey[] = [];
  const carried = new Map<FaceKey, number>();
  const extra = new Map<Island, PlacedFlap[]>();
  for (const I of b.islands)
    for (const f of I.flaps) {
      flapOn[f.edge] = f.on;
      flapDepth[f.edge] = f.depth;
      flapTaper[f.edge] = f.taper;
      carried.set(f.on, (carried.get(f.on) ?? 0) + 1);
    }
  const rings = new Map<Island, P2[][]>();
  const ringsOf = (I: Island) => {
    let r = rings.get(I);
    if (!r) rings.set(I, (r = I.faces.map((k) => P.faces[k].outer.map((p) => ap(I.xf.get(k)!, p)))));
    return r;
  };
  const cuts = live.filter((e) => !b.folds.has(e.key) && !(e.key in flapOn)).sort((x, y) => y.len - x.len || (x.key < y.key ? -1 : 1));
  for (const e of cuts) {
    const want = flap(e);
    if (!(want > 0)) continue;
    let got: PlacedFlap | null = null;
    // between two islands: try each island with its own face
    for (const side of [islandOf.get(e.a)!, islandOf.get(e.b)!]) {
      const view: Island = { ...side, flaps: [...side.flaps, ...(extra.get(side) ?? [])] };
      const only: PEdge = { ...e };
      const f = fitFlap(P, only, want, view, ringsOf(side), W, H, carried, clear);
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
    carried.set(got.on, (carried.get(got.on) ?? 0) + 1);
  }
  return { flapOn, flapDepth, flapTaper, dropped };
}

/** Unfold a solid (see the file's head). */
export function unfold(P: Polyhedron, spec: UnfoldSpec): Unfolding {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const open = new Set(spec.open ?? []);
  const faces = Object.keys(P.faces).filter((k) => !open.has(k));
  const live = Object.values(P.edges).filter((e) => !open.has(e.a) && !open.has(e.b) && e.ea.ring === 0 && e.eb.ring === 0);
  const fixed = spec.fixed ?? {};
  const fixedFolds = live.filter((e) => fixed[e.key] === 'fold');
  const free = live.filter((e) => !fixed[e.key]);
  const issues: UnfoldIssue[] = [];
  const { w: W, h: H } = spec.sheet;
  for (const k of faces) if (!fitsSheet([P.faces[k].outer], W, H)) issues.push({ kind: 'faceTooBig', face: k });
  const avg = live.reduce((s, e) => s + e.len, 0) / Math.max(1, live.length);
  const lenW = spec.prefer === 'cuts' ? 0.3 : 0.05;
  const weight = (e: PEdge, j: number) => {
    const bend = Math.abs(180 - e.dihedral) / 180;
    return (e.dihedral < 180 ? 0.5 : 1) * bend - lenW * (e.len / (avg || 1)) + j;
  };
  const rand = rng(spec.seed);
  const maxRestarts = spec.restarts ?? 40;
  const cap = spec.capMs ?? 2000;
  type Scored = Pass & { cut: number; flaps: Flaps; score: number };
  let best: Scored | null = null;
  let restarts = 0, firstPassMs = 0;
  for (;;) {
    const jitter = restarts === 0 ? 0 : 0.35;
    // a stable order: weight, then key (ties broken the same way everywhere)
    const order = free.map((e) => ({ e, w: weight(e, (rand() - 0.5) * jitter) })).sort((a, b) => a.w - b.w || (a.e.key < b.e.key ? -1 : 1)).map((x) => x.e);
    const r = pass(P, faces, order, W, H, fixedFolds, spec.flap, live, spec.clearance ?? 0);
    const cut = live.filter((e) => !r.folds.has(e.key)).reduce((s, e) => s + e.len, 0);
    const flaps = placeFlaps(P, r, live, spec.flap, W, H, spec.clearance ?? 0);
    if (restarts === 0) firstPassMs = now() - t0;
    // a dropped flap costs a piece: a seam that cannot be glued is as bad as another piece to glue on
    const score = r.islands.length + flaps.dropped.length;
    if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && cut < best.cut - 1e-9)) best = { ...r, cut, flaps, score };
    if ((best.islands.length <= 1 && !best.flaps.dropped.length) || restarts >= maxRestarts || now() - t0 > cap) break;
    restarts++;
  }
  const b = best!;
  for (const k of b.refusedFixed) issues.push({ kind: 'fixedFoldRefused', edge: k });
  // the islands, largest first, each with its faces in a stable order
  const islands = b.islands.map((I) => I.faces.slice().sort()).sort((x, y) => y.length - x.length || (x[0] < y[0] ? -1 : 1));
  if (islands.length > 1) issues.push({ kind: 'split', n: islands.length, why: Object.values(fixed).includes('cut') && b.why.size === 0 ? 'fixed' : b.why.has('sheet') ? 'sheet' : 'overlap' });
  for (const k of b.flaps.dropped) issues.push({ kind: 'flapDropped', edge: k });
  const { flapOn, flapDepth, flapTaper } = b.flaps;
  const place: Record<FaceKey, Xform2> = {};
  for (const I of b.islands) for (const [k, t] of I.xf) place[k] = { tx: t.tx, ty: t.ty, rot: Math.atan2(t.s, t.c) };
  return { folds: b.folds, islands, flapOn, flapDepth, flapTaper, place, issues, restarts, firstPassMs };
}

/** The faces of each island in the order a net is walked: the island's first face, then by breadth along its folds. */
export function islandOrder(P: Polyhedron, u: Pick<Unfolding, 'islands' | 'folds'>): FaceKey[] {
  const out: FaceKey[] = [];
  for (const I of u.islands) {
    // the largest face roots the island (it is laid down first and the others fold off it)
    const root = I.slice().sort((a, b) => Math.abs(P.faces[b].area) - Math.abs(P.faces[a].area) || (a < b ? -1 : 1))[0];
    out.push(root, ...I.filter((k) => k !== root));
  }
  return out;
}
