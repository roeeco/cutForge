// Seams between free boards (milestone 123, SHAPES_TO_DIELINES_PLAN.md §4.3): two
// boards made from neighbouring faces of a shape share an edge in 3D, at any angle.
// A seam fold keeps them one piece (the child laid flat off its parent in the net,
// as a tray corner made a fold is, at any dihedral from 5° to 355°, nearly flat ones
// included: a faceted sphere's facets meet at 175–180°); a cut seam is
// closed with a glue flap or a slit lock on one board, folded onto the other's
// inside face.
import type { ConnGeom, Connection, Design, Flap3d, P2, Panel, V3 } from './types';
import { edgeInwardLocal, edgeLocal, edgeWorld, matDir, toLocal, toWorld } from './frame';
import { findEdge, type EdgeArg } from './edges';
import { v3add, v3cross, v3dot, v3len, v3mul, v3norm, v3sub } from '../geom/v3';
import { matOf, tOf } from './materials';
import { seamFoldable, TAPER_MAX } from './foldRules';

export { SEAM_MIN, SEAM_MAX } from './foldRules';
const TOL = 0.05; // mm: edges this close are the same line

export type SeamFit = {
  /** The shared stretch along A's edge, mm from its start. */
  s0: number;
  s1: number;
  /** A point s along A's edge, as a distance along B's edge. */
  mapB: (s: number) => number;
  /** The angle inside the solid between the two boards, degrees (90 for a cube, 270 for an inside corner). */
  dihedral: number;
  sin: number;
  cos: number;
};

function inwardW(p: Panel, e: EdgeArg): V3 {
  const i = edgeInwardLocal(p, e);
  return v3norm(v3add(v3mul(p.frame.u, i.x), v3mul(p.frame.v, i.y)));
}

/**
 * Two boards' edges that lie on one line in 3D (either direction), and the angle
 * between the boards inside the solid: the angle between their inward directions,
 * past 180° when B turns away from A's material side (an inside corner).
 */
export function seamFit(A: Panel, eA: EdgeArg, B: Panel, eB: EdgeArg, minLen = 1e-6): SeamFit | null {
  if (!findEdge(A, eA) || !findEdge(B, eB)) return null;
  const [a0, a1] = edgeWorld(A, eA), [b0, b1] = edgeWorld(B, eB);
  const La = v3len(v3sub(a1, a0));
  if (La < 1e-9) return null;
  const dirA = v3mul(v3sub(a1, a0), 1 / La);
  const off = (p: V3) => {
    const r = v3sub(p, a0);
    return v3len(v3sub(r, v3mul(dirA, v3dot(r, dirA))));
  };
  if (off(b0) > TOL || off(b1) > TOL) return null;
  const sb0 = v3dot(v3sub(b0, a0), dirA), sb1 = v3dot(v3sub(b1, a0), dirA);
  const s0 = Math.max(0, Math.min(sb0, sb1)), s1 = Math.min(La, Math.max(sb0, sb1));
  if (s1 - s0 < minLen) return null;
  const iA = inwardW(A, eA), iB = inwardW(B, eB);
  const c = Math.max(-1, Math.min(1, v3dot(iA, iB)));
  let ang = (Math.acos(c) * 180) / Math.PI;
  // B turns away from A's material: an inside (reflex) corner
  if (v3dot(iB, matDir(A.frame)) < -1e-9) ang = 360 - ang;
  // nearly flat is laid out too (it used to be refused within 5° of flat, while the unfolder
  // folded it: a faceted sphere then came out as hundreds of loose faces reported as one piece)
  if (!seamFoldable(ang)) return null;
  const dirB = v3norm(v3sub(b1, b0));
  const r = (ang * Math.PI) / 180;
  return { s0, s1, mapB: (s) => v3dot(v3sub(v3add(a0, v3mul(dirA, s)), b0), dirB), dihedral: ang, sin: Math.sin(r), cos: Math.cos(r) };
}

/** The child of a seam fold (the board laid flat off the other), and its parent. */
export function seamEnds(c: Connection): { parent: { panelId: string; edge: string }; child: { panelId: string; edge: string } } {
  const childA = c.hingeOf === c.a.panelId;
  return childA ? { parent: c.b, child: c.a } : { parent: c.a, child: c.b };
}

/**
 * A glue flap or slit lock on a cut seam (`a` carries the flap): a tapered strip on
 * the owner's edge, scored along it, folded onto the receiver's inside face. The
 * taper follows the corner angles at each end of the edge so flaps meeting at a
 * vertex never cross.
 */
export function seamGlue(d: Design, c: Connection, f: SeamFit): ConnGeom {
  const O = d.panels[c.a.panelId], R = d.panels[c.b.panelId];
  const g: ConnGeom = { edges: [], holes: [], adds: [], scores: [], flaps3d: [] };
  const mO = matOf(d, O.id);
  const t = mO.thickness, tR = tOf(d, R.id);
  const L = f.s1 - f.s0;
  const fh = Math.max(1, c.flap ?? d.joints?.[mO.kind]?.flap ?? seamFlapDepth(mO.thickness, L));
  // the tapers the unfolder fitted, else 45°: at most a third of the seam each, or with both stored (a flap
  // sized for the board it is glued to, which may be a long wedge on a sliver) up to TAPER_MAX of it
  const cap = c.flapTaperB !== undefined ? TAPER_MAX * L : L / 3;
  const ta = Math.max(0, Math.min(c.flapTaper ?? fh, cap)), tb = Math.max(0, Math.min(c.flapTaperB ?? c.flapTaper ?? fh, cap));
  const [a, b] = edgeLocal(O, c.a.edge);
  const la = Math.hypot(b.x - a.x, b.y - a.y);
  const dir = { x: (b.x - a.x) / la, y: (b.y - a.y) / la };
  const inw = edgeInwardLocal(O, c.a.edge);
  // owner-local: s along the edge, u outward from it
  const p = (s: number, u: number): P2 => ({ x: a.x + dir.x * s - inw.x * u, y: a.y + dir.y * s - inw.y * u });
  const flat = [p(f.s0, 0), p(f.s0 + ta, fh), p(f.s1 - tb, fh), p(f.s1, 0)];
  g.adds.push({ panelId: O.id, poly: flat });
  // a flap turns towards the solid's inside: folded away from the owner's outer face, so it is scored on the inside
  g.scores.push({ panelId: O.id, a: p(f.s0, 0), b: p(f.s1, 0), toward: 1 });
  // on the receiver: along its edge (from where A's stretch maps), inwards, on its inside face
  const [ra, rb] = edgeLocal(R, c.b.edge);
  const lr = Math.hypot(rb.x - ra.x, rb.y - ra.y);
  const rdir = { x: (rb.x - ra.x) / lr, y: (rb.y - ra.y) / lr };
  const rin = edgeInwardLocal(R, c.b.edge);
  const m0 = f.mapB(f.s0), m1 = f.mapB(f.s1);
  const q = (m: number, u: number): P2 => ({ x: ra.x + rdir.x * m + rin.x * u, y: ra.y + rdir.y * m + rin.y * u });
  const sgn = m1 >= m0 ? 1 : -1;
  const folded = [q(m0, 0), q(m0 + sgn * ta, fh), q(m1 - sgn * tb, fh), q(m1, 0)];
  g.flaps3d.push(foldedFlap(t, O, flat, { panelId: R.id, poly: folded, z0: tR, z1: tR + t }, R));
  return g;
}

/**
 * A glue flap from a hole's wall onto the board the hole goes through (milestone 186): the
 * wall's edge `a` runs along the hole's rim, which is no edge of the receiver (its hole is a
 * cut-out), so the seam's `b` is the receiver's face. The flap folds onto the receiver's
 * inside face, away from the hole (towards the wall's material side, the solid's inside).
 */
export function rimGlue(d: Design, c: Connection): ConnGeom | null {
  const O = d.panels[c.a.panelId], R = d.panels[c.b.panelId];
  if (!O || !R || !findEdge(O, c.a.edge)) return null;
  const [w0, w1] = edgeWorld(O, c.a.edge);
  const L = v3len(v3sub(w1, w0));
  if (L < 1e-6) return null;
  // the rim lies in the receiver's plane (its face is the shape's face)
  const nR = v3cross(R.frame.u, R.frame.v);
  if (Math.abs(v3dot(v3sub(w0, R.frame.o), nR)) > 0.05 || Math.abs(v3dot(v3sub(w1, R.frame.o), nR)) > 0.05) return null;
  const g: ConnGeom = { edges: [], holes: [], adds: [], scores: [], flaps3d: [] };
  const t = matOf(d, O.id).thickness, tR = tOf(d, R.id);
  const fh = Math.max(1, c.flap ?? seamFlapDepth(t, L));
  const cap = c.flapTaperB !== undefined ? TAPER_MAX * L : L / 3;
  const ta = Math.max(0, Math.min(c.flapTaper ?? fh, cap)), tb = Math.max(0, Math.min(c.flapTaperB ?? c.flapTaper ?? fh, cap));
  const [a, b] = edgeLocal(O, c.a.edge);
  const la = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dir = { x: (b.x - a.x) / la, y: (b.y - a.y) / la };
  const inw = edgeInwardLocal(O, c.a.edge);
  const p = (s: number, u: number): P2 => ({ x: a.x + dir.x * s - inw.x * u, y: a.y + dir.y * s - inw.y * u });
  const flat = [p(0, 0), p(ta, fh), p(L - tb, fh), p(L, 0)];
  g.adds.push({ panelId: O.id, poly: flat });
  g.scores.push({ panelId: O.id, a: p(0, 0), b: p(L, 0), toward: 1 });
  // on the receiver: along the rim from the wall edge's start, turned towards the wall's material
  const ra = toLocal(R.frame, w0), rb = toLocal(R.frame, w1);
  const rdir = { x: (rb.x - ra.x) / L, y: (rb.y - ra.y) / L };
  let rin = { x: -rdir.y, y: rdir.x };
  const inW = v3add(v3mul(R.frame.u, rin.x), v3mul(R.frame.v, rin.y));
  if (v3dot(inW, matDir(O.frame)) < 0) rin = { x: -rin.x, y: -rin.y };
  const q = (m: number, u: number): P2 => ({ x: ra.x + rdir.x * m + rin.x * u, y: ra.y + rdir.y * m + rin.y * u });
  const folded = [q(0, 0), q(ta, fh), q(L - tb, fh), q(L, 0)];
  g.flaps3d.push(foldedFlap(t, O, flat, { panelId: R.id, poly: folded, z0: tR, z1: tR + t }, R));
  return g;
}

/** A glue flap's depth on a seam: 8–15 mm by the material (R6 refines it), and never more than a third of the seam. */
export function seamFlapDepth(t: number, len: number): number {
  return Math.max(3, Math.min(Math.max(8, Math.min(15, 10 * t + 5)), len / 3));
}

/** Local coords of a world point (x, y on the plane, z into the material). */
function local3(p: Panel, w: V3): V3 {
  const dd = v3sub(w, p.frame.o);
  return [v3dot(dd, p.frame.u), v3dot(dd, p.frame.v), v3dot(dd, matDir(p.frame))];
}

/** How a flap folds off its owner onto the receiver (for the fold view), as `withFold` in seams.ts. */
function foldedFlap(t: number, O: Panel, flat: P2[], f: Flap3d, R: Panel): Flap3d {
  const n = flat.length, m = f.poly.length;
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
  const e1 = nf, e2 = v3cross(a, nf);
  const y1 = v3dot(v3sub(Y, X), e1), y2 = v3dot(v3sub(Y, X), e2);
  const c = Math.cos(th), s = Math.sin(th), det = 2 - 2 * c;
  const p1 = ((1 - c) * y1 - s * y2) / det, p2 = (s * y1 + (1 - c) * y2) / det;
  const P = v3add(X, v3add(v3mul(e1, p1), v3mul(e2, p2)));
  const len = v3len(v3sub(sb, sa)) || 1;
  return { ...f, owner: O.id, hinge: [local3(O, P), local3(O, v3add(P, v3mul(a, len)))], angle: (th * 180) / Math.PI };
}
