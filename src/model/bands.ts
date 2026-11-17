// Bands (milestone 63, PACKAGING_PLAN.md §4): a fold with a radius. Instead of
// a crease, the material curves round with inner radius r. The two panels'
// frames stay exactly where a sharp fold puts them, so the design's outer
// envelope and everything built on it do not move: each panel is cut back by
// the arc's tangent length from where their outer faces meet, and the band
// spans the gap. In the flat net the band is a strip of its developed length,
// θ·(r + k·t), carrying its bend pattern.
//
// Everything is worked out in the fold's cross-section: the plane through the
// parent's edge across it, with axes `dIn` (from the edge into the parent) and
// `up` (the face the child rises from), the edge's start at the origin.
import type { Connection, Design, MaterialProfile, Panel, V3 } from './types';
import { edgeInwardLocal, edgeLength, edgeWorld, matDir } from './frame';
import { findEdge, panelEdges } from './edges';
import { bendOf, matOf, tOf } from './materials';
import { v3add, v3dot, v3mul, v3norm, v3sub, v3cross } from '../geom/v3';
import { bandPattern, type BandPattern } from './bendPatterns';
import polygonClipping from 'polygon-clipping';
import { wingBand } from './wings';

type C2 = { x: number; y: number };

export type Band = {
  id: string;
  parent: string;
  child: string;
  edge: string;
  /** Inner radius, thickness, neutral-line factor (mm). */
  r: number;
  t: number;
  k: number;
  /** Outer radius r + t. */
  Ro: number;
  /** The turn (radians): 180° less the fold's angle. */
  phi: number;
  /** Developed width at the neutral line: the strip in the flat net (mm). */
  lb: number;
  /** How far the parent is cut back from its edge, and the child from its bottom edge (mm). */
  trimP: number;
  trimC: number;
  /** Where along the parent edge it runs (mm from the edge's start). */
  span: [number, number];
  /** The cross-section: the edge's start (world), along the edge, into the parent, towards the child's side. */
  A: V3;
  U: V3;
  dIn: V3;
  up: V3;
  /** Tangent points of the outer face on the parent (T1) and the child (T2), and the arc's centre, in the cross-section. */
  T1: C2;
  T2: C2;
  C: C2;
  /** Its pattern (scores or slits across it, in band coordinates: x across 0..lb, y along 0..length). */
  pattern: BandPattern;
  /** Is there room for it: the cuts leave both panels some material. */
  fits: boolean;
  /** Round a tray's rounded corner (milestone 64), carried by the wall before it. */
  wing?: boolean;
  /** A corner's band: where it starts along the strip from the wall's end (milestone 65: a corner may have several). */
  pos?: number;
};

/** A fold's inner radius: its own, else the material's pattern radius on plywood (a living hinge), else a crease (0). */
export function foldRadius(d: Design, c: Pick<Connection, 'radius' | 'a'>): number {
  if (c.radius != null) return Math.max(0, c.radius);
  const m = matOf(d, c.a.panelId);
  return m.kind === 'plywood' ? bendOf(m).patternR : 0;
}

/** Does this connection have a band: a grown fold with a radius that turns? */
export function hasBand(d: Design, c: Connection): boolean {
  return c.grown && c.kind === 'fold' && foldRadius(d, c) > 1e-6 && c.angle < 180 - 1e-6 && c.angle > 1e-6;
}

function spanOn(parent: Panel, c: Connection): [number, number] {
  const L = edgeLength(parent, c.a.edge);
  if (!c.span || c.trayId) return [0, L];
  const s0 = Math.max(0, Math.min(L, Math.min(...c.span))), s1 = Math.max(0, Math.min(L, Math.max(...c.span)));
  return s1 - s0 < 1e-6 ? [0, L] : [s0, s1];
}

/** How far a panel reaches in from an edge (mm): the furthest outline point. */
function depthFrom(p: Panel, edge: string): number {
  const e = findEdge(p, edge);
  if (!e) return 0;
  const i = edgeInwardLocal(p, edge);
  let far = 0;
  for (const q of panelEdges(p)) far = Math.max(far, (q.a.x - e.a.x) * i.x + (q.a.y - e.a.y) * i.y);
  return far;
}

/** The band of a fold with a radius, in its design pose; null when it has none (or its edges are gone). */
export function bandOf(d: Design, c: Connection): Band | null {
  if (c.wing) return wingBand(d, c);
  if (!hasBand(d, c)) return null;
  const P = d.panels[c.a.panelId], Ch = d.panels[c.b.panelId];
  if (!P || !Ch || !findEdge(P, c.a.edge)) return null;
  const m: MaterialProfile = matOf(d, P.id);
  const t = m.thickness, k = bendOf(m).k;
  const r = foldRadius(d, c), Ro = r + t;
  const a = (c.angle * Math.PI) / 180, phi = Math.PI - a;
  const [A, B] = edgeWorld(P, c.a.edge);
  const U = v3norm(v3sub(B, A));
  const inL = edgeInwardLocal(P, c.a.edge);
  const dIn = v3norm(v3add(v3mul(P.frame.u, inL.x), v3mul(P.frame.v, inL.y)));
  const mP = matDir(P.frame);
  const up = c.dir === 'up' ? mP : v3mul(mP, -1);
  const X = (w: V3): C2 => ({ x: v3dot(v3sub(w, A), dIn), y: v3dot(v3sub(w, A), up) });
  // the parent's outer face (away from the fold's inside) and the child's (its frame's plane: its material lies inside the fold)
  const yP = c.dir === 'up' ? 0 : -t;
  const oc = X(Ch.frame.o);
  const V2: C2 = { x: Math.cos(a), y: Math.sin(a) };
  const lam = (yP - oc.y) / V2.y;
  const O: C2 = { x: oc.x + lam * V2.x, y: yP };
  const Lt = Ro / Math.tan(a / 2);
  const T1: C2 = { x: O.x + Lt, y: yP };
  const T2: C2 = { x: O.x + V2.x * Lt, y: O.y + V2.y * Lt };
  const bis = { x: 1 + V2.x, y: V2.y }, bl = Math.hypot(bis.x, bis.y) || 1;
  const Cc: C2 = { x: O.x + (bis.x / bl) * (Ro / Math.sin(a / 2)), y: O.y + (bis.y / bl) * (Ro / Math.sin(a / 2)) };
  const trimP = T1.x, trimC = lam + Lt;
  const lb = phi * (r + k * t);
  const span = spanOn(P, c);
  const len = span[1] - span[0];
  const pattern = bandPattern({ m, r, len, width: lb, turn: phi }, c.bend?.pattern, c.bend?.density);
  const fits = trimP > 1e-6 && trimP < depthFrom(P, c.a.edge) - 1 && trimC >= -1e-6 && trimC < Ch.h - 1;
  return { id: c.id, parent: P.id, child: Ch.id, edge: c.a.edge, r, t, k, Ro, phi, lb, trimP, trimC, span, A, U, dIn, up, T1, T2, C: Cc, pattern, fits };
}

/** Every band in a design. */
export function allBands(d: Design): Band[] {
  const out: Band[] = [];
  for (const c of Object.values(d.connections)) {
    const b = bandOf(d, c);
    if (b) out.push(b);
  }
  return out;
}

/** A cross-section point at distance s along the band's edge, in world coordinates (design pose). */
export const bandWorld = (b: Band, q: C2, s: number): V3 => v3add(v3add(v3add(b.A, v3mul(b.U, s)), v3mul(b.dIn, q.x)), v3mul(b.up, q.y));

/**
 * The band as the fold view shows it at fold fraction `k` (1: as designed,
 * 0: flat): it turns k·φ, and its outer face's length runs from the design's
 * arc (φ·Ro) to the flat net's strip (`lb`), so a fully unfolded child lands
 * where the net puts it. Outer and inner face points across it (`n + 1`
 * each), where it ends and which way it points there.
 */
export function bandPose(b: Band, k: number, n = 16): { outer: C2[]; inner: C2[]; end: C2; dir: C2 } {
  const psi = k * b.phi;
  const len = b.lb + k * (b.phi * b.Ro - b.lb);
  const outer: C2[] = [], inner: C2[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, q = f * psi;
    let p: C2, nIn: C2;
    if (psi < 1e-6) {
      p = { x: b.T1.x - len * f, y: b.T1.y };
      nIn = { x: 0, y: 1 };
    } else {
      const rho = len / psi;
      p = { x: b.T1.x - rho * Math.sin(q), y: b.T1.y + rho * (1 - Math.cos(q)) };
      nIn = { x: Math.sin(q), y: Math.cos(q) };
    }
    outer.push(p);
    inner.push({ x: p.x + nIn.x * b.t, y: p.y + nIn.y * b.t });
  }
  return { outer, inner, end: outer[n], dir: { x: -Math.cos(psi), y: Math.sin(psi) } };
}

/**
 * The fold view's move of a band's child (and everything on it) from its
 * design pose to fold fraction `k`: a turn in the cross-section by φ·(1 − k)
 * that takes its tangent point and direction to the band's end. As a
 * column-major 4×4 matrix in world coordinates (design pose).
 */
export function bandChildMove(b: Band, k: number): number[] {
  const pose = bandPose(b, k, 1);
  const delta = b.phi * (1 - k);
  // rotation about n = dIn × up by delta (counter-clockwise in the cross-section)
  const nAx = v3norm(v3cross(b.dIn, b.up));
  const c = Math.cos(delta), s = Math.sin(delta), C1 = 1 - c;
  const [x, y, z] = nAx;
  const R = [
    [c + x * x * C1, x * y * C1 - z * s, x * z * C1 + y * s],
    [y * x * C1 + z * s, c + y * y * C1, y * z * C1 - x * s],
    [z * x * C1 - y * s, z * y * C1 + x * s, c + z * z * C1],
  ];
  const from = bandWorld(b, b.T2, 0), to = bandWorld(b, pose.end, 0);
  const Rf: V3 = [R[0][0] * from[0] + R[0][1] * from[1] + R[0][2] * from[2], R[1][0] * from[0] + R[1][1] * from[1] + R[1][2] * from[2], R[2][0] * from[0] + R[2][1] * from[1] + R[2][2] * from[2]];
  const tr = v3sub(to, Rf);
  return [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, tr[0], tr[1], tr[2], 1];
}

/** The child's thickness check: a band joins two panels of one material (a fold requires it). */
export const bandThicknessOk = (d: Design, b: Band) => Math.abs(tOf(d, b.child) - b.t) < 1e-9;

/**
 * The part of the fold's corner the band takes (milestone 63), in its
 * cross-section: from the sharp corner the panels' outer faces met at, out to
 * the band's inner face. A board standing across the band (a side wall at a
 * living-hinge lid) is cut back to it, so the band curves past its corner.
 */
export function bandCorner(b: Band, n = 16): C2[] {
  const { outer, inner } = bandPose(b, 1, n);
  // the sharp corner: where the outer faces' tangent lines meet
  const a = Math.PI - b.phi;
  const Lt = b.Ro / Math.tan(a / 2);
  const O: C2 = { x: b.T1.x - Lt, y: b.T1.y };
  return [O, outer[0], ...inner, outer[outer.length - 1]];
}

/**
 * The corner region carried `m` past the box's outer faces, beyond the sharp
 * corner: a crossed board's joint pokes out past those faces (a side wall's
 * edge reaching over its neighbour's end), and left there it was a sliver as
 * wide as the material standing beside the arc, or on plywood a stick of its
 * own (an arched lid's end walls).
 */
function cornerPastFaces(corner: C2[], m: number): C2[] {
  const O = corner[0], o0 = corner[1], oN = corner[corner.length - 1];
  const unit = (a: C2, b: C2) => {
    const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  // along each face towards the corner, and on past it
  const e1 = unit(O, o0), e2 = unit(O, oN);
  return [{ x: o0.x + e2.x * m, y: o0.y + e2.y * m }, ...corner.slice(1), { x: oN.x + e1.x * m, y: oN.y + e1.y * m }, { x: O.x + (e1.x + e2.x) * m, y: O.y + (e1.y + e2.y) * m }];
}

/**
 * Boards a band runs across (milestone 63): standing square to its edge, their
 * slab within its span, and reaching into its corner. Each with the corner
 * region in its own coordinates (carried past the outer faces), to cut away.
 */
export function bandCrossings(d: Design, b: Band): { panelId: string; poly: { x: number; y: number }[] }[] {
  const out: { panelId: string; poly: { x: number; y: number }[] }[] = [];
  const corner = bandCorner(b);
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || id === b.parent || id === b.child) continue;
    const nrm = v3cross(p.frame.u, p.frame.v);
    if (Math.abs(Math.abs(v3dot(nrm, b.U)) - 1) > 1e-6) continue;
    // where its slab lies along the band's edge
    const t = tOf(d, id);
    const s0 = v3dot(v3sub(p.frame.o, b.A), b.U), s1 = s0 + v3dot(matDir(p.frame), b.U) * t;
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    if (hi <= b.span[0] + 1e-6 || lo >= b.span[1] - 1e-6) continue;
    const mid = (lo + hi) / 2;
    const local = (q: C2) => {
      const r = v3sub(bandWorld(b, q, mid), p.frame.o);
      return { x: v3dot(r, p.frame.u), y: v3dot(r, p.frame.v) };
    };
    const poly = corner.map(local);
    // only a board whose outline reaches into the corner (by more than a touch)
    const ring = panelEdges(p).map((e) => e.a);
    let area = 0;
    try {
      const x = polygonClipping.intersection([ring.map((q) => [q.x, q.y] as [number, number])], [poly.map((q) => [q.x, q.y] as [number, number])]);
      for (const pg of x) for (const [i, r] of pg.entries()) area += (i ? -1 : 1) * Math.abs(ringArea(r));
    } catch {
      area = 0;
    }
    if (area < 0.01) continue;
    out.push({ panelId: id, poly: cornerPastFaces(corner, Math.max(5, 4 * t)).map(local) });
  }
  return out;
}

function ringArea(r: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
  return s / 2;
}
