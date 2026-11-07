import type { Frame, Panel, V3 } from './types';
import type { Vec2 } from '../geom/types';
import { v3add, v3clean, v3cross, v3dot, v3mul, v3norm, v3sub } from '../geom/v3';

export const frameNormal = (f: Frame): V3 => v3cross(f.u, f.v);
/** Unit direction from the panel plane into the material. */
export const matDir = (f: Frame): V3 => v3mul(frameNormal(f), f.side);

/** Local (x, y) on the panel plane, plus depth z into the material, to world. */
export function toWorld(f: Frame, x: number, y: number, z = 0): V3 {
  return v3add(v3add(v3add(f.o, v3mul(f.u, x)), v3mul(f.v, y)), v3mul(matDir(f), z));
}
/** Project a world point onto the panel's local 2D coordinates. */
export function toLocal(f: Frame, p: V3): Vec2 {
  const d = v3sub(p, f.o);
  return { x: v3dot(d, f.u), y: v3dot(d, f.v) };
}

/** Rectangle corners in local coordinates, CCW: edge i runs corner i -> corner i+1. */
export function panelCorners(p: { w: number; h: number }): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: p.w, y: 0 },
    { x: p.w, y: p.h },
    { x: 0, y: p.h },
  ];
}
export function edgeLength(p: { w: number; h: number }, edge: number) {
  return edge % 2 === 0 ? p.w : p.h;
}
export function edgeLocal(p: { w: number; h: number }, edge: number): [Vec2, Vec2] {
  const c = panelCorners(p);
  return [c[edge], c[(edge + 1) % 4]];
}
/** In-plane unit vector pointing from the edge into the panel (local). */
export function edgeInwardLocal(edge: number): Vec2 {
  return [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }][edge];
}
export function edgeWorld(p: Panel, edge: number): [V3, V3] {
  const [a, b] = edgeLocal(p, edge);
  return [toWorld(p.frame, a.x, a.y), toWorld(p.frame, b.x, b.y)];
}

export type GrowDir = 'up' | 'down';
/**
 * 'overlap': the new panel's first t mm overlap the parent's edge strip (finger
 * joints cut that shared corner). 'onTop': the new panel stands on the
 * parent's face next to the edge, so nothing overlaps.
 */
export type Seating = 'overlap' | 'onTop';

/**
 * Frame of a new panel grown from `edge` of `parent`.
 *
 * Angle definition (see DECISIONS.md): the angle between the new panel and
 * the parent panel, measured inside the fold, so 90° stands the new panel
 * upright and smaller angles lean it over the parent. `dir` chooses the
 * parent face the new panel rises from ('up' = the face the material lies
 * towards). The new panel's material always lies on the inside of the fold,
 * so the outer faces stay flush (outer dimensions). `offset` moves the new
 * panel in from the edge (dividers, tab-and-slot walls).
 */
export function growFrame(parent: Panel, edge: number, angleDeg: number, dir: GrowDir, t: number, seating: Seating = 'overlap', offset = 0): Frame {
  const [A0, B] = edgeWorld(parent, edge);
  const U = v3norm(v3sub(B, A0));
  const inL = edgeInwardLocal(edge);
  const dIn = v3norm(v3add(v3mul(parent.frame.u, inL.x), v3mul(parent.frame.v, inL.y)));
  const A = v3add(A0, v3mul(dIn, offset));
  const m = matDir(parent.frame);
  const up = dir === 'up' ? m : v3mul(m, -1);
  const th = (angleDeg * Math.PI) / 180;
  const V = v3norm(v3add(v3mul(dIn, Math.cos(th)), v3mul(up, Math.sin(th))));
  const onFar = (dir === 'up') === (seating === 'onTop');
  let o = onFar ? v3add(A, v3mul(m, t)) : A;
  // A panel leaning over its parent: lift it so its lower slab corner rests on the face
  // instead of dipping into the parent (a square-cut edge touches along one line).
  if (seating === 'onTop' && Math.cos(th) > 1e-9) o = v3add(o, v3mul(up, t * Math.cos(th)));
  // inside-of-fold direction, perpendicular to V
  const inside = v3sub(v3mul(dIn, Math.sin(th)), v3mul(up, Math.cos(th)));
  const N = v3cross(U, V);
  const side: 1 | -1 = v3dot(N, inside) >= 0 ? 1 : -1;
  return { o: v3clean(o), u: v3clean(U), v: v3clean(V), side };
}

export const GROUND_FRAME = (x: number, z: number): Frame => ({
  // Local x along world +X, local y along world -Z, so looking down from +Y
  // the panel reads the right way round. Material rises up (+Y).
  o: [x, 0, z],
  u: [1, 0, 0],
  v: [0, 0, -1],
  side: 1,
});
