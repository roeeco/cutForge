// Seam geometry: how two panels meet in 3D, and what each connection kind
// cuts into them. Everything here is derived from panel frames and sizes, so
// joints follow dimension, thickness, clearance, count, spacing and angle
// changes automatically.
import type { ConnGeom, Connection, ConnectionKind, Design, MaterialProfile, Notch, P2, Panel, V3 } from './types';
import { edgeInwardLocal, edgeLength, edgeLocal, edgeWorld, frameNormal, matDir, toLocal, toWorld } from './frame';
import { v3add, v3dot, v3len, v3mul, v3norm, v3sub } from '../geom/v3';

const TOL = 0.02; // mm, for "meets" tests
const PERP = 0.02; // |cos| below this counts as perpendicular

export function inwardWorld(p: Panel, e: number): V3 {
  const i = edgeInwardLocal(e);
  return v3norm(v3add(v3mul(p.frame.u, i.x), v3mul(p.frame.v, i.y)));
}

/** Local point at parameter s along edge e, `depth` mm inward from it. */
export function edgePoint(p: { w: number; h: number }, e: number, s: number, depth: number): P2 {
  const [a, b] = edgeLocal(p, e);
  const L = edgeLength(p, e);
  const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  const i = edgeInwardLocal(e);
  return { x: a.x + dx * s + i.x * depth, y: a.y + dy * s + i.y * depth };
}

export type CornerFit = { s0: number; s1: number; mapB: (s: number) => number };

/**
 * Two edges that coincide along a line, on perpendicular panels, each panel's
 * material overlapping the other's slab (an outer corner, outer dimensions).
 */
export function cornerFit(A: Panel, eA: number, B: Panel, eB: number): CornerFit | null {
  if (Math.abs(v3dot(frameNormal(A.frame), frameNormal(B.frame))) > PERP) return null;
  const [a0, a1] = edgeWorld(A, eA), [b0, b1] = edgeWorld(B, eB);
  const La = v3len(v3sub(a1, a0)), dirA = v3norm(v3sub(a1, a0));
  const off = (p: V3) => {
    const r = v3sub(p, a0);
    return v3len(v3sub(r, v3mul(dirA, v3dot(r, dirA))));
  };
  if (off(b0) > TOL || off(b1) > TOL) return null;
  if (v3dot(inwardWorld(A, eA), matDir(B.frame)) < 0.9 || v3dot(inwardWorld(B, eB), matDir(A.frame)) < 0.9) return null;
  const sb0 = v3dot(v3sub(b0, a0), dirA), sb1 = v3dot(v3sub(b1, a0), dirA);
  const s0 = Math.max(0, Math.min(sb0, sb1)), s1 = Math.min(La, Math.max(sb0, sb1));
  if (s1 - s0 < 1) return null;
  const dirB = v3norm(v3sub(b1, b0));
  return { s0, s1, mapB: (s) => v3dot(v3sub(v3add(a0, v3mul(dirA, s)), b0), dirB) };
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
};

/**
 * An edge of panel A lying on a face plane of panel B (A ⟂ B). Covers an
 * edge standing on a face (tabs protrude through B), and an edge that runs
 * into B's slab (A is cut back by B's thickness), at any angle within B.
 */
export function faceFit(A: Panel, eA: number, B: Panel, tB: number): FaceFit | null {
  if (Math.abs(v3dot(frameNormal(A.frame), frameNormal(B.frame))) > PERP) return null;
  const [p0, p1] = edgeWorld(A, eA);
  const mB = matDir(B.frame);
  const z0 = v3dot(v3sub(p0, B.frame.o), mB), z1 = v3dot(v3sub(p1, B.frame.o), mB);
  if (Math.abs(z0 - z1) > TOL) return null;
  let zE: number;
  if (Math.abs(z0) < TOL) zE = 0;
  else if (Math.abs(z0 - tB) < TOL) zE = tB;
  else return null;
  const k = v3dot(inwardWorld(A, eA), mB);
  if (Math.abs(k) < 0.99) return null;
  const kk = Math.sign(k);
  const da = (0 - zE) / kk, db = (tB - zE) / kk;
  // clip the edge to B's rectangle (Liang–Barsky), with a small tolerance
  const q0 = toLocal(B.frame, p0), q1 = toLocal(B.frame, p1);
  let t0 = 0, t1 = 1;
  const dx = q1.x - q0.x, dy = q1.y - q0.y;
  const clip = (pp: number, qq: number) => {
    if (Math.abs(pp) < 1e-12) return qq >= -TOL;
    const r = qq / pp;
    if (pp < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    return true;
  };
  if (!clip(-dx, q0.x + TOL) || !clip(dx, B.w + TOL - q0.x) || !clip(-dy, q0.y + TOL) || !clip(dy, B.h + TOL - q0.y)) return null;
  const L = edgeLength(A, eA);
  const s0 = t0 * L, s1 = t1 * L;
  if (s1 - s0 < 2) return null;
  return { s0, s1, d0: Math.min(da, db), d1: Math.max(da, db), k: kk, zE };
}

export type CrossFit = { xA: number; xB: number; widthA: number; widthB: number; depthA: number; depthB: number };

/** Two upright panels crossing each other in their interiors (dividers). */
export function crossFit(A: Panel, B: Panel, t: number): CrossFit | null {
  const nA = frameNormal(A.frame), nB = frameNormal(B.frame);
  if (Math.abs(v3dot(nA, nB)) > PERP || v3dot(A.frame.v, B.frame.v) < 0.999) return null;
  const mA = matDir(A.frame), mB = matDir(B.frame);
  const ka = v3dot(A.frame.u, mB), kb = v3dot(B.frame.u, mA);
  if (Math.abs(ka) < 0.99 || Math.abs(kb) < 0.99) return null;
  const midA = v3add(A.frame.o, v3mul(mA, t / 2)), midB = v3add(B.frame.o, v3mul(mB, t / 2));
  const xA = v3dot(v3sub(midB, midA), mB) / ka; // where B's mid-plane crosses A
  const xB = v3dot(v3sub(midA, midB), mA) / kb;
  const half = t / 2 + 0.5;
  if (xA < half || xA > A.w - half || xB < half || xB > B.w - half) return null;
  // vertical overlap along the shared v axis
  const yA0 = v3dot(A.frame.o, A.frame.v), yB0 = v3dot(B.frame.o, A.frame.v);
  const lo = Math.max(yA0, yB0), hi = Math.min(yA0 + A.h, yB0 + B.h);
  if (hi - lo < 2) return null;
  const mid = (lo + hi) / 2;
  return { xA, xB, widthA: t, widthB: t, depthA: yA0 + A.h - mid, depthB: mid - yB0 };
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

/** Owner (feature-carrying edge) and receiver of an edge-on-face connection. */
export function ownerOf(c: Connection): { owner: string; edge: number; receiver: string } {
  return c.grown ? { owner: c.b.panelId, edge: c.b.edge, receiver: c.a.panelId } : { owner: c.a.panelId, edge: c.a.edge, receiver: c.b.panelId };
}

const empty = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

/** Geometry for one connection, or null when its panels no longer meet. */
export function connectionGeom(d: Design, c: Connection): ConnGeom | null {
  const t = d.material.thickness, cl = d.material.clearance;
  const g = empty();
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return null;

  if (c.kind === 'fold' || c.kind === 'lean' || (c.kind === 'butt' && c.grown)) return g;

  if (c.kind === 'finger') {
    const fit = cornerFit(A, c.a.edge, B, c.b.edge);
    if (!fit) return null;
    const L = fit.s1 - fit.s0;
    const n = fingerCountFor(c, L, t);
    const seg = L / n;
    const na: Notch[] = [], nb: Notch[] = [];
    for (let k = 0; k < n; k++) {
      const s0 = fit.s0 + k * seg, s1 = fit.s0 + (k + 1) * seg;
      if (k % 2 === 1) na.push({ s0: Math.max(fit.s0, s0 - cl / 2), s1: Math.min(fit.s1, s1 + cl / 2), depth: t });
      else {
        const b0 = fit.mapB(s0), b1 = fit.mapB(s1);
        nb.push({ s0: Math.min(b0, b1), s1: Math.max(b0, b1), depth: t });
      }
    }
    g.edges.push({ panelId: A.id, edge: c.a.edge, notches: na }, { panelId: B.id, edge: c.b.edge, notches: nb });
    return g;
  }

  if (c.kind === 'halflap') {
    const fit = crossFit(A, B, t);
    if (!fit) return null;
    const w = t + cl;
    // A (the earlier panel) is slotted from its top edge, B from its bottom edge.
    g.edges.push({ panelId: A.id, edge: 2, notches: [{ s0: A.w - fit.xA - w / 2, s1: A.w - fit.xA + w / 2, depth: fit.depthA }] });
    g.edges.push({ panelId: B.id, edge: 0, notches: [{ s0: fit.xB - w / 2, s1: fit.xB + w / 2, depth: fit.depthB }] });
    return g;
  }

  if (c.kind === 'butt') {
    // a closing seam left as plain edges: valid while the panels still meet
    return faceFit(A, c.a.edge, B, t) || (c.b.edge >= 0 && cornerFit(A, c.a.edge, B, c.b.edge)) ? g : null;
  }

  if (c.kind === 'glue' && c.grown) return grownGlue(d, c, A, B);

  // edge-on-face kinds: tabslot, slide, glue
  const { owner, edge, receiver } = ownerOf(c);
  const O = d.panels[owner], R = d.panels[receiver];
  const fit = faceFit(O, edge, R, t);
  if (!fit) return null;
  const len = fit.s1 - fit.s0;

  if (c.kind === 'slide') {
    g.edges.push({ panelId: O.id, edge, notches: [{ s0: fit.s0, s1: fit.s1, depth: fit.d1 + cl }] });
    return g;
  }

  if (c.kind === 'tabslot') {
    const n = Math.max(1, Math.min(c.tabs ?? autoTabs(len), Math.floor((len / 6 - 1) / 2) || 1));
    const seg = len / (2 * n + 1);
    const notches: Notch[] = [];
    for (let k = 0; k < 2 * n + 1; k++) {
      const s0 = fit.s0 + k * seg, s1 = fit.s0 + (k + 1) * seg;
      notches.push({ s0, s1, depth: k % 2 ? fit.d0 : fit.d1 });
      if (k % 2) {
        const corners: P2[] = [];
        for (const s of [s0, s1])
          for (const dd of [fit.d0, fit.d1])
            for (const z of [0, t]) {
              const lp = edgePoint(O, edge, s, dd);
              corners.push(toLocal(R.frame, toWorld(O.frame, lp.x, lp.y, z)));
            }
        g.holes.push({ panelId: R.id, poly: offsetConvex(hull(corners), cl / 2) });
      }
    }
    g.edges.push({ panelId: O.id, edge, notches });
    return g;
  }

  if (c.kind === 'glue') {
    const fh = c.flap ?? autoFlap(d.material);
    const taper = Math.min(fh, len / 3);
    if (fit.d1 > 1e-9) g.edges.push({ panelId: O.id, edge, notches: [{ s0: fit.s0, s1: fit.s1, depth: fit.d1 }] });
    const p = (s: number, u: number) => edgePoint(O, edge, s, fit.d1 - u);
    g.adds.push({ panelId: O.id, poly: [p(fit.s0, 0), p(fit.s0 + taper, fh), p(fit.s1 - taper, fh), p(fit.s1, 0)] });
    g.scores.push({ panelId: O.id, a: p(fit.s0, 0), b: p(fit.s1, 0) });
    // 3D: the flap folds along the receiver's face, towards the receiver's centre
    const mO = matDir(O.frame);
    const centre = toWorld(R.frame, R.w / 2, R.h / 2, t / 2);
    const [e0] = edgeWorld(O, edge);
    const sign = v3dot(v3sub(centre, e0), mO) >= 0 ? 1 : -1;
    const start = sign > 0 ? t : 0;
    const poly3 = [
      [fit.s0, 0],
      [fit.s0 + taper, fh],
      [fit.s1 - taper, fh],
      [fit.s1, 0],
    ].map(([s, u]) => {
      const lp = edgePoint(O, edge, s, fit.d1);
      const w = v3add(toWorld(O.frame, lp.x, lp.y, start), v3mul(mO, sign * u));
      return toLocal(R.frame, w);
    });
    const zFace = fit.zE + fit.k * fit.d1;
    const [z0, z1] = zFace < t / 2 ? [-t, 0] : [t, 2 * t];
    g.flaps3d.push({ panelId: R.id, poly: poly3, z0, z1 });
    return g;
  }
  return null;
}

/**
 * Glue flap on a grown child's bottom edge, folded onto the parent's face
 * towards the parent's interior. Works at any angle.
 */
function grownGlue(d: Design, c: Connection, P: Panel, C: Panel): ConnGeom {
  const t = d.material.thickness;
  const g = empty();
  const L = C.w;
  const fh = c.flap ?? autoFlap(d.material);
  const taper = Math.min(fh, L / 3);
  const p = (s: number, u: number) => edgePoint(C, 0, s, -u);
  g.adds.push({ panelId: C.id, poly: [p(0, 0), p(taper, fh), p(L - taper, fh), p(L, 0)] });
  g.scores.push({ panelId: C.id, a: p(0, 0), b: p(L, 0) });
  // on the parent: along the parent edge, from the child's position inwards
  const q = (s: number, u: number) => edgePoint(P, c.a.edge, s, c.offset + u);
  const [z0, z1] = c.dir === 'up' ? [t, 2 * t] : [-t, 0];
  g.flaps3d.push({ panelId: P.id, poly: [q(0, 0), q(taper, fh), q(L - taper, fh), q(L, 0)], z0, z1 });
  return g;
}

export type SeamType = 'corner' | 'face' | 'cross';
export type OpenSeam = { type: SeamType; a: { panelId: string; edge: number }; b: { panelId: string; edge: number }; overlapping: boolean };

function connectedPair(d: Design, x: string, y: string) {
  return Object.values(d.connections).some((c) => (c.a.panelId === x && c.b.panelId === y) || (c.a.panelId === y && c.b.panelId === x));
}

/** How two panels meet, if they do (ignoring any connection between them). */
export function seamBetween(d: Design, A: Panel, B: Panel): OpenSeam | null {
  const t = d.material.thickness;
  for (let ea = 0; ea < 4; ea++)
    for (let eb = 0; eb < 4; eb++) if (cornerFit(A, ea, B, eb)) return { type: 'corner', a: { panelId: A.id, edge: ea }, b: { panelId: B.id, edge: eb }, overlapping: true };
  for (let e = 0; e < 4; e++) {
    const f = faceFit(B, e, A, t);
    if (f) return { type: 'face', a: { panelId: B.id, edge: e }, b: { panelId: A.id, edge: -1 }, overlapping: f.d1 > 1e-6 };
  }
  for (let e = 0; e < 4; e++) {
    const f = faceFit(A, e, B, t);
    if (f) return { type: 'face', a: { panelId: A.id, edge: e }, b: { panelId: B.id, edge: -1 }, overlapping: f.d1 > 1e-6 };
  }
  if (crossFit(A, B, t)) return { type: 'cross', a: { panelId: A.id, edge: -1 }, b: { panelId: B.id, edge: -1 }, overlapping: true };
  return null;
}

/** Places where panels meet without a connection ("closing seams"). */
export function findOpenSeams(d: Design, only?: string): OpenSeam[] {
  const out: OpenSeam[] = [];
  const ids = d.order.filter((id) => d.panels[id]);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const A = d.panels[ids[i]], B = d.panels[ids[j]];
      if (only && A.id !== only && B.id !== only) continue;
      if (connectedPair(d, A.id, B.id)) continue;
      const found = seamBetween(d, A, B);
      if (found) out.push(found);
    }
  return out;
}

/** Does connection `c` still describe how its panels meet (same type and edges)? */
export function seamStillFits(d: Design, c: Connection): boolean {
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return false;
  const s = seamBetween(d, A, B);
  if (!s) return false;
  const type = c.kind === 'halflap' ? 'cross' : c.b.edge >= 0 ? 'corner' : 'face';
  if (s.type !== type) return false;
  const key = (r: { panelId: string; edge: number }) => `${r.panelId}:${r.edge}`;
  const have = [key(c.a), key(c.b)].sort().join(), now = [key(s.a), key(s.b)].sort().join();
  return have === now;
}

/** Connection kinds offered for a closing seam. */
export function seamKinds(m: MaterialProfile, type: SeamType): ConnectionKind[] {
  if (type === 'cross') return ['halflap'];
  const ply = m.kind === 'plywood';
  if (type === 'corner') return ply ? ['finger', 'butt'] : ['glue', 'slide', 'butt'];
  return ply ? ['tabslot', 'slide', 'butt'] : ['slide', 'glue', 'butt'];
}
