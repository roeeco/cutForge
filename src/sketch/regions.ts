// The area a sketch fills (SKETCH_OVERHAUL.md §5.3): its segments flattened, cut
// where they cross, split into connected pieces, the faces of each piece traced,
// and pieces nested so an outline inside a hole is solid again.
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import type { P2 } from '../model/types';
import { chains, degree, type Sketch } from './model';
import { allCuts, cutPieces, flatChain, SK_TOL, trimmedSegPoints } from './flatten';

/** Nodes closer than this are one (mm). */
const MERGE = 1e-6;
/** Faces smaller than this are dropped (mm²). */
const MIN_AREA = 0.01;

export type Region = P2[][][];

const area = (r: P2[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

/** Nodes in a grid of cells, so a point within MERGE of an existing node finds it. */
class Nodes {
  pts: P2[] = [];
  private cells = new Map<string, number[]>();
  private key = (x: number, y: number) => `${x},${y}`;
  get(p: P2): number {
    const cx = Math.floor(p.x / (MERGE * 10)), cy = Math.floor(p.y / (MERGE * 10));
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const i of this.cells.get(this.key(cx + dx, cy + dy)) ?? []) {
          const q = this.pts[i];
          if (Math.abs(q.x - p.x) <= MERGE && Math.abs(q.y - p.y) <= MERGE) return i;
        }
    const i = this.pts.length;
    this.pts.push({ x: p.x, y: p.y });
    const k = this.key(cx, cy);
    const c = this.cells.get(k);
    if (c) c.push(i);
    else this.cells.set(k, [i]);
    return i;
  }
}

type Edge = { a: P2; b: P2; cut: { t: number; p: P2 }[] };

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Record where two edges cross or touch away from their ends. */
function meet(e: Edge, f: Edge) {
  const rx = e.b.x - e.a.x, ry = e.b.y - e.a.y, sx = f.b.x - f.a.x, sy = f.b.y - f.a.y;
  const lr = Math.hypot(rx, ry), ls = Math.hypot(sx, sy);
  if (lr < MERGE || ls < MERGE) return;
  const qx = f.a.x - e.a.x, qy = f.a.y - e.a.y;
  const den = cross(rx, ry, sx, sy);
  const inside = (t: number, L: number) => t * L > MERGE && (1 - t) * L > MERGE;
  if (Math.abs(den) < 1e-12 * lr * ls) {
    // parallel: only overlapping collinear edges meet, at each other's ends
    if (Math.abs(cross(qx, qy, rx, ry)) / lr > MERGE) return;
    for (const p of [f.a, f.b]) {
      const t = ((p.x - e.a.x) * rx + (p.y - e.a.y) * ry) / (lr * lr);
      if (inside(t, lr)) e.cut.push({ t, p });
    }
    for (const p of [e.a, e.b]) {
      const t = ((p.x - f.a.x) * sx + (p.y - f.a.y) * sy) / (ls * ls);
      if (inside(t, ls)) f.cut.push({ t, p });
    }
    return;
  }
  const t = cross(qx, qy, sx, sy) / den, u = cross(qx, qy, rx, ry) / den;
  const et = MERGE / lr, eu = MERGE / ls;
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return;
  const p = { x: e.a.x + rx * t, y: e.a.y + ry * t };
  if (inside(t, lr)) e.cut.push({ t, p });
  if (inside(u, ls)) f.cut.push({ t: u, p });
}

/** Every pair of edges that may meet (a sweep along x). */
function allMeetings(edges: Edge[]) {
  const idx = edges.map((_, i) => i).sort((i, j) => Math.min(edges[i].a.x, edges[i].b.x) - Math.min(edges[j].a.x, edges[j].b.x));
  const active: number[] = [];
  for (const i of idx) {
    const e = edges[i];
    const x0 = Math.min(e.a.x, e.b.x);
    for (let k = active.length - 1; k >= 0; k--) {
      const f = edges[active[k]];
      if (Math.max(f.a.x, f.b.x) < x0 - MERGE) active.splice(k, 1);
    }
    const y0 = Math.min(e.a.y, e.b.y), y1 = Math.max(e.a.y, e.b.y);
    for (const j of active) {
      const f = edges[j];
      if (Math.max(f.a.y, f.b.y) < y0 - MERGE || Math.min(f.a.y, f.b.y) > y1 + MERGE) continue;
      meet(e, f);
    }
    active.push(i);
  }
}

const toRing = (r: P2[]): Ring => r.map((p) => [p.x, p.y] as [number, number]);
const fromRing = (r: Ring): P2[] => {
  const out = r.map(([x, y]) => ({ x, y }));
  if (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  return out;
};

/** The flattened non-construction pieces of a sketch: every segment between its corner cuts, and the cuts. */
export function sketchPolylines(sk: Sketch, tol = SK_TOL, facets?: number): P2[][] {
  const cuts = allCuts(sk);
  const out: P2[][] = [];
  for (const g of sk.order) {
    const s = sk.segs[g];
    if (!s || s.cons || !sk.pts[s.a] || !sk.pts[s.b]) continue;
    out.push(trimmedSegPoints(sk, g, cuts, tol, facets));
  }
  out.push(...cutPieces(sk, cuts, tol, facets));
  return out;
}

/** The planar graph of the pieces: nodes, and edges as node pairs (each once). */
function planarGraph(lines: P2[][]): { nodes: P2[]; adj: Map<number, Set<number>> } {
  const edges: Edge[] = [];
  for (const l of lines) for (let i = 0; i + 1 < l.length; i++) if (Math.hypot(l[i + 1].x - l[i].x, l[i + 1].y - l[i].y) > MERGE) edges.push({ a: l[i], b: l[i + 1], cut: [] });
  allMeetings(edges);
  const nodes = new Nodes();
  const adj = new Map<number, Set<number>>();
  const link = (i: number, j: number) => {
    if (i === j) return;
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i)!.add(j);
    adj.get(j)!.add(i);
  };
  for (const e of edges) {
    const stops = [e.a, ...e.cut.sort((p, q) => p.t - q.t).map((c) => c.p), e.b].map((p) => nodes.get(p));
    for (let i = 0; i + 1 < stops.length; i++) link(stops[i], stops[i + 1]);
  }
  return { nodes: nodes.pts, adj };
}

/** Remove dangling edges (repeatedly drop nodes with one neighbour). */
function prune(adj: Map<number, Set<number>>) {
  const queue = [...adj.keys()].filter((n) => adj.get(n)!.size <= 1);
  while (queue.length) {
    const n = queue.pop()!;
    const nb = adj.get(n);
    if (!nb) continue;
    for (const m of nb) {
      const s = adj.get(m)!;
      s.delete(n);
      if (s.size <= 1) queue.push(m);
    }
    adj.delete(n);
  }
}

/** Connected pieces of the graph, as node lists. */
function components(adj: Map<number, Set<number>>): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const n of adj.keys()) {
    if (seen.has(n)) continue;
    const comp: number[] = [];
    const stack = [n];
    seen.add(n);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const y of adj.get(x)!) if (!seen.has(y)) (seen.add(y), stack.push(y));
    }
    out.push(comp);
  }
  return out;
}

/** The bounded faces of one connected piece (counter-clockwise rings). */
function faces(nodes: P2[], adj: Map<number, Set<number>>, comp: number[]): P2[][] {
  const order = new Map<number, number[]>();
  for (const n of comp) {
    const p = nodes[n];
    order.set(n, [...adj.get(n)!].sort((i, j) => Math.atan2(nodes[i].y - p.y, nodes[i].x - p.x) - Math.atan2(nodes[j].y - p.y, nodes[j].x - p.x)));
  }
  const used = new Set<string>();
  const out: P2[][] = [];
  for (const u of comp)
    for (const v of order.get(u)!) {
      if (used.has(`${u}>${v}`)) continue;
      const ring: P2[] = [];
      let a = u, b = v;
      for (let guard = 0; guard < 1e6 && !used.has(`${a}>${b}`); guard++) {
        used.add(`${a}>${b}`);
        ring.push(nodes[a]);
        // at b, the next edge clockwise from the one we came along
        const list = order.get(b)!;
        const i = list.indexOf(a);
        const c = list[(i - 1 + list.length) % list.length];
        a = b;
        b = c;
      }
      if (ring.length >= 3 && area(ring) > MIN_AREA) out.push(ring);
    }
  return out;
}

const mpArea = (m: MultiPolygon) => m.reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * Math.abs(area(fromRing(r))), 0), 0);

function pointIn(p: P2, m: MultiPolygon): boolean {
  let inside = false;
  for (const poly of m)
    for (const r of poly)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
      }
  return inside;
}

/** Outer rings counter-clockwise, holes clockwise, no repeated last point. */
function normalise(m: MultiPolygon): Region {
  return m
    .map((poly) =>
      poly.map((r, i) => {
        let ring = fromRing(r);
        const a = area(ring);
        if ((i === 0 && a < 0) || (i > 0 && a > 0)) ring = ring.reverse();
        return ring;
      }),
    )
    .filter((poly) => poly.length && Math.abs(area(poly[0])) > MIN_AREA);
}

function computeRegion(sk: Sketch, tol: number, facets?: number): { region: Region; fallback: boolean } {
  const { nodes, adj } = planarGraph(sketchPolylines(sk, tol, facets));
  prune(adj);
  type Comp = { outline: MultiPolygon; area: number; probe: P2; parent: Comp | null; kids: Comp[] };
  const comps: Comp[] = [];
  for (const c of components(adj)) {
    const fs = faces(nodes, adj, c);
    if (!fs.length) continue;
    const polys = fs.map((f) => [toRing(f)] as Polygon);
    const outline: MultiPolygon = polys.length === 1 ? [polys[0]] : polygonClipping.union(polys[0], ...polys.slice(1));
    if (!outline.length) continue;
    comps.push({ outline, area: mpArea(outline), probe: fs[0][0], parent: null, kids: [] });
  }
  // nesting: the smallest piece that contains a piece is its parent
  for (const b of comps) {
    let best: Comp | null = null;
    for (const a of comps) if (a !== b && a.area > b.area && pointIn(b.probe, a.outline) && (!best || a.area < best.area)) best = a;
    b.parent = best;
    best?.kids.push(b);
  }
  const regionOf = (c: Comp): MultiPolygon => {
    const kids = c.kids.map(regionOf).filter((m) => m.length);
    return kids.length ? polygonClipping.difference(c.outline, ...kids) : c.outline;
  };
  const roots = comps.filter((c) => !c.parent).map(regionOf).filter((m) => m.length);
  const m = roots.length > 1 ? polygonClipping.union(roots[0], ...roots.slice(1)) : (roots[0] ?? []);
  return { region: normalise(m), fallback: false };
}

/** If the tracing fails: the union of the closed chains. */
function fallbackRegion(sk: Sketch, tol: number, facets?: number): Region {
  try {
    const cuts = allCuts(sk);
    const polys = chains(sk, { cons: false })
      .filter((c) => c.closed)
      .map((c) => flatChain(sk, c, tol, cuts, facets))
      .filter((r) => r.length >= 3)
      .map((r) => [toRing(r)] as Polygon);
    if (!polys.length) return [];
    return normalise(polygonClipping.union(polys[0], ...polys.slice(1)));
  } catch {
    return [];
  }
}

// keyed on the sketch object, and checked against its content (a sketch edited in place is not stale)
const cache = new WeakMap<object, Map<string, { sig: string; region: Region; fallback: boolean }>>();
const sigOf = (sk: Sketch) => JSON.stringify([sk.pts, sk.segs, sk.order]);

function regionInfo(sk: Sketch, tol = SK_TOL, facets?: number): { region: Region; fallback: boolean } {
  const key = `${tol}|${facets ?? ''}`;
  const sig = sigOf(sk);
  let m = cache.get(sk);
  const hit = m?.get(key);
  if (hit && hit.sig === sig) return hit;
  let r: { region: Region; fallback: boolean };
  try {
    r = computeRegion(sk, tol, facets);
  } catch {
    r = { region: fallbackRegion(sk, tol, facets), fallback: true };
  }
  if (!m) cache.set(sk, (m = new Map()));
  m.set(key, { ...r, sig });
  return r;
}

/** The area a sketch fills, as a multipolygon (outer rings counter-clockwise, holes clockwise). Cached by sketch object. */
export function sketchRegion(sk: Sketch, opts?: { tol?: number; facets?: number }): Region {
  return regionInfo(sk, opts?.tol ?? SK_TOL, opts?.facets).region;
}

/** Points where one non-construction segment ends and nothing continues. */
export function openEnds(sk: Sketch): string[] {
  return Object.keys(sk.pts).filter((p) => degree(sk, p, { cons: false }) === 1);
}

/** What a sketch makes: its area (mm²), its open ends, whether it is empty, and whether the fallback was used. */
export function sketchState(sk: Sketch): { area: number; open: string[]; empty: boolean; fallback: boolean } {
  const info = regionInfo(sk);
  const a = info.region.reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * Math.abs(area(r)), 0), 0);
  return { area: a, open: openEnds(sk), empty: a < MIN_AREA, fallback: info.fallback };
}

export { area as ringArea };
