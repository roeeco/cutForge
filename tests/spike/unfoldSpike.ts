// Milestone 119 (R0) spike: a greedy unfolder with seeded restarts
// (MODEL_MODES_RESEARCH.md §3's recommended pipeline, written fresh). Edges are
// joined in order of weight with union-find; a join is refused when the joined
// island would overlap itself or no longer fit the sheet in any of 8 turns.
// Restarts jitter the weights until the budget runs out; the best result has
// the fewest islands, then the shortest cut length. No flaps yet (R5 adds them
// to the overlap test).
import polygonClipping from 'polygon-clipping';
import type { SEdge, SFace, SGraph } from './facegraph';

type P2 = { x: number; y: number };
type X = { c: number; s: number; tx: number; ty: number };
type V3 = [number, number, number];

const ap = (t: X, p: P2): P2 => ({ x: t.c * p.x - t.s * p.y + t.tx, y: t.s * p.x + t.c * p.y + t.ty });
const comp = (a: X, b: X): X => ({ c: a.c * b.c - a.s * b.s, s: a.s * b.c + a.c * b.s, tx: a.c * b.tx - a.s * b.ty + a.tx, ty: a.s * b.tx + a.c * b.ty + a.ty });
const ID: X = { c: 1, s: 0, tx: 0, ty: 0 };
/** The rigid motion taking p1 → p2 and q1 → q2 (same distance). */
function match(p1: P2, q1: P2, p2: P2, q2: P2): X {
  const a1 = Math.atan2(q1.y - p1.y, q1.x - p1.x), a2 = Math.atan2(q2.y - p2.y, q2.x - p2.x);
  const c = Math.cos(a2 - a1), s = Math.sin(a2 - a1);
  return { c, s, tx: p2.x - (c * p1.x - s * p1.y), ty: p2.y - (s * p1.x + c * p1.y) };
}
const to2 = (f: SFace, p: V3): P2 => {
  const d = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
  return { x: d[0] * f.u[0] + d[1] * f.u[1] + d[2] * f.u[2], y: d[0] * f.v[0] + d[1] * f.v[1] + d[2] * f.v[2] };
};

/** A small seeded random (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Island = { faces: string[]; xf: Map<string, X> };
export type SpikeUnfolding = { islands: string[][]; folds: Set<string>; place: Map<string, X>; cutLength: number; restarts: number; firstPassMs: number };

const ringOf = (f: SFace, t: X) => f.outer.map((p) => ap(t, p));
const bbox = (r: P2[]) => ({ x0: Math.min(...r.map((p) => p.x)), y0: Math.min(...r.map((p) => p.y)), x1: Math.max(...r.map((p) => p.x)), y1: Math.max(...r.map((p) => p.y)) });
const polyArea = (mp: polygonClipping.MultiPolygon) => mp.reduce((s, poly) => s + poly.reduce((s2, r, k) => {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return s2 + (k ? -1 : 1) * Math.abs(a / 2);
}, 0), 0);

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
/** Separating axes for two convex rings: they overlap only if no edge normal separates them (by more than 1e-4 mm). */
function convexOverlap(a: P2[], b: P2[]): boolean {
  for (const r of [a, b])
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      const nx = q.y - p.y, ny = p.x - q.x, L = Math.hypot(nx, ny) || 1;
      const pr = (s: P2[]) => s.map((t) => (t.x * nx + t.y * ny) / L);
      const A = pr(a), B = pr(b);
      if (Math.max(...A) <= Math.min(...B) + 1e-4 || Math.max(...B) <= Math.min(...A) + 1e-4) return false;
    }
  return true;
}

/** Do two placed faces overlap (more than touching along an edge)? */
function overlaps(a: P2[], b: P2[]): boolean {
  const A = bbox(a), B = bbox(b);
  if (A.x1 <= B.x0 + 1e-6 || B.x1 <= A.x0 + 1e-6 || A.y1 <= B.y0 + 1e-6 || B.y1 <= A.y0 + 1e-6) return false;
  if (convex(a) && convex(b)) return convexOverlap(a, b);
  // polygon-clipping can fail on float noise where edges almost coincide: retried on coarser grids, and a
  // failure counts as an overlap (the join is refused, which is safe)
  for (const g of [0, 1e-6, 1e-5, 1e-4]) {
    const snap = (v: number) => (g ? Math.round(v / g) * g : v);
    const ring = (r: P2[]) => [...r.map((p) => [snap(p.x), snap(p.y)] as [number, number]), [snap(r[0].x), snap(r[0].y)] as [number, number]];
    try {
      return polyArea(polygonClipping.intersection([ring(a)], [ring(b)])) > 0.01;
    } catch {
      /* the next grid */
    }
  }
  return true;
}

/** Does an island fit a W × H sheet in one of 8 turns? */
function fits(rings: P2[][], W: number, H: number): boolean {
  const pts = rings.flat();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 8, c = Math.cos(a), s = Math.sin(a);
    const xs = pts.map((p) => c * p.x - s * p.y), ys = pts.map((p) => s * p.x + c * p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if ((w <= W && h <= H) || (w <= H && h <= W)) return true;
  }
  return false;
}

function pass(g: SGraph, order: SEdge[], W: number, H: number): { islands: Island[]; folds: Set<string> } {
  const face = new Map(g.faces.map((f) => [f.key, f]));
  const of = new Map<string, Island>();
  for (const f of g.faces) of.set(f.key, { faces: [f.key], xf: new Map([[f.key, ID]]) });
  const folds = new Set<string>();
  for (const e of order) {
    const IA = of.get(e.a)!, IB = of.get(e.b)!;
    if (IA === IB) continue;
    const A = face.get(e.a)!, B = face.get(e.b)!;
    // the shared edge in each island's coordinates; B's island moved so its edge lies on A's (B on the far side, no mirror)
    const pA = ap(IA.xf.get(A.key)!, to2(A, e.p)), qA = ap(IA.xf.get(A.key)!, to2(A, e.q));
    const pB = ap(IB.xf.get(B.key)!, to2(B, e.p)), qB = ap(IB.xf.get(B.key)!, to2(B, e.q));
    const M = match(pB, qB, pA, qA);
    const moved = new Map([...IB.xf].map(([k, t]) => [k, comp(M, t)]));
    // refuse an overlap or a net too big for the sheet
    const ringsA = IA.faces.map((k) => ringOf(face.get(k)!, IA.xf.get(k)!));
    const ringsB = IB.faces.map((k) => ringOf(face.get(k)!, moved.get(k)!));
    if (!fits([...ringsA, ...ringsB], W, H)) continue;
    let bad = false;
    for (const rb of ringsB) {
      for (const ra of ringsA)
        if (overlaps(ra, rb)) {
          bad = true;
          break;
        }
      if (bad) break;
    }
    if (bad) continue;
    const J: Island = { faces: [...IA.faces, ...IB.faces], xf: new Map([...IA.xf, ...moved]) };
    for (const k of J.faces) of.set(k, J);
    folds.add(e.key);
  }
  return { islands: [...new Set(of.values())], folds };
}

/** Unfold with restarts until the budget runs out; deterministic for a seed. */
export function unfoldSpike(g: SGraph, opt: { sheetW: number; sheetH: number; budgetMs: number; seed: number }): SpikeUnfolding {
  const avg = g.edges.reduce((s, e) => s + e.len, 0) / Math.max(1, g.edges.length);
  const weight = (e: SEdge, j: number) => Math.abs(180 - e.dihedral) / 180 - 0.05 * (e.len / avg) + j;
  const rand = rng(opt.seed);
  const t0 = performance.now();
  let best: { islands: Island[]; folds: Set<string>; cut: number } | null = null;
  let restarts = 0, firstPassMs = 0;
  do {
    const jitter = restarts === 0 ? 0 : 0.35;
    const order = g.edges.map((e) => ({ e, w: weight(e, (rand() - 0.5) * jitter) })).sort((a, b) => a.w - b.w).map((x) => x.e);
    const r = pass(g, order, opt.sheetW, opt.sheetH);
    if (restarts === 0) firstPassMs = performance.now() - t0;
    const cut = g.edges.filter((e) => !r.folds.has(e.key)).reduce((s, e) => s + e.len, 0);
    if (!best || r.islands.length < best.islands.length || (r.islands.length === best.islands.length && cut < best.cut - 1e-9)) best = { ...r, cut };
    restarts++;
  } while (performance.now() - t0 < opt.budgetMs && best.islands.length > 1 && restarts < 500);
  const place = new Map<string, X>();
  for (const I of best!.islands) for (const [k, t] of I.xf) place.set(k, t);
  return { islands: best!.islands.map((I) => I.faces), folds: best!.folds, place, cutLength: best!.cut, restarts, firstPassMs };
}

/** Check a result: no two faces of an island overlap, and each island fits the sheet. */
export function verify(g: SGraph, u: SpikeUnfolding, W: number, H: number): { overlapFree: boolean; fit: boolean } {
  const face = new Map(g.faces.map((f) => [f.key, f]));
  let overlapFree = true, fit = true;
  for (const I of u.islands) {
    const rings = I.map((k) => ringOf(face.get(k)!, u.place.get(k)!));
    if (!fits(rings, W, H)) fit = false;
    for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) if (overlaps(rings[i], rings[j])) overlapFree = false;
  }
  return { overlapFree, fit };
}
