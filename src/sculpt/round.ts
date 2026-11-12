// Rounded corners for waffle sketches and footprints (WAFFLE_MODE.md §3.5).
// Re-written from the parked curved-walls branch (milestone 45, commit 3d19686,
// `src/model/edges.ts`): a tangent circular arc replaces a corner, flattened
// within 0.02 mm with every point on the circle, and where the arcs at the two
// ends of an edge would overlap, both are scaled down until they meet. When that
// branch merges, fold this file into its version (WAFFLE_MODE.md §10.5).
import type { P2, SculptPt, SketchGraph } from '../model/types';

/** Arc and curve flattening tolerance (mm): the chord's largest distance from the curve. */
export const ROUND_TOL = 0.02;

/** A rounded corner as built: its tangent points, centre, radius after clamping, and the radius asked for. */
export type Fillet = { i: number; t1: P2; t2: P2; c: P2; r: number; asked: number };

const unit = (x: number, y: number): P2 => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/**
 * The rounded corners of a closed outline: at each point with `r` > 0 a tangent
 * arc of radius r. Where the arcs at the two ends of an edge would overlap,
 * both are scaled down so they meet (the clamp).
 */
export function fillets(pts: SculptPt[]): (Fillet | null)[] {
  const n = pts.length;
  const out: (Fillet | null)[] = pts.map(() => null);
  if (n < 3) return out;
  const L = new Array<number>(n).fill(0), half = new Array<number>(n).fill(0);
  const u1s: P2[] = [], u2s: P2[] = [];
  for (let i = 0; i < n; i++) {
    const V = pts[i], P = pts[(i + n - 1) % n], N = pts[(i + 1) % n];
    const u1 = unit(P.x - V.x, P.y - V.y), u2 = unit(N.x - V.x, N.y - V.y);
    u1s.push(u1);
    u2s.push(u2);
    if (!(V.r && V.r > 0)) continue;
    const th = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    // a straight-through point or a spike has no corner to round
    if (th < 1e-6 || Math.PI - th < 1e-6) continue;
    half[i] = th / 2;
    L[i] = V.r / Math.tan(th / 2);
  }
  const scale = new Array<number>(n).fill(1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const len = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    if (L[i] + L[j] > len + 1e-12) {
      const k = len / (L[i] + L[j]);
      scale[i] = Math.min(scale[i], k);
      scale[j] = Math.min(scale[j], k);
    }
  }
  for (let i = 0; i < n; i++) {
    if (!L[i]) continue;
    const V = pts[i], u1 = u1s[i], u2 = u2s[i];
    const l = L[i] * scale[i], r = l * Math.tan(half[i]);
    const b = unit(u1.x + u2.x, u1.y + u2.y), dist = r / Math.sin(half[i]);
    out[i] = { i, t1: { x: V.x + u1.x * l, y: V.y + u1.y * l }, t2: { x: V.x + u2.x * l, y: V.y + u2.y * l }, c: { x: V.x + b.x * dist, y: V.y + b.y * dist }, r, asked: V.r! };
  }
  return out;
}

/** An arc from t1 to t2 about c (the short way round), flattened within ROUND_TOL; every point lies on the circle. */
export function arcPoints(f: Pick<Fillet, 't1' | 't2' | 'c' | 'r'>): P2[] {
  const a1 = Math.atan2(f.t1.y - f.c.y, f.t1.x - f.c.x), a2 = Math.atan2(f.t2.y - f.c.y, f.t2.x - f.c.x);
  let da = a2 - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da <= -Math.PI) da += 2 * Math.PI;
  const step = 2 * Math.acos(Math.max(-1, 1 - ROUND_TOL / Math.max(f.r, ROUND_TOL)));
  // an even count puts a point at the arc's middle
  const k = 2 * Math.max(1, Math.min(256, Math.ceil(Math.abs(da) / step / 2)));
  const out: P2[] = [];
  for (let j = 1; j < k; j++) out.push({ x: f.c.x + f.r * Math.cos(a1 + (da * j) / k), y: f.c.y + f.r * Math.sin(a1 + (da * j) / k) });
  return [f.t1, ...out, f.t2];
}

/** A run of the flattened outline and the sketch point it came from (for highlighting and the radius tool). */
type Run = { pts: P2[]; from: number; curve: boolean };

/**
 * A sketch's closed outline flattened: rounded corners become arcs (all points on
 * the circle), then the straight edges next to Curve points become smooth cubics
 * as main's base outlines do (`src/model/edges.ts` curveRing). CCW or CW as given.
 */
export function flattenSketch(pts: SculptPt[]): P2[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ x: p.x, y: p.y }));
  const fs = fillets(pts);
  // straight edges between corners (shortened by their fillets), with the arcs between them
  const edges: { a: P2; b: P2; sa: boolean; sb: boolean }[] = [];
  const arcs: P2[][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = fs[i]?.t2 ?? { x: pts[i].x, y: pts[i].y }, b = fs[j]?.t1 ?? { x: pts[j].x, y: pts[j].y };
    edges.push({ a, b, sa: !fs[i] && pts[i].curve === 'auto', sb: !fs[j] && pts[j].curve === 'auto' });
    arcs.push(fs[j] ? arcPoints(fs[j]!).slice(1, -1) : []);
  }
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const e = edges[i];
    if (!e.sa && !e.sb) runs.push({ pts: [e.a], from: i, curve: false });
    else {
      // a cubic: at a Curve point the tangent is parallel to the line between its neighbours, at a corner along the edge
      const A = e.a, B = e.b, Lh = Math.hypot(B.x - A.x, B.y - A.y);
      const prev = edges[(i + n - 1) % n].a, next = edges[(i + 1) % n].b;
      const tA = e.sa ? unit(B.x - prev.x, B.y - prev.y) : unit(B.x - A.x, B.y - A.y);
      const tB = e.sb ? unit(next.x - A.x, next.y - A.y) : unit(B.x - A.x, B.y - A.y);
      const P1 = { x: A.x + (tA.x * Lh) / 3, y: A.y + (tA.y * Lh) / 3 }, P2v = { x: B.x - (tB.x * Lh) / 3, y: B.y - (tB.y * Lh) / 3 };
      const M = Math.max(Math.hypot(A.x - 2 * P1.x + P2v.x, A.y - 2 * P1.y + P2v.y), Math.hypot(P1.x - 2 * P2v.x + B.x, P1.y - 2 * P2v.y + B.y));
      const k = Math.max(2, Math.min(64, Math.ceil(Math.sqrt((0.75 * M) / ROUND_TOL))));
      const q: P2[] = [A];
      for (let j = 1; j < k; j++) {
        const t = j / k, u = 1 - t;
        q.push({ x: u * u * u * A.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2v.x + t * t * t * B.x, y: u * u * u * A.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2v.y + t * t * t * B.y });
      }
      runs.push({ pts: q, from: i, curve: true });
    }
    // the end of the edge, then the arc of the next corner
    const j = (i + 1) % n;
    if (fs[j]) runs.push({ pts: [e.b, ...arcs[i]], from: j, curve: true });
  }
  const out: P2[] = [];
  for (const r of runs) for (const p of r.pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 1e-9) out.push(p);
  while (out.length > 3 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-9) out.pop();
  return out;
}

/** The radius each rounded corner really got (after the clamp), by point index; 0 where it is sharp. */
export function actualRadii(pts: SculptPt[]): number[] {
  const fs = fillets(pts);
  return pts.map((_, i) => fs[i]?.r ?? 0);
}

/** Corner radii as sketch points: a footprint polygon with radius `radii[i]` at corner i. */
export function withRadii(poly: P2[], radii: number[] | undefined): SculptPt[] {
  return poly.map((p, i) => (radii?.[i] && radii[i] > 0 ? { x: p.x, y: p.y, r: radii[i] } : { x: p.x, y: p.y }));
}

/**
 * The straight edges of a closed outline between its corners' fillets, and for
 * each edge next to a Curve point the cubic `flattenSketch` draws there (the
 * same control points), so an old outline can become a sketch graph exactly.
 */
export function autoEdges(pts: SculptPt[]): { a: P2; b: P2; curve: boolean; c1: P2; c2: P2 }[] {
  const n = pts.length;
  const fs = fillets(pts);
  const edges = pts.map((_, i) => {
    const j = (i + 1) % n;
    const a = fs[i]?.t2 ?? { x: pts[i].x, y: pts[i].y }, b = fs[j]?.t1 ?? { x: pts[j].x, y: pts[j].y };
    return { a, b, sa: !fs[i] && pts[i].curve === 'auto', sb: !fs[j] && pts[j].curve === 'auto' };
  });
  return edges.map((e, i) => {
    const A = e.a, B = e.b, Lh = Math.hypot(B.x - A.x, B.y - A.y);
    if (!e.sa && !e.sb) return { a: A, b: B, curve: false, c1: A, c2: B };
    const prev = edges[(i + n - 1) % n].a, next = edges[(i + 1) % n].b;
    const tA = e.sa ? unit(B.x - prev.x, B.y - prev.y) : unit(B.x - A.x, B.y - A.y);
    const tB = e.sb ? unit(next.x - A.x, next.y - A.y) : unit(B.x - A.x, B.y - A.y);
    return { a: A, b: B, curve: true, c1: { x: A.x + (tA.x * Lh) / 3, y: A.y + (tA.y * Lh) / 3 }, c2: { x: B.x - (tB.x * Lh) / 3, y: B.y - (tB.y * Lh) / 3 } };
  });
}

/**
 * A closed outline of milestone 50 (corners, Curve points and Round points) as a
 * sketch graph: points p0…pn and segments g0…gn (g i from point i to i + 1).
 * Curved edges become Beziers with the control points `flattenSketch` used. A
 * Round point between two straight edges keeps its `r`; one next to a curve
 * becomes its arc (points p{i}a, p{i}b and arc g{i}r), as it was drawn.
 */
export function outlineToGraph(pts: SculptPt[]): SketchGraph {
  const n = pts.length;
  const sk: SketchGraph = { pts: {}, segs: {}, order: [] };
  if (n < 2) return sk;
  const fs = n >= 3 ? fillets(pts) : pts.map(() => null);
  const edges = n >= 3 ? autoEdges(pts) : [];
  const curved = (i: number) => !!edges[((i % n) + n) % n]?.curve;
  // a fillet between two straight edges stays a property of its point; next to a curve it is drawn out
  const explode = pts.map((_, i) => !!fs[i] && (curved(i - 1) || curved(i)));
  pts.forEach((p, i) => {
    if (explode[i]) {
      const f = fs[i]!;
      sk.pts[`p${i}a`] = { x: f.t1.x, y: f.t1.y };
      sk.pts[`p${i}b`] = { x: f.t2.x, y: f.t2.y };
      const a1 = Math.atan2(f.t1.y - f.c.y, f.t1.x - f.c.x), a2 = Math.atan2(f.t2.y - f.c.y, f.t2.x - f.c.x);
      let da = a2 - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da <= -Math.PI) da += 2 * Math.PI;
      sk.segs[`g${i}r`] = { a: `p${i}a`, b: `p${i}b`, k: 'arc', bulge: Math.tan(da / 4) };
    } else {
      const q: SketchGraph['pts'][string] = { x: p.x, y: p.y };
      if (p.r && p.r > 0) q.r = p.r;
      if (p.curve === 'auto') q.smooth = true;
      sk.pts[`p${i}`] = q;
    }
  });
  const startOf = (i: number) => (explode[i] ? `p${i}b` : `p${i}`);
  const endOf = (i: number) => (explode[i] ? `p${i}a` : `p${i}`);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (n === 2 && i === 1) break;
    const a = startOf(i), b = endOf(j);
    const e = edges[i];
    if (e?.curve) sk.segs[`g${i}`] = { a, b, k: 'bez', ha: { x: e.c1.x - e.a.x, y: e.c1.y - e.a.y }, hb: { x: e.c2.x - e.b.x, y: e.c2.y - e.b.y } };
    else sk.segs[`g${i}`] = { a, b, k: 'line' };
    sk.order.push(`g${i}`);
    if (explode[j]) sk.order.push(`g${j}r`);
  }
  // the arc of point 0 comes before g0
  if (explode[0]) {
    sk.order = sk.order.filter((g) => g !== 'g0r');
    sk.order.unshift('g0r');
  }
  return sk;
}
