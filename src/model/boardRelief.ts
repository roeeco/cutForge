// Boards trimmed where they would run into each other (milestone 187). *Build from boards*
// stands a board inside each face of the shape, material inward. Where two faces share an
// edge that takes a joint (30–150°), the joint cuts the corner back. Two other meetings had
// nothing: boards that share only a point (a pyramid's apex, a loft's corners, a cone's tip)
// and edges too sharp or too flat for a joint (a wedge's tip, a sphere's facets). Their slabs
// ran into each other. Here the smaller board of each such pair gives way: the part of it
// that lies in the other board's slab is cut off its outline, so it stops against the
// other's inside face (glued edge to edge on an edge; clear of it at a point).
// Pure: a face graph and a thickness in, outlines (with their edges' names) out.
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import type { P2, V3 } from './types';
import type { EdgeKey, FaceKey, PEdge, PFace, Polyhedron } from './polyhedron';
import { v3dot, v3sub } from '../geom/v3';

export type Relief = {
  /** The trimmed outline, in the face's (u, v), counter-clockwise. */
  outer: P2[];
  /** Each edge's name: `e<i>` for what is left of the face's edge i, `r<k>` for an edge the trim made. */
  edgeIds: string[];
  /** The faces it gave way to. */
  to: FaceKey[];
  /** The face-graph edges where it now stands on the other board's inside face (a glued butt joint), and that board's face. */
  butts: { edge: EdgeKey; on: FaceKey }[];
};

/** How far a board keeps clear of one it meets only at a point (mm): past the export check's touch (0.05 mm). */
export const GAP = 0.3;

const area = (r: P2[]) => r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0) / 2;

/** Convex hull (monotone chain), counter-clockwise. */
function hull(pts: P2[]): P2[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** A convex counter-clockwise outline with every side moved out by `d` (mitred corners, at most 4d out). */
function offsetConvex(r: P2[], d: number): P2[] {
  const n = r.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n];
    const n1 = norm({ x: b.y - a.y, y: a.x - b.x }), n2 = norm({ x: c.y - b.y, y: b.x - c.x });
    const m = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
    const k = Math.min(4, 1 / Math.max(0.25, m.x * n1.x + m.y * n1.y));
    out.push({ x: b.x + m.x * d * k, y: b.y + m.y * d * k });
  }
  return out;
}
const norm = (v: P2): P2 => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

const world = (f: PFace, p: P2, depth: number): V3 => {
  const o = f.frame.o, u = f.frame.u, v = f.frame.v, n = f.n;
  return [0, 1, 2].map((k) => o[k] + u[k] * p.x + v[k] * p.y - n[k] * depth) as V3;
};
const local = (f: PFace, w: V3): P2 => ({ x: v3dot(v3sub(w, f.frame.o), f.frame.u), y: v3dot(v3sub(w, f.frame.o), f.frame.v) });
const ringOf = (r: P2[]): [number, number][] => [...r.map((p) => [p.x, p.y] as [number, number]), [r[0].x, r[0].y]];
const mpArea = (mp: MultiPolygon) => mp.reduce((s, poly) => s + poly.reduce((t, r, k) => {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return t + (k ? -1 : 1) * Math.abs(a / 2);
}, 0), 0);

/**
 * Where board A (on face A, t thick, material inward) would lie in board B's slab, as a
 * region of A's plane (a little more, never less; it reaches past A's outline): B's slab seen
 * along A's normal (its convex hull), within the band of A's plane at depths 0–t of B; `gap`
 * wider all round.
 */
function clash(A: PFace, B: PFace, t: number, gap = 0): MultiPolygon {
  // B's slab seen along A's normal: its outline on both faces of the board (`gap` wider all round)
  let proj = hull(B.outer.flatMap((p) => [world(B, p, 0), world(B, p, t)]).map((w) => local(A, w)));
  if (proj.length < 3) return [];
  if (gap > 0) proj = offsetConvex(proj, gap);
  // depth into B of A's point p at depth z: f(p) + z·g, with f linear in p
  const mB = B.n.map((x) => -x) as V3;
  const f0 = v3dot(v3sub(A.frame.o, B.frame.o), mB), fx = v3dot(A.frame.u, mB), fy = v3dot(A.frame.v, mB);
  const g = v3dot(A.n.map((x) => -x) as V3, mB);
  // some depth z of A in [0, t] lies in [0, t] of B: f within [−t·max(g, 0), t − t·min(g, 0)]
  const lo = -t * Math.max(g, 0) - gap, hi = t - t * Math.min(g, 0) + gap;
  const L = Math.hypot(fx, fy);
  if (L < 1e-9) return []; // parallel planes: no band (faces of one plane are merged)
  // the band as a long quad across A's outline
  const nx = fx / L, ny = fy / L, dx = -ny, dy = nx;
  const R = 10 * Math.max(1, ...A.outer.map((p) => Math.hypot(p.x, p.y)));
  const at = (s: number, w: number): P2 => ({ x: nx * s + dx * w, y: ny * s + dy * w });
  // f(p) = f0 + L·s along the normal direction: s from (lo − f0) / L to (hi − f0) / L
  const s0 = (lo - f0) / L, s1 = (hi - f0) / L;
  const band = [at(s0, -R), at(s1, -R), at(s1, R), at(s0, R)];
  // both convex: clipped here (polygon-clipping fails where their sides lie on one line, as for boards at right angles).
  // The region reaches past A's outline: `boardReliefs` measures it on A, `takeOff` cuts it
  const k = clipConvex(proj, band);
  return k.length >= 3 && Math.abs(area(k)) > 1e-9 ? [[ringOf(area(k) < 0 ? k.reverse() : k)]] : [];
}

/**
 * A convex region `mp` (one ring) taken off `left`, checked: what is left must be what was
 * there less what they share, measured by a convex clip of our own (polygon-clipping can
 * answer nothing left, or all of it shared, for a long sliver touching a corner). Again
 * with the region a hair wider if not; null when nothing holds (that cut is not made).
 */
function takeOff(left: MultiPolygon, mp: MultiPolygon): MultiPolygon | null {
  const k = mp[0]?.[0];
  if (!k) return left;
  const K = k.slice(0, -1).map(([x, y]) => ({ x, y }));
  for (const grow of [0, 0.02, 0.1]) {
    const ring = grow ? offsetConvex(area(K) < 0 ? K.slice().reverse() : K, grow) : K;
    const shared = left.reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * clipArea(r.slice(0, -1).map(([x, y]) => ({ x, y })), ring), 0), 0);
    try {
      const out = polygonClipping.difference(left, [[ringOf(ring)]]);
      if (Math.abs(mpArea(out) - (mpArea(left) - shared)) <= 0.005 * mpArea(left) + 0.5) return out;
    } catch {
      /* wider */
    }
  }
  return null;
}

/** The part of `subject` inside the convex ring `clip` (Sutherland–Hodgman): exact for any simple subject. */
function clipConvex(subject: P2[], clip: P2[]): P2[] {
  const s = area(clip) >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const p = clip[i], q = clip[(i + 1) % clip.length];
    const side = (x: P2) => s * ((q.x - p.x) * (x.y - p.y) - (q.y - p.y) * (x.x - p.x));
    const next: P2[] = [];
    for (let j = 0; j < out.length; j++) {
      const a = out[j], b = out[(j + 1) % out.length];
      const sa = side(a), sb = side(b);
      if (sa >= 0) next.push(a);
      if ((sa >= 0) !== (sb >= 0)) next.push({ x: a.x + ((b.x - a.x) * sa) / (sa - sb), y: a.y + ((b.y - a.y) * sa) / (sa - sb) });
    }
    out = next;
  }
  return out;
}
const clipArea = (subject: P2[], clip: P2[]) => Math.abs(area(clipConvex(subject, clip)));

/** The edges of a face graph between two faces' outlines, by pair. */
function edgesByPair(P: Polyhedron): Map<string, PEdge[]> {
  const m = new Map<string, PEdge[]>();
  for (const e of Object.values(P.edges)) {
    if (e.ea.ring || e.eb.ring) continue;
    const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}

const near = (a: V3, b: V3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-5;

/**
 * Each board that gives way, trimmed. `joined(e)`: the edge takes a joint (its own corner
 * cut-back), so its two boards are left alone. Of any other pair that meets (at an edge or a
 * point), the smaller board gives way. Pieces under `min` mm² are not cut.
 */
export function boardReliefs(P: Polyhedron, faces: FaceKey[], t: number, joined: (e: PEdge) => boolean, min = 0.05): Record<FaceKey, Relief> {
  const pairs = edgesByPair(P);
  const corners = new Map<FaceKey, V3[]>();
  for (const e of Object.values(P.edges))
    for (const f of [e.a, e.b]) {
      const list = corners.get(f) ?? [];
      for (const p of [e.p, e.q]) if (!list.some((q) => near(p, q))) list.push(p);
      corners.set(f, list);
    }
  const cut = new Map<FaceKey, { mps: MultiPolygon[]; to: FaceKey[]; butts: Relief['butts'] }>();
  const sorted = faces.slice().sort();
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const shared = pairs.get(`${a}|${b}`) ?? [];
      if (shared.length && shared.every(joined)) continue;
      if (!shared.length && !(corners.get(a) ?? []).some((p) => (corners.get(b) ?? []).some((q) => near(p, q)))) continue;
      const A = P.faces[a], B = P.faces[b];
      // the smaller gives way (the larger runs past it)
      const [lose, win] = Math.abs(A.area) < Math.abs(B.area) - 1e-6 || (Math.abs(Math.abs(A.area) - Math.abs(B.area)) <= 1e-6 && a > b) ? [A, B] : [B, A];
      // at a point it keeps clear by a gap (no joint there: they must not touch); at an edge it stands on the
      // other's inside face, glued there (a butt joint)
      const mp = clash(lose, win, t, shared.length ? 0 : GAP);
      if (!mp.length || clipArea(lose.outer, mp[0][0].slice(0, -1).map(([x, y]) => ({ x, y }))) < min) continue;
      const was = cut.get(lose.key);
      cut.set(lose.key, { mps: [...(was?.mps ?? []), mp], to: [...(was?.to ?? []), win.key], butts: [...(was?.butts ?? []), ...shared.map((e) => ({ edge: e.key, on: win.key }))] });
    }
  const out: Record<FaceKey, Relief> = {};
  for (const [k, c] of cut) {
    const f = P.faces[k];
    // each clash taken off in turn (a union of near-touching pieces is where polygon-clipping fails)
    let left: MultiPolygon = [[ringOf(f.outer)]];
    for (const mp of c.mps) left = takeOff(left, mp) ?? left;
    // the largest piece, its outline only (a trim never makes a hole)
    const best = left.map((poly) => poly[0].slice(0, -1).map(([x, y]) => ({ x, y }))).sort((x, y) => Math.abs(area(y)) - Math.abs(area(x)))[0];
    if (!best || best.length < 3) continue;
    const ring = tidy(area(best) < 0 ? best.reverse() : best);
    // a trim that would leave under a quarter of the board is not made (the shape is too thin there for boards; the
    // export check lists what then runs into what)
    if (ring.length < 3 || Math.abs(area(ring)) < 0.25 * Math.abs(f.area)) continue;
    out[k] = { outer: ring, edgeIds: names(f.outer, ring), to: c.to, butts: c.butts };
  }
  return out;
}

/** A clipped outline cleaned for a board: no repeated points, no edge under 0.2 mm, no point on a straight run. */
function tidy(r: P2[]): P2[] {
  let out = r.slice();
  for (let pass = 0; pass < 4 && out.length > 3; pass++) {
    const n0 = out.length;
    out = out.filter((p, i) => {
      const q = out[(i + 1) % out.length];
      return Math.hypot(q.x - p.x, q.y - p.y) > 0.2;
    });
    out = out.filter((p, i) => {
      const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
      const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-6 * la * lb + 1e-9;
    });
    if (out.length === n0) break;
  }
  return out;
}

/** Each trimmed edge's name: the face's edge it lies along (`e<i>`, the longest such keeps it), else `r<k>`. */
function names(orig: P2[], ring: P2[]): string[] {
  const n = orig.length;
  const on = (p: P2, i: number) => {
    const a = orig[i], b = orig[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L);
    return t > -1e-6 && t < 1 + 1e-6 && Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / L < 1e-4;
  };
  const cand = ring.map((p, j) => {
    const q = ring[(j + 1) % ring.length];
    const i = orig.findIndex((_, k) => on(p, k) && on(q, k));
    return { i, len: Math.hypot(q.x - p.x, q.y - p.y) };
  });
  const used = new Set<number>();
  // each face edge's name goes to its longest piece
  const order = cand.map((c, j) => ({ ...c, j })).filter((c) => c.i >= 0).sort((x, y) => y.len - x.len);
  const ids: string[] = ring.map(() => '');
  for (const c of order) if (!used.has(c.i)) (used.add(c.i), (ids[c.j] = `e${c.i}`));
  let r = 0;
  return ids.map((x) => x || `r${r++}`);
}
