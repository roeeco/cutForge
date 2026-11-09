// Seam geometry: how two panels meet in 3D, and what each connection kind
// cuts into them. Everything here is derived from panel frames and sizes, so
// joints follow dimension, thickness, clearance, count, spacing and angle
// changes automatically.
// shapes feed the edge layer: make sure the own-outline hook is installed
import './outline';
import type { ConnGeom, Connection, ConnectionKind, Design, Flap3d, MaterialProfile, Notch, P2, Panel, V3 } from './types';
import { edgeInwardLocal, edgeLength, edgeLocal, edgeWorld, frameNormal, matDir, toLocal, toWorld } from './frame';
import { edgeNeighbours, edgePieces, FACE, findEdge, isCurveKey, panelEdges, segDir, segInward, segLength, type EdgeArg } from './edges';
import { matOf, minWeb, pairFilter, tOf } from './materials';
import { throughHits, throughRegions } from './through';
import { pointInPolygon } from '../geom/vec';
import { v3add, v3cross, v3dot, v3len, v3mul, v3norm, v3sub } from '../geom/v3';

const TOL = 0.02; // mm, for "meets" tests
const PERP = 0.02; // |cos| below this counts as perpendicular

export function inwardWorld(p: Panel, e: EdgeArg): V3 {
  const i = edgeInwardLocal(p, e);
  return v3norm(v3add(v3mul(p.frame.u, i.x), v3mul(p.frame.v, i.y)));
}

/** Local point at parameter s along edge e, `depth` mm inward from it. */
export function edgePoint(p: Pick<Panel, 'w' | 'h' | 'sketch'>, e: EdgeArg, s: number, depth: number): P2 {
  const [a, b] = edgeLocal(p, e);
  const L = edgeLength(p, e);
  const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  const i = edgeInwardLocal(p, e);
  return { x: a.x + dx * s + i.x * depth, y: a.y + dy * s + i.y * depth };
}

export type CornerFit = {
  s0: number;
  s1: number;
  mapB: (s: number) => number;
  /** sin and cos of the corner (dihedral) angle α, measured inside between the two panels. */
  sin: number;
  cos: number;
};

/** Corner angles that joints are laid out for (POLYGONS_AND_CUTS.md §7). */
export const MIN_CORNER = 30, MAX_CORNER = 150;
const SIN_MIN = Math.sin((MIN_CORNER * Math.PI) / 180) - 1e-6;

/** Corner angle α in degrees from a fit. */
export const cornerAngle = (f: { sin: number; cos: number }) => (Math.atan2(f.sin, f.cos) * 180) / Math.PI;

/**
 * Two edges that coincide along a line, each panel's material overlapping the
 * other's slab (an outer corner, outer dimensions), at a corner angle between
 * 30° and 150°.
 */
export function cornerFit(A: Panel, eA: EdgeArg, B: Panel, eB: EdgeArg, minLen = 1, range?: [number, number]): CornerFit | null {
  const perp = Math.abs(v3dot(frameNormal(A.frame), frameNormal(B.frame))) <= PERP;
  const [a0, a1] = edgeWorld(A, eA), [b0, b1] = edgeWorld(B, eB);
  const La = v3len(v3sub(a1, a0)), dirA = v3norm(v3sub(a1, a0));
  const off = (p: V3) => {
    const r = v3sub(p, a0);
    return v3len(v3sub(r, v3mul(dirA, v3dot(r, dirA))));
  };
  if (off(b0) > TOL || off(b1) > TOL) return null;
  const ka = v3dot(inwardWorld(A, eA), matDir(B.frame)), kb = v3dot(inwardWorld(B, eB), matDir(A.frame));
  if (perp ? ka < 0.9 || kb < 0.9 : ka < SIN_MIN || kb < SIN_MIN) return null;
  const sb0 = v3dot(v3sub(b0, a0), dirA), sb1 = v3dot(v3sub(b1, a0), dirA);
  let s0 = Math.max(0, Math.min(sb0, sb1)), s1 = Math.min(La, Math.max(sb0, sb1));
  if (range) {
    s0 = Math.max(s0, range[0]);
    s1 = Math.min(s1, range[1]);
  }
  if (s1 - s0 < minLen) return null;
  const dirB = v3norm(v3sub(b1, b0));
  // cos α = −(material direction A · material direction B)
  const cos = perp ? 0 : -v3dot(matDir(A.frame), matDir(B.frame));
  return { s0, s1, mapB: (s) => v3dot(v3sub(v3add(a0, v3mul(dirA, s)), b0), dirB), sin: perp ? 1 : (ka + kb) / 2, cos };
}

/**
 * Corner of two panels at angle α (outer faces flush, square-cut ends): how
 * far the panel that gives way is cut back so it clears the other's slab
 * (t / sin α, or t·cot(α/2) when acute), and how far the owning panel's end
 * is trimmed so it does not poke out past the other's outer face when acute
 * (t·cot α). At 90° these are t and 0.
 */
export function cornerDepths(t: number, f: { sin: number; cos: number }, tOwn = t): { depth: number; trim: number } {
  // t: the other board's thickness (to clear), tOwn: the board's own (its square end)
  if (f.sin === 1 && f.cos === 0) return { depth: t, trim: 0 };
  return { depth: (t + Math.max(0, tOwn * f.cos)) / f.sin, trim: Math.max(0, (tOwn * f.cos) / f.sin) };
}

export type FaceFit = {
  s0: number;
  s1: number;
  /** Receiver slab along the owner's inward direction: [d0, d1]. */
  d0: number;
  d1: number;
  /** Owner inward · receiver material direction (±1). */
  k: number;
  /** Receiver depth of the owner edge (0 or t). */
  zE: number;
  /** Owner material direction · receiver material direction (0 when perpendicular). */
  m: number;
  /** Owner trim that keeps its end inside the receiver's outer face (acute corners). */
  trim: number;
  /** Every stretch of the owner edge on the receiver's outline (a notched receiver gives several), [s0, s1] each. */
  runs: [number, number][];
};

/**
 * An edge of panel A lying on a face plane of panel B (A ⟂ B). Covers an
 * edge standing on a face (tabs protrude through B), and an edge that runs
 * into B's slab (A is cut back by B's thickness), at any angle within B.
 */
export function faceFit(A: Panel, eA: EdgeArg, B: Panel, tB: number, angled = false, minLen = 2, range?: [number, number], inside = false, tA = tB): FaceFit | null {
  const perp = Math.abs(v3dot(frameNormal(A.frame), frameNormal(B.frame))) <= PERP;
  if (!perp && !angled) return null;
  const [p0, p1] = edgeWorld(A, eA);
  const mB = matDir(B.frame);
  const z0 = v3dot(v3sub(p0, B.frame.o), mB), z1 = v3dot(v3sub(p1, B.frame.o), mB);
  if (Math.abs(z0 - z1) > TOL) return null;
  let zE: number;
  if (Math.abs(z0) < TOL) zE = 0;
  else if (Math.abs(z0 - tB) < TOL) zE = tB;
  // closing seams: an edge that lies inside the other's slab (an overlap of up to t) is joined at the contact
  else if (inside && z0 > 0 && z0 < tB) zE = (z0 + z1) / 2;
  else return null;
  const k = v3dot(inwardWorld(A, eA), mB);
  if (Math.abs(k) < (perp ? 0.99 : SIN_MIN)) return null;
  let d0: number, d1: number, kk: number, m = 0, trim = 0;
  if (perp) {
    kk = Math.sign(k);
    const da = (0 - zE) / kk, db = (tB - zE) / kk;
    d0 = Math.min(da, db);
    d1 = Math.max(da, db);
  } else {
    // receiver depth of the owner point at inward distance d, owner depth z: zE + d·k + z·m
    kk = k;
    m = v3dot(matDir(A.frame), mB);
    const at = (target: number, z: number) => (target - zE - z * m) / k;
    const ds = [at(0, 0), at(0, tA), at(tB, 0), at(tB, tA)];
    d0 = Math.min(...ds);
    d1 = Math.max(...ds);
    // the owner's square end must not poke out past the face its edge lies on (acute corners)
    trim = Math.max(0, at(zE, 0), at(zE, tA));
  }
  const q0 = toLocal(B.frame, p0), q1 = toLocal(B.frame, p1);
  const spans = clipToOutline(B, q0, q1);
  if (!spans.length) return null;
  const L = edgeLength(A, eA);
  // every run on the receiver's outline (a notch splits it); the longest is the fit, or the one inside `range`
  const runs = spans
    .map(([t0, t1]) => [range ? Math.max(t0 * L, range[0]) : t0 * L, range ? Math.min(t1 * L, range[1]) : t1 * L] as [number, number])
    .filter(([a, b]) => b - a >= minLen);
  if (!runs.length) return null;
  const [s0, s1] = runs.reduce((x, y) => (y[1] - y[0] > x[1] - x[0] ? y : x));
  return { s0, s1, d0, d1, k: kk, zE, m, trim, runs };
}

/**
 * Parameter ranges [t0, t1] of segment q0 → q1 (B-local) that lie on B's
 * outline polygon, with a small tolerance: one for a convex outline, one per
 * inside run for a non-convex one.
 */
function clipToOutline(B: Panel, q0: P2, q1: P2): [number, number][] {
  const ring = panelEdges(B);
  const dx = q1.x - q0.x, dy = q1.y - q0.y;
  const rect =
    ring.length === 4 &&
    ring.every((e, i) => e.key === `e${i}`) &&
    ring[0].a.x === 0 && ring[0].a.y === 0 && ring[1].a.x === B.w && ring[1].a.y === 0 && ring[2].a.x === B.w && ring[2].a.y === B.h && ring[3].a.x === 0 && ring[3].a.y === B.h;
  if (rect) {
    // Liang–Barsky against the rectangle
    let t0 = 0, t1 = 1;
    const clip = (pp: number, qq: number) => {
      if (Math.abs(pp) < 1e-12) return qq >= -TOL;
      const r = qq / pp;
      if (pp < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      return true;
    };
    if (!clip(-dx, q0.x + TOL) || !clip(dx, B.w + TOL - q0.x) || !clip(-dy, q0.y + TOL) || !clip(dy, B.h + TOL - q0.y)) return [];
    return t1 > t0 ? [[t0, t1]] : [];
  }
  // general polygon: split at every crossing with an edge, keep runs whose midpoints are inside (or on) the outline
  const poly = ring.map((e) => e.a);
  const ts = [0, 1];
  for (const e of ring) {
    const ex = e.b.x - e.a.x, ey = e.b.y - e.a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((e.a.x - q0.x) * ey - (e.a.y - q0.y) * ex) / den;
    const u = ((e.a.x - q0.x) * dy - (e.a.y - q0.y) * dx) / den;
    if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const inside = (t: number) => {
    const q = { x: q0.x + dx * t, y: q0.y + dy * t };
    if (pointInPolygon(q, poly)) return true;
    return ring.some((e) => distToSeg(q, e.a, e.b) <= TOL);
  };
  const out: [number, number][] = [];
  let cur: [number, number] | null = null;
  for (let i = 0; i + 1 < ts.length; i++) {
    const a = ts[i], b = ts[i + 1];
    if (b - a < 1e-12) continue;
    if (inside((a + b) / 2)) {
      if (cur && Math.abs(cur[1] - a) < 1e-12) cur[1] = b;
      else out.push((cur = [a, b]));
    } else cur = null;
  }
  return out;
}

function distToSeg(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

export type CrossFit = { xA: number; xB: number; widthA: number; widthB: number; depthA: number; depthB: number };

/** Two upright panels crossing each other in their interiors (dividers). */
export function crossFit(A: Panel, B: Panel, t: number, tB = t): CrossFit | null {
  const tA = t;
  const nA = frameNormal(A.frame), nB = frameNormal(B.frame);
  if (Math.abs(v3dot(nA, nB)) > PERP || v3dot(A.frame.v, B.frame.v) < 0.999) return null;
  const mA = matDir(A.frame), mB = matDir(B.frame);
  const ka = v3dot(A.frame.u, mB), kb = v3dot(B.frame.u, mA);
  if (Math.abs(ka) < 0.99 || Math.abs(kb) < 0.99) return null;
  const midA = v3add(A.frame.o, v3mul(mA, tA / 2)), midB = v3add(B.frame.o, v3mul(mB, tB / 2));
  const xA = v3dot(v3sub(midB, midA), mB) / ka; // where B's mid-plane crosses A
  const xB = v3dot(v3sub(midA, midB), mA) / kb;
  const hA = tB / 2 + 0.5, hB = tA / 2 + 0.5;
  if (xA < hA || xA > A.w - hA || xB < hB || xB > B.w - hB) return null;
  // vertical overlap along the shared v axis
  const yA0 = v3dot(A.frame.o, A.frame.v), yB0 = v3dot(B.frame.o, A.frame.v);
  const lo = Math.max(yA0, yB0), hi = Math.min(yA0 + A.h, yB0 + B.h);
  if (hi - lo < 2) return null;
  const mid = (lo + hi) / 2;
  return { xA, xB, widthA: tB, widthB: tA, depthA: yA0 + A.h - mid, depthB: mid - yB0 };
}

/** Normalise notches on one edge: cuts win over protrusions where they overlap. */
export function normalizeNotches(list: Notch[], L: number): Notch[] {
  if (!list.length) return [];
  const xs = new Set<number>([0, L]);
  for (const n of list) {
    xs.add(Math.max(0, Math.min(L, n.s0)));
    xs.add(Math.max(0, Math.min(L, n.s1)));
  }
  const pts = [...xs].sort((a, b) => a - b);
  const out: Notch[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b - a < 1e-9) continue;
    const m = (a + b) / 2;
    const cov = list.filter((n) => n.s0 <= m && n.s1 >= m).map((n) => n.depth);
    if (!cov.length) continue;
    const pos = cov.filter((x) => x >= 0);
    const depth = pos.length ? Math.max(...pos) : Math.min(...cov);
    if (Math.abs(depth) < 1e-9) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.s1 - a) < 1e-9 && Math.abs(last.depth - depth) < 1e-9) last.s1 = b;
    else out.push({ s0: a, s1: b, depth });
  }
  return out;
}

function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop();
    lo.push(q);
  }
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Offset a convex CCW polygon outward by r. */
export function offsetConvex(poly: P2[], r: number): P2[] {
  if (r === 0) return poly;
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l; // outward for CCW
    return { a: { x: a.x + nx * r, y: a.y + ny * r }, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } };
  });
  return lines.map((L1, i) => {
    const L0 = lines[(i + n - 1) % n];
    const den = L0.d.x * L1.d.y - L0.d.y * L1.d.x;
    if (Math.abs(den) < 1e-12) return L1.a;
    const t = ((L1.a.x - L0.a.x) * L1.d.y - (L1.a.y - L0.a.y) * L1.d.x) / den;
    return { x: L0.a.x + L0.d.x * t, y: L0.a.y + L0.d.y * t };
  });
}

export function autoTabs(len: number): number {
  return Math.max(1, Math.round(len / 40));
}
export function autoFlap(m: MaterialProfile): number {
  return m.kind === 'card' ? 10 : m.kind === 'corrugated' ? Math.max(15, 4 * m.thickness) : 12;
}

/** Odd finger count for a seam: explicit or automatic (target ≈ max(3t, 10 mm)). */
export function fingerCountFor(c: Pick<Connection, 'fingers'>, length: number, t: number): number {
  if (c.fingers && c.fingers >= 3) return c.fingers % 2 ? c.fingers : c.fingers + 1;
  const target = Math.max(3 * t, 10);
  let n = Math.max(3, Math.round(length / target));
  if (n % 2 === 0) n += n * target < length ? 1 : -1;
  return Math.max(3, n);
}

/** Shortest contact a joint can be laid out on: three fingers or tab segments. */
export function minContact(d: Design, c: Pick<Connection, 'kind'> & Partial<Pick<Connection, 'a' | 'b' | 'grown'>>): number {
  const ids = c.a && c.b ? [c.a.panelId, c.b.panelId] : null;
  const t = ids ? Math.max(tOf(d, ids[0]), tOf(d, ids[1])) : d.material.thickness;
  if (c.kind === 'finger') return 3 * Math.max(t, 3);
  const m = c.a && c.b ? matOf(d, ownerOf(c as Connection).owner) : d.material;
  if (c.kind === 'tabslot') return 3 * (m.kind === 'corrugated' ? minTabWidth(m) : 2);
  return 0;
}

/** Raw length two panels of a seam share (ignoring the minimum a joint needs), or 0. */
export function seamContact(d: Design, c: Connection): number {
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return 0;
  if ((c.a.edge !== FACE && !findEdge(A, c.a.edge)) || (c.b.edge !== FACE && !findEdge(B, c.b.edge))) return 0;
  if (c.kind === 'halflap') return 0;
  if (c.b.edge !== FACE && !c.grown) {
    const f = cornerFit(A, c.a.edge, B, c.b.edge, 1e-6);
    if (f) return f.s1 - f.s0;
  }
  const o = ownerOf(c);
  const f = faceFit(d.panels[o.owner], o.edge, d.panels[o.receiver], tOf(d, o.receiver), !c.grown, 1e-6, undefined, !c.grown, tOf(d, o.owner));
  return f ? f.s1 - f.s0 : 0;
}

/** Owner (feature-carrying edge) and receiver of an edge-on-face connection. */
export function ownerOf(c: Connection): { owner: string; edge: string; receiver: string } {
  return c.grown ? { owner: c.b.panelId, edge: c.b.edge, receiver: c.a.panelId } : { owner: c.a.panelId, edge: c.a.edge, receiver: c.b.panelId };
}

const empty = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

/**
 * Past the ends of a corner's shared edge, a panel whose outline turns back
 * into the other's slab (a wall lowered at the corner) would overlap it: that
 * sliver is cut away (a strip `depth` deep along the edge line, beyond the edge).
 */
function cornerSlivers(P: Panel, key: string, depth: number): { panelId: string; poly: P2[] }[] {
  const e = findEdge(P, key);
  const nb = edgeNeighbours(P, key);
  if (!e || !nb || depth <= 0) return [];
  const out: { panelId: string; poly: P2[] }[] = [];
  const dir = segDir(e), inw = segInward(e), L = segLength(e);
  const far = 10000;
  const strip = (s0: number, s1: number) => [0, 1, 2, 3].map((i) => {
    const s = i === 0 || i === 3 ? s0 : s1, dd = i < 2 ? -0.001 : depth;
    return { x: e.a.x + dir.x * s + inw.x * dd, y: e.a.y + dir.y * s + inw.y * dd };
  });
  // material runs on past the edge's end (the next edge carries on forward and inward: a corner over 90°), or before its start
  const nd = segDir(nb[1]), pd = segDir(nb[0]);
  if (nd.x * dir.x + nd.y * dir.y > 1e-6 && nd.x * inw.x + nd.y * inw.y > 1e-6) out.push({ panelId: P.id, poly: strip(L, L + far) });
  if (pd.x * dir.x + pd.y * dir.y > 1e-6 && pd.x * inw.x + pd.y * inw.y < -1e-6) out.push({ panelId: P.id, poly: strip(-far, 0) });
  return out;
}

/** Geometry for one connection, or null when its panels no longer meet. */
export function connectionGeom(d: Design, c: Connection): ConnGeom | null {
  // a closing seam on an edge a cut split into pieces: one joint per pair of pieces that meet
  if (!c.grown && c.kind !== 'halflap') {
    const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
    if (!A || !B) return null;
    const pa = pieceKeys(A, c.a.edge), pb = c.b.edge === FACE ? [FACE] : pieceKeys(B, c.b.edge);
    if (pa.length > 1 || pb.length > 1 || pa[0] !== c.a.edge || pb[0] !== c.b.edge) {
      const g = empty();
      let any = false;
      for (const ka of pa)
        for (const kb of pb) {
          const cc = { ...c, a: { ...c.a, edge: ka }, b: { ...c.b, edge: kb } };
          const one = connectionGeomOne(d, cc);
          if (one) {
            any = true;
            g.edges.push(...one.edges);
            g.holes.push(...one.holes);
            g.adds.push(...one.adds);
            g.scores.push(...one.scores);
            g.flaps3d.push(...one.flaps3d);
            if (one.cuts?.length) g.cuts = [...(g.cuts ?? []), ...one.cuts];
          } else if (c.kind === 'finger' && kb !== FACE) {
            // pieces that still meet but too briefly for fingers: the second panel gives way there
            const f = cornerFit(A, ka, B, kb, 1e-6);
            if (f) {
              const b0 = f.mapB(f.s0), b1 = f.mapB(f.s1);
              g.edges.push({ panelId: B.id, edge: kb, notches: [{ s0: Math.min(b0, b1), s1: Math.max(b0, b1), depth: cornerDepths(tOf(d, A.id), f, tOf(d, B.id)).depth }] });
            }
          }
        }
      return any ? g : null;
    }
  }
  return connectionGeomOne(d, c);
}

/** Keys of the pieces of an edge (the edge itself when it is whole). */
export function pieceKeys(p: Panel, key: string): string[] {
  const ps = edgePieces(p, key);
  return ps.length ? ps.map((e) => e.key) : [key];
}

/** The edge a piece key belongs to (`e2#1` → `e2`). */
export const baseKey = (k: string) => k.replace(/#\d+$/, '');

/**
 * Contact left between the two panels of a seam along the owner edge after
 * through-cuts (layer 5), as intervals of [s0, s1]; null when nothing was cut.
 */
function survivingContact(d: Design, A: Panel, eA: string, B: Panel, eB: string, s0: number, s1: number): [number, number][] | null {
  const hits = throughHits(d);
  if (!hits.has(A.id) && !hits.has(B.id)) return null;
  const ea = findEdge(A, eA);
  if (!ea) return null;
  const rA = throughRegions(d, A.id), rB = throughRegions(d, B.id);
  const L = segLength(ea);
  const dx = (ea.b.x - ea.a.x) / L, dy = (ea.b.y - ea.a.y) / L;
  const eb = eB !== FACE ? findEdge(B, eB) : undefined;
  const ib = eb ? segInward(eb) : null;
  const gone = (s: number) => {
    const q = { x: ea.a.x + dx * s - dy * 0.05, y: ea.a.y + dy * s + dx * 0.05 };
    if (rA.some((r) => pointInPolygon(q, r))) return true;
    if (!rB.length) return false;
    const w = toWorld(A.frame, ea.a.x + dx * s, ea.a.y + dy * s, tOf(d, A.id) / 2);
    let qb = toLocal(B.frame, w);
    if (ib) qb = { x: qb.x + ib.x * 0.05, y: qb.y + ib.y * 0.05 };
    return rB.some((r) => pointInPolygon(qb, r));
  };
  const out: [number, number][] = [];
  let start: number | null = null, any = false;
  const step = 0.25;
  for (let s = s0; s <= s1 + 1e-9; s += step) {
    const g = gone(Math.min(s, s1));
    if (g) any = true;
    if (!g && start === null) start = Math.max(s0, s - step / 2);
    if (g && start !== null) {
      out.push([start, s - step / 2]);
      start = null;
    }
  }
  if (start !== null) out.push([start, s1]);
  return any ? out : null;
}

function mergeGeoms(parts: (ConnGeom | null)[]): ConnGeom | null {
  const g = empty();
  let any = false;
  for (const one of parts) {
    if (!one) continue;
    any = true;
    g.edges.push(...one.edges);
    g.holes.push(...one.holes);
    g.adds.push(...one.adds);
    g.scores.push(...one.scores);
    g.flaps3d.push(...one.flaps3d);
    if (one.cuts?.length) g.cuts = [...(g.cuts ?? []), ...one.cuts];
  }
  return any ? g : null;
}

function connectionGeomOne(d: Design, c: Connection, rng?: [number, number]): ConnGeom | null {
  const g = empty();
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return null;
  // each board's own thickness (one material: both are the design's)
  const tA = tOf(d, A.id), tB = tOf(d, B.id);
  const t = Math.max(tA, tB), cl = Math.max(matOf(d, A.id).clearance, matOf(d, B.id).clearance);
  // an edge that no longer exists (a deleted vertex): the joint is broken
  if ((c.a.edge !== FACE && !findEdge(A, c.a.edge)) || (c.b.edge !== FACE && !findEdge(B, c.b.edge))) return null;

  if (c.kind === 'fold' || c.kind === 'lean' || (c.kind === 'butt' && c.grown)) return g;

  if (c.kind === 'finger') {
    const fit = cornerFit(A, c.a.edge, B, c.b.edge, 1, rng);
    if (!fit) return null;
    if (!rng) {
      // a through-cut took part of the contact: lay fingers out on what is left
      const parts = survivingContact(d, A, c.a.edge, B, c.b.edge, fit.s0, fit.s1);
      if (parts) return mergeGeoms(parts.map((r) => (r[1] - r[0] >= minContact(d, c) ? connectionGeomOne(d, c, r) : null)));
    }
    const L = fit.s1 - fit.s0;
    // three fingers need some room: less contact than that (a notch in the edge) flags the seam
    if (L < minContact(d, c)) return null;
    const n = fingerCountFor(c, L, t);
    const seg = L / n;
    // angled fingers: depth across the other slab along this panel's plane (t / sin α)
    const { depth, trim: trimA } = cornerDepths(tB, fit, tA);
    const { depth: depthB, trim: trimB } = cornerDepths(tA, fit, tB);
    const na: Notch[] = [], nb: Notch[] = [];
    const onB = (s0: number, s1: number, dd: number) => {
      const b0 = fit.mapB(s0), b1 = fit.mapB(s1);
      nb.push({ s0: Math.min(b0, b1), s1: Math.max(b0, b1), depth: dd });
    };
    for (let k = 0; k < n; k++) {
      const s0 = fit.s0 + k * seg, s1 = fit.s0 + (k + 1) * seg;
      if (k % 2 === 1) {
        na.push({ s0: Math.max(fit.s0, s0 - cl / 2), s1: Math.min(fit.s1, s1 + cl / 2), depth });
        if (trimB > 0) onB(s0, s1, trimB);
      } else {
        onB(s0, s1, depthB);
        if (trimA > 0) na.push({ s0, s1, depth: trimA });
      }
    }
    // a wall reaching past its parent edge (an inside corner of a tray) sits on the parent's face there
    if (c.grown && B.ext) {
      const L = segLength(findEdge(B, c.b.edge)!);
      if (B.ext.s > 0) nb.push({ s0: 0, s1: B.ext.s, depth: tA });
      if (B.ext.e > 0) nb.push({ s0: L - B.ext.e, s1: L, depth: tA });
    }
    g.edges.push({ panelId: A.id, edge: c.a.edge, notches: na }, { panelId: B.id, edge: c.b.edge, notches: nb });
    if (!c.grown) {
      const sl = [...cornerSlivers(A, c.a.edge, depth), ...cornerSlivers(B, c.b.edge, depthB)];
      if (sl.length) g.cuts = sl;
    }
    return g;
  }

  if (c.kind === 'halflap') {
    const fit = crossFit(A, B, tA, tB);
    if (!fit) return null;
    const wA = fit.widthA + cl, wB = fit.widthB + cl;
    // A (the earlier panel) is slotted from its top edge, B from its bottom edge.
    g.edges.push({ panelId: A.id, edge: 'e2', notches: [{ s0: A.w - fit.xA - wA / 2, s1: A.w - fit.xA + wA / 2, depth: fit.depthA }] });
    g.edges.push({ panelId: B.id, edge: 'e0', notches: [{ s0: fit.xB - wB / 2, s1: fit.xB + wB / 2, depth: fit.depthB }] });
    return g;
  }

  if (c.kind === 'butt') {
    // a closing seam left as plain edges: valid while the panels still meet
    return faceFit(A, c.a.edge, B, tB, false, 2, undefined, false, tA) || (c.b.edge !== FACE && cornerFit(A, c.a.edge, B, c.b.edge)) ? g : null;
  }

  if (c.kind === 'glue' && c.grown) return grownGlue(d, c, A, B);

  // edge-on-face kinds: tabslot, slide, glue
  const { owner, edge, receiver } = ownerOf(c);
  const O = d.panels[owner], R = d.panels[receiver];
  const corner = !c.grown && c.b.edge !== FACE;
  // tabs and flaps are the owner's material; slots and fit the receiver's
  const mO = matOf(d, owner), tO = mO.thickness, tR = tOf(d, receiver), clR = matOf(d, receiver).clearance;
  const fit = faceFit(O, edge, R, tR, !c.grown, 2, rng, !c.grown, tO);
  if (!fit) return null;
  // a notched receiver: the joint is laid out on every stretch the owner edge still meets
  if (!rng && fit.runs.length > 1) return mergeGeoms(fit.runs.map((r) => connectionGeomOne(d, c, r)));
  if (!rng) {
    const parts = survivingContact(d, O, edge, R, c.grown ? FACE : c.b.edge === FACE ? FACE : c.b.edge, fit.s0, fit.s1);
    if (parts) return mergeGeoms(parts.map((r) => (r[1] - r[0] >= 2 ? connectionGeomOne(d, c, r) : null)));
  }
  const len = fit.s1 - fit.s0;
  if (corner && c.kind === 'tabslot') return cornerTabs(d, c, O, edge, R, c.b.edge, fit);
  if (corner && c.kind === 'glue' && fit.m !== 0) return cornerGlue(d, c, O, edge, R, c.b.edge, fit);

  if (c.kind === 'slide') {
    g.edges.push({ panelId: O.id, edge, notches: [{ s0: fit.s0, s1: fit.s1, depth: fit.d1 + clR }] });
    return g;
  }

  if (c.kind === 'tabslot') {
    const n = mO.kind === 'corrugated' ? tabCount(d, c, len, mO) : Math.max(1, Math.min(c.tabs ?? autoTabs(len), Math.floor((len / 6 - 1) / 2) || 1));
    const seg = len / (2 * n + 1);
    const notches: Notch[] = [];
    const lock = throughLock(d, c, mO);
    for (let k = 0; k < 2 * n + 1; k++) {
      const s0 = fit.s0 + k * seg, s1 = fit.s0 + (k + 1) * seg;
      notches.push({ s0, s1, depth: k % 2 ? fit.d0 - lock : fit.d1 });
      // a through tab folds under where it leaves the slot
      if (k % 2 && lock > 0) g.scores.push({ panelId: O.id, a: edgePoint(O, edge, s0, fit.d0), b: edgePoint(O, edge, s1, fit.d0) });
      if (k % 2) {
        const corners: P2[] = [];
        for (const s of [s0, s1])
          for (const dd of [fit.d0, fit.d1])
            for (const z of [0, tO]) {
              const lp = edgePoint(O, edge, s, dd);
              corners.push(toLocal(R.frame, toWorld(O.frame, lp.x, lp.y, z)));
            }
        g.holes.push({ panelId: R.id, poly: offsetConvex(hull(corners), clR / 2) });
      }
    }
    g.edges.push({ panelId: O.id, edge, notches });
    return g;
  }

  if (c.kind === 'glue') {
    const fh = (c.flap ?? d.joints?.[mO.kind]?.flap ?? autoFlap(mO));
    const taper = Math.min(fh, len / 3);
    if (fit.d1 > 1e-9) g.edges.push({ panelId: O.id, edge, notches: [{ s0: fit.s0, s1: fit.s1, depth: fit.d1 }] });
    const p = (s: number, u: number) => edgePoint(O, edge, s, fit.d1 - u);
    const flat = [p(fit.s0, 0), p(fit.s0 + taper, fh), p(fit.s1 - taper, fh), p(fit.s1, 0)];
    g.adds.push({ panelId: O.id, poly: flat });
    g.scores.push({ panelId: O.id, a: p(fit.s0, 0), b: p(fit.s1, 0) });
    // 3D: the flap folds along the receiver's face, towards the receiver's centre
    const mdO = matDir(O.frame);
    const centre = toWorld(R.frame, R.w / 2, R.h / 2, tR / 2);
    const [e0] = edgeWorld(O, edge);
    const sign = v3dot(v3sub(centre, e0), mdO) >= 0 ? 1 : -1;
    const start = sign > 0 ? tO : 0;
    const poly3 = [
      [fit.s0, 0],
      [fit.s0 + taper, fh],
      [fit.s1 - taper, fh],
      [fit.s1, 0],
    ].map(([s, u]) => {
      const lp = edgePoint(O, edge, s, fit.d1);
      const w = v3add(toWorld(O.frame, lp.x, lp.y, start), v3mul(mdO, sign * u));
      return toLocal(R.frame, w);
    });
    const zFace = fit.zE + fit.k * fit.d1;
    const [z0, z1] = zFace < tR / 2 ? [-tO, 0] : [tR, tR + tO];
    g.flaps3d.push(withFold(tO, O, flat, { panelId: R.id, poly: poly3, z0, z1 }, R));
    return g;
  }
  return null;
}

/**
 * Tab-and-slot at a corner where two edges meet (any corner angle): the owner
 * is cut back to the receiver's inner face except at its tabs, which run
 * through the receiver's thickness. Slots are each tab's volume projected onto
 * the receiver, grown by c/2 (clearance once). The receiver's end is extended
 * past the corner by a web so the slots are closed holes.
 */
function cornerTabs(d: Design, c: Connection, O: Panel, eO: string, R: Panel, eR: string, fit: FaceFit): ConnGeom {
  const mO = matOf(d, O.id), mR = matOf(d, R.id);
  const t = mO.thickness, cl = mR.clearance;
  const g = empty();
  const len = fit.s1 - fit.s0;
  const n = tabCount(d, c, len, mO);
  const seg = len / (2 * n + 1);
  const notches: Notch[] = [];
  const slots: P2[][] = [];
  const lock = throughLock(d, c, mO);
  for (let k = 0; k < 2 * n + 1; k++) {
    const s0 = fit.s0 + k * seg, s1 = fit.s0 + (k + 1) * seg;
    notches.push({ s0, s1, depth: k % 2 ? fit.trim - lock : fit.d1 });
    if (k % 2 && lock > 0) g.scores.push({ panelId: O.id, a: edgePoint(O, eO, s0, fit.trim), b: edgePoint(O, eO, s1, fit.trim) });
    if (k % 2) {
      const corners: P2[] = [];
      for (const s of [s0, s1])
        for (const dd of [fit.trim, fit.d1])
          for (const z of [0, t]) {
            const lp = edgePoint(O, eO, s, dd);
            corners.push(toLocal(R.frame, toWorld(O.frame, lp.x, lp.y, z)));
          }
      slots.push(offsetConvex(hull(corners), cl / 2));
    }
  }
  g.edges.push({ panelId: O.id, edge: eO, notches });
  for (const poly of slots) g.holes.push({ panelId: R.id, poly });
  // extend the receiver's end so a web stays outside the slots
  const re = findEdge(R, eR);
  const cf = cornerFit(O, eO, R, eR);
  if (re && cf) {
    const inw = segInward(re);
    let out = 0;
    for (const poly of slots) for (const q of poly) out = Math.max(out, -((q.x - re.a.x) * inw.x + (q.y - re.a.y) * inw.y));
    const b0 = cf.mapB(fit.s0), b1 = cf.mapB(fit.s1);
    g.edges.push({ panelId: R.id, edge: eR, notches: [{ s0: Math.max(0, Math.min(b0, b1)), s1: Math.min(segLength(re), Math.max(b0, b1)), depth: -(out + minWeb(mR)) }] });
  }
  return g;
}

/** Default length a through tab reaches past the receiver's far face, before it folds under. */
export function autoLockDepth(m: MaterialProfile): number {
  return Math.max(4, 1.5 * m.thickness);
}

/** How far a tab-and-slot joint's tabs reach past the receiver (0 for flush tabs). */
export function throughLock(d: Design, c: Pick<Connection, 'tabLen' | 'lockDepth'>, m: MaterialProfile = d.material): number {
  return c.tabLen === 'through' ? (c.lockDepth ?? autoLockDepth(m)) : 0;
}

/** Tab count for a tab-and-slot seam of this length (explicit or automatic), keeping tabs at least the material's minimum width. */
export function tabCount(d: Design, c: Pick<Connection, 'tabs'>, len: number, m: MaterialProfile = d.material): number {
  const minW = minTabWidth(m);
  const most = Math.max(1, Math.floor((len / minW - 1) / 2));
  return Math.max(1, Math.min(c.tabs ?? autoTabs(len), Math.floor((len / 6 - 1) / 2) || 1, most));
}

/** Smallest tab width: 6 mm segments generally; on corrugated at least max(4 mm, 3t) so a tab spans several flutes. */
export function minTabWidth(m: MaterialProfile): number {
  return m.kind === 'corrugated' ? Math.max(4, 3 * m.thickness) : 6;
}

/**
 * Glue flap at a corner that is not square: the owner is cut back to the
 * receiver's inner face and its flap folds by the corner angle onto that face.
 */
function cornerGlue(d: Design, c: Connection, O: Panel, eO: string, R: Panel, eR: string, fit: FaceFit): ConnGeom {
  const mO = matOf(d, O.id);
  const t = mO.thickness, tR = tOf(d, R.id);
  const g = empty();
  const len = fit.s1 - fit.s0;
  const fh = (c.flap ?? d.joints?.[mO.kind]?.flap ?? autoFlap(mO));
  const taper = Math.min(fh, len / 3);
  g.edges.push({ panelId: O.id, edge: eO, notches: [{ s0: fit.s0, s1: fit.s1, depth: fit.d1 }] });
  const p = (s: number, u: number) => edgePoint(O, eO, s, fit.d1 - u);
  const flat = [p(fit.s0, 0), p(fit.s0 + taper, fh), p(fit.s1 - taper, fh), p(fit.s1, 0)];
  g.adds.push({ panelId: O.id, poly: flat });
  g.scores.push({ panelId: O.id, a: p(fit.s0, 0), b: p(fit.s1, 0) });
  const cf = cornerFit(O, eO, R, eR);
  if (cf) {
    // on the receiver's inner face, starting where the owner's inner face meets it
    const x0 = (t + tR * cf.cos) / cf.sin;
    const q = (s: number, u: number) => edgePoint(R, eR, cf.mapB(s), x0 + u);
    g.flaps3d.push(withFold(t, O, flat, { panelId: R.id, poly: [q(fit.s0, 0), q(fit.s0 + taper, fh), q(fit.s1 - taper, fh), q(fit.s1, 0)], z0: tR, z1: tR + t }, R));
  }
  return g;
}

/**
 * Glue flap on a grown child's bottom edge, folded onto the parent's face
 * towards the parent's interior. Works at any angle.
 */
function grownGlue(d: Design, c: Connection, P: Panel, C: Panel): ConnGeom {
  const mC = matOf(d, C.id);
  const t = mC.thickness, tP = tOf(d, P.id);
  const g = empty();
  const L = C.w;
  const fh = (c.flap ?? d.joints?.[mC.kind]?.flap ?? autoFlap(mC));
  const taper = Math.min(fh, L / 3);
  const p = (s: number, u: number) => edgePoint(C, 'e0', s, -u);
  const flat = [p(0, 0), p(taper, fh), p(L - taper, fh), p(L, 0)];
  g.adds.push({ panelId: C.id, poly: flat });
  g.scores.push({ panelId: C.id, a: p(0, 0), b: p(L, 0) });
  // on the parent: along the parent edge (from where the child stands on it), from the child's position inwards
  const s0 = c.span && !c.trayId ? Math.min(c.span[0], c.span[1]) : 0;
  const q = (s: number, u: number) => edgePoint(P, c.a.edge, s0 + s, c.offset + u);
  const [z0, z1] = c.dir === 'up' ? [tP, tP + t] : [-t, 0];
  g.flaps3d.push(withFold(t, C, flat, { panelId: P.id, poly: [q(0, 0), q(taper, fh), q(L - taper, fh), q(L, 0)], z0, z1 }, P));
  return g;
}

/** Local coords of a world point (x, y on the plane, z into the material). */
function local3(p: Panel, w: V3): V3 {
  const d = v3sub(w, p.frame.o);
  return [v3dot(d, p.frame.u), v3dot(d, p.frame.v), v3dot(d, matDir(p.frame))];
}

/**
 * Records how a glue flap folds off its own panel (for the fold view). `flat`
 * is the flap as cut (owner-local, base corners first and last, on the score
 * line), lying in the owner's slab; `f` the flap as folded on R. The hinge is
 * the line the flat slab turns about to land on the folded one: along the
 * score line, through the point the two slabs' base mid-lines turn about (half
 * a thickness out from the fold, as for folded nets).
 */
function withFold(t: number, O: Panel, flat: P2[], f: Flap3d, R: Panel): Flap3d {
  const n = flat.length, m = f.poly.length;
  if (n < 3 || m < 3) return f;
  const mid = (a: P2, b: P2): P2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const sa = toWorld(O.frame, flat[0].x, flat[0].y), sb = toWorld(O.frame, flat[n - 1].x, flat[n - 1].y);
  const a = v3norm(v3sub(sb, sa));
  const perp = (v: V3) => v3norm(v3sub(v, v3mul(a, v3dot(v, a))));
  const fb = mid(flat[0], flat[n - 1]), ft = mid(flat[1], flat[n - 2]);
  const X = toWorld(O.frame, fb.x, fb.y, t / 2);
  const nf = perp(v3sub(toWorld(O.frame, ft.x, ft.y, t / 2), X));
  const zc = (f.z0 + f.z1) / 2;
  const gb = mid(f.poly[0], f.poly[m - 1]), gt = mid(f.poly[1], f.poly[m - 2]);
  const Y = toWorld(R.frame, gb.x, gb.y, zc);
  const ng = perp(v3sub(toWorld(R.frame, gt.x, gt.y, zc), Y));
  const th = Math.atan2(v3dot(v3cross(nf, ng), a), v3dot(nf, ng));
  if (!Number.isFinite(th) || Math.abs(th) < 1e-6) return { ...f, owner: O.id, hinge: [local3(O, sa), local3(O, sb)], angle: 0 };
  // pivot P (in the plane across the hinge, from X): rotating X about P by θ lands on Y
  const e1 = nf, e2 = v3cross(a, nf);
  const y1 = v3dot(v3sub(Y, X), e1), y2 = v3dot(v3sub(Y, X), e2);
  const c = Math.cos(th), s = Math.sin(th), det = 2 - 2 * c;
  const p1 = ((1 - c) * y1 - s * y2) / det, p2 = (s * y1 + (1 - c) * y2) / det;
  const P = v3add(X, v3add(v3mul(e1, p1), v3mul(e2, p2)));
  const len = v3len(v3sub(sb, sa)) || 1;
  return { ...f, owner: O.id, hinge: [local3(O, P), local3(O, v3add(P, v3mul(a, len)))], angle: (th * 180) / Math.PI };
}

export type SeamType = 'corner' | 'face' | 'cross';
export type OpenSeam = { type: SeamType; a: { panelId: string; edge: string }; b: { panelId: string; edge: string }; overlapping: boolean; /** Corner angle (degrees). */ angle?: number };

/** World segment where a seam's panels meet (along its owner edge), or null. */
function seamSegment(d: Design, s: { type: SeamType; a: EdgeRef2; b: EdgeRef2 }): [V3, V3] | null {
  const A = d.panels[s.a.panelId], B = d.panels[s.b.panelId];
  if (!A || !B || s.type === 'cross') return null;
  if (s.a.edge === FACE || !findEdge(A, s.a.edge)) return null;
  const f = s.type === 'corner' && s.b.edge !== FACE && findEdge(B, s.b.edge) ? cornerFit(A, s.a.edge, B, s.b.edge, 1e-6) : faceFit(A, s.a.edge, B, tOf(d, B.id), true, 1e-6, undefined, true, tOf(d, A.id));
  if (!f) return null;
  const [p0, p1] = edgeWorld(A, s.a.edge);
  const L = v3len(v3sub(p1, p0)) || 1;
  const at = (x: number) => v3add(p0, v3mul(v3sub(p1, p0), x / L));
  return [at(f.s0), at(f.s1)];
}
type EdgeRef2 = { panelId: string; edge: string };

/** Do two contact segments describe the same place (mostly within reach of each other)? */
function sameContact(x: [V3, V3], y: [V3, V3], reach: number): boolean {
  const near = (p: V3, q: [V3, V3]) => {
    const d = v3sub(q[1], q[0]);
    const l2 = v3dot(d, d);
    const k = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, v3dot(v3sub(p, q[0]), d) / l2));
    return v3len(v3sub(p, v3add(q[0], v3mul(d, k)))) <= reach;
  };
  let n = 0;
  for (let i = 0; i <= 4; i++) if (near(v3add(x[0], v3mul(v3sub(x[1], x[0]), i / 4)), y)) n++;
  let m = 0;
  for (let i = 0; i <= 4; i++) if (near(v3add(y[0], v3mul(v3sub(y[1], y[0]), i / 4)), x)) m++;
  return n >= 3 || m >= 3;
}

/**
 * Every distinct place two panels meet (ignoring any connection between
 * them), best first: corners, then edges on a face (straight or angled, also
 * an edge up to t inside the other's slab), then crossing panels. Two
 * candidates on the same edge, or touching in the same place, are one seam.
 */
export function seamsBetween(d: Design, A: Panel, B: Panel): OpenSeam[] {
  const tA = tOf(d, A.id), tB = tOf(d, B.id);
  // a curve's flattened segments are never joined
  const ka = panelEdges(A).map((e) => e.key).filter((k) => !isCurveKey(k)), kb = panelEdges(B).map((e) => e.key).filter((k) => !isCurveKey(k));
  const cand: OpenSeam[] = [];
  for (const ea of ka)
    for (const eb of kb) {
      const f = cornerFit(A, ea, B, eb);
      if (f) cand.push({ type: 'corner', a: { panelId: A.id, edge: ea }, b: { panelId: B.id, edge: eb }, overlapping: true, angle: cornerAngle(f) });
    }
  // an edge on the other's face; at a tray's inside corner the wall reaching across the corner is the one received
  const faceB = kb.map((e) => ({ e, f: faceFit(B, e, A, tA, true, 2, undefined, true, tB) })).filter((x) => x.f);
  const faceA = ka.map((e) => ({ e, f: faceFit(A, e, B, tB, true, 2, undefined, true, tA) })).filter((x) => x.f);
  const preferA = faceA.length && faceB.length && (B.ext?.s || B.ext?.e) && !(A.ext?.s || A.ext?.e);
  const fb = faceB.map((x) => ({ type: 'face' as const, a: { panelId: B.id, edge: x.e }, b: { panelId: A.id, edge: FACE }, overlapping: x.f!.d1 > 1e-6 }));
  const fa = faceA.map((x) => ({ type: 'face' as const, a: { panelId: A.id, edge: x.e }, b: { panelId: B.id, edge: FACE }, overlapping: x.f!.d1 > 1e-6 }));
  cand.push(...(preferA ? [...fa, ...fb] : [...fb, ...fa]));
  if (crossFit(A, B, tA, tB)) cand.push({ type: 'cross', a: { panelId: A.id, edge: FACE }, b: { panelId: B.id, edge: FACE }, overlapping: true });
  return dedupeSeams(d, cand, []);
}

/** Keep candidates that use no edge and no place already taken (by an earlier candidate or an existing connection). */
function dedupeSeams(d: Design, cand: OpenSeam[], taken: { type: SeamType; a: EdgeRef2; b: EdgeRef2 }[]): OpenSeam[] {
  const out: OpenSeam[] = [];
  const segs = taken.map((x) => seamSegment(d, x));
  for (const c of cand) {
    const all = [...taken, ...out];
    if (c.type === 'cross') {
      if (!all.some((x) => x.type === 'cross')) out.push(c);
      continue;
    }
    // the same two edges, or the same place reached from different edges, is one seam
    if (all.some((x) => seamKey(x) === seamKey(c))) continue;
    const seg = seamSegment(d, c);
    const segAll = [...segs, ...out.map((x) => seamSegment(d, x))];
    const t = Math.max(tOf(d, c.a.panelId), tOf(d, c.b.panelId));
    if (seg && segAll.some((x) => x && sameContact(seg, x, 2 * t + 0.05))) continue;
    out.push(c);
  }
  return out;
}

/** How two panels meet, if they do (ignoring any connection between them): the best of `seamsBetween`. */
export function seamBetween(d: Design, A: Panel, B: Panel): OpenSeam | null {
  return seamsBetween(d, A, B)[0] ?? null;
}

/** World boxes of two panels overlap (with a margin): a cheap test before looking for seams. */
function nearEachOther(d: Design, A: Panel, B: Panel): boolean {
  const box = (p: Panel) => {
    const t = tOf(d, p.id);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const e of panelEdges(p))
      for (const z of [0, t]) {
        const w = toWorld(p.frame, e.a.x, e.a.y, z);
        for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], w[k])), (hi[k] = Math.max(hi[k], w[k]));
      }
    return { lo, hi };
  };
  const a = box(A), b = box(B);
  return [0, 1, 2].every((k) => a.lo[k] <= b.hi[k] + 0.5 && b.lo[k] <= a.hi[k] + 0.5);
}

/**
 * Places where panels meet without a connection ("closing seams"). A pair can
 * have several (an L-shaped outline on a face, a wall touching along two
 * edges): a seam is identified by both its edges. Parent and child panels
 * (a grown connection) are joined by that connection alone.
 */
export function findOpenSeams(d: Design, only?: string): OpenSeam[] {
  const out: OpenSeam[] = [];
  const ids = d.order.filter((id) => d.panels[id]);
  const conns = Object.values(d.connections);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const A = d.panels[ids[i]], B = d.panels[ids[j]];
      if (only && A.id !== only && B.id !== only) continue;
      const mine = conns.filter((c) => (c.a.panelId === A.id && c.b.panelId === B.id) || (c.a.panelId === B.id && c.b.panelId === A.id));
      if (mine.some((c) => c.grown)) continue;
      if (!nearEachOther(d, A, B)) continue;
      const found = seamsBetween(d, A, B);
      if (!found.length) continue;
      if (!mine.length) {
        out.push(...found);
        continue;
      }
      out.push(...dedupeSeams(d, found, mine.map((c) => ({ type: seamTypeOf(c), a: c.a, b: c.b }))));
    }
  return out;
}

/** Does connection `c` still describe a way its panels meet (same type and edges)? */
export function seamStillFits(d: Design, c: Connection): boolean {
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return false;
  const type = seamTypeOf(c);
  const key = (r: { panelId: string; edge: string }) => `${r.panelId}:${baseKey(r.edge)}`;
  const have = [key(c.a), key(c.b)].sort().join();
  return seamsBetween(d, A, B).some((s) => s.type === type && [key(s.a), key(s.b)].sort().join() === have);
}

/** Key of a seam: its two panels and edges. */
export const seamKey = (s: { a: EdgeRef2; b: EdgeRef2 }) =>
  [`${s.a.panelId}:${baseKey(s.a.edge)}`, `${s.b.panelId}:${baseKey(s.b.edge)}`].sort().join('|');

/** What kind of meeting a closing seam is. */
export function seamTypeOf(c: Pick<Connection, 'kind' | 'b'>): SeamType {
  return c.kind === 'halflap' ? 'cross' : c.b.edge !== FACE ? 'corner' : 'face';
}

/** Connection kinds offered for a closing seam. */
export function seamKinds(m: MaterialProfile, type: SeamType, other?: MaterialProfile): ConnectionKind[] {
  if (other && other !== m) {
    const k = pairFilter(seamKinds(m, type), m, other);
    return k.length ? k : ['butt'];
  }
  if (type === 'cross') return ['halflap'];
  const ply = m.kind === 'plywood';
  // corners: tab-and-slot for every material at any corner angle; the corrugated default
  if (type === 'corner') return ply ? ['finger', 'tabslot', 'butt'] : m.kind === 'corrugated' ? ['tabslot', 'glue', 'slide', 'butt'] : ['glue', 'tabslot', 'slide', 'butt'];
  return ply ? ['tabslot', 'slide', 'butt'] : ['slide', 'glue', 'butt'];
}
