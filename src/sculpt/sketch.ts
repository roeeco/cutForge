// Sketch planes, sketch shapes and outline edits (WAFFLE_MODE.md §5.5–5.6).
// A sketch lives in its shape's local XY: on the floor, (x, y) is world (x, −z);
// on an upright plane turned by `ang` about the vertical, x runs along the
// plane and y is up, and the plane's axis (for Revolve) is the line x = 0.
import type { Design, P2, Quat, Sculpt, SculptPt, Shape3, V3 } from '../model/types';
import { isSimplePolygon } from '../model/ops';
import { crossesAxis, footprint, shapeMatrix } from './build';
import { flattenSketch } from './round';
import { parentMatrix, updateShape } from './ops';
import { m4, m4Apply, m4InvAffine, m4Mul, qAxis, Q_ID, Z_TO_Y, type M4 } from './xform';

export type SketchPlane = { kind: 'floor' } | { kind: 'upright'; o: V3; ang: number };

/** Sketch-local (x, y, z = along the normal) → world, for a plane. */
export function planeMatrix(pl: SketchPlane): M4 {
  return pl.kind === 'floor' ? m4Mul(m4([0, 0, 0], Q_ID), Z_TO_Y) : m4(pl.o, planeQuat(pl));
}
export const planeQuat = (pl: SketchPlane): Quat => (pl.kind === 'floor' ? [...Q_ID] as Quat : qAxis([0, 1, 0], pl.ang));

/** A sketch shape's local → world matrix. */
export function sketchMatrix(sc: Sculpt, id: string): M4 {
  return m4Mul(parentMatrix(sc, id), shapeMatrix(sc.shapes[id]));
}
/** A world point onto a sketch's plane (its local x, y). */
export function toSketch(M: M4, w: V3): P2 {
  const l = m4Apply(m4InvAffine(M), w);
  return { x: l[0], y: l[1] };
}
export const fromSketch = (M: M4, p: P2, z = 0): V3 => m4Apply(M, [p.x, p.y, z]);
/** The plane's normal in the world. */
export const sketchNormal = (M: M4): V3 => [M[8], M[9], M[10]];

/** An upright plane facing the nearest 30° step towards the viewer, through a point on the floor. */
export function facingPlane(at: V3, camera: V3): SketchPlane {
  const a = (Math.atan2(camera[0] - at[0], camera[2] - at[2]) * 180) / Math.PI;
  return { kind: 'upright', o: [at[0], 0, at[2]], ang: ((Math.round(a / 30) * 30) % 360 + 360) % 360 };
}

/** A closed outline can be built: three points or more and its flattened edges do not cross. */
export function sketchOk(pts: SculptPt[]): boolean {
  return pts.length >= 3 && isSimplePolygon(flattenSketch(pts));
}

/** Revolve suits an outline that touches or sits beside its plane's axis (within 10 mm) without crossing it. */
export function revolveSuits(pts: P2[]): boolean {
  if (crossesAxis(pts)) return false;
  return Math.min(...pts.map((p) => Math.abs(p.x))) <= 10;
}

/** A new extrusion or revolve from a closed outline on a plane. */
export function sketchShape(pl: SketchPlane, pts: SculptPt[], mode: 'extrude' | 'revolve', height = 20): Omit<Shape3, 'id' | 'name'> {
  const base = { at: (pl.kind === 'floor' ? [0, 0, 0] : [...pl.o]) as V3, q: planeQuat(pl), sketch: { plane: pl.kind, pts: pts.map((p) => ({ ...p })) } };
  return mode === 'extrude' ? { ...base, kind: 'extrude', height } : { ...base, kind: 'revolve', angle: 360, axis: { kind: 'plane' } };
}

/** Switch a sketch shape between Extrude and Revolve (its outline and plane stay). */
export function setSketchMode(d: Design, id: string, mode: 'extrude' | 'revolve', height = 20) {
  const s = d.sculpt?.shapes[id];
  if (!s?.sketch || s.kind === mode) return;
  if (mode === 'extrude') {
    s.kind = 'extrude';
    s.height ??= height;
  } else {
    s.kind = 'revolve';
    s.angle ??= 360;
    s.axis ??= { kind: 'plane' };
  }
}

/** The outline in the frame its axis gives crosses the axis (Revolve can't be built). */
export function revolveBlocked(s: Shape3): boolean {
  if (s.kind !== 'revolve' || !s.sketch) return false;
  let pts = flattenSketch(s.sketch.pts);
  if (s.axis?.kind === 'edge') {
    const n = s.sketch.pts.length, a = s.sketch.pts[s.axis.i % n], b = s.sketch.pts[(s.axis.i + 1) % n];
    const ux = (b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1), uy = (b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    // signed distance from the edge's line
    pts = pts.map((p) => ({ x: (p.x - a.x) * uy - (p.y - a.y) * ux, y: 0 }));
  }
  return crossesAxis(pts);
}

// ---- outline edits (Edit sketch) ----------------------------------------------

function editPts(d: Design, id: string, fn: (pts: SculptPt[]) => SculptPt[] | null): boolean {
  const s = d.sculpt?.shapes[id];
  if (!s?.sketch) return false;
  const next = fn(s.sketch.pts.map((p) => ({ ...p })));
  // an outline that crosses itself is refused, as the polygon tool does
  if (!next || !sketchOk(next)) return false;
  s.sketch.pts = next;
  // an edge axis that no longer exists falls back to the plane's axis
  if (s.axis?.kind === 'edge' && s.axis.i >= next.length) s.axis = { kind: 'plane' };
  return true;
}
export const moveSketchPoint = (d: Design, id: string, i: number, p: P2) => editPts(d, id, (pts) => (pts[i] ? ((pts[i] = { ...pts[i], x: p.x, y: p.y }), pts) : null));
/** A new point on edge i (between point i and i + 1). */
export const insertSketchPoint = (d: Design, id: string, i: number, p: P2) => editPts(d, id, (pts) => (pts.splice(i + 1, 0, { x: p.x, y: p.y }), pts));
export const deleteSketchPoint = (d: Design, id: string, i: number) => editPts(d, id, (pts) => (pts.length > 3 ? (pts.splice(i, 1), pts) : null));
/** Corner, Curve or Round (with a radius) at a point. */
export function setSketchPointKind(d: Design, id: string, i: number, kind: 'corner' | 'curve' | 'round', r = 5): boolean {
  return editPts(d, id, (pts) => {
    const p = pts[i];
    if (!p) return null;
    delete p.curve;
    delete p.r;
    if (kind === 'curve') p.curve = 'auto';
    if (kind === 'round' && r > 0) p.r = r;
    return pts;
  });
}

/**
 * The radius tool on a corner: `r` mm (0 = sharp) at a sketch point of an
 * extrusion or revolve, or at a footprint corner of a box, prism or pyramid.
 */
export function roundCorner(d: Design, id: string, i: number, r: number): boolean {
  const s = d.sculpt?.shapes[id];
  if (!s) return false;
  if (s.sketch) return setSketchPointKind(d, id, i, r > 0 ? 'round' : 'corner', r);
  if (s.kind === 'box' || s.kind === 'prism' || s.kind === 'pyramid') {
    const n = footprint(s).length;
    const corners = Array.from({ length: n }, (_, j) => s.corners?.[j] ?? 0);
    corners[i] = Math.max(0, r);
    updateShape(d, id, { corners });
    return true;
  }
  return false;
}

/** The corners the radius tool can round on a shape: the sketch's or footprint's points, in shape-local coordinates. */
export function roundable(s: Shape3): SculptPt[] {
  if (s.sketch) return s.sketch.pts;
  if (s.kind === 'box' || s.kind === 'prism' || s.kind === 'pyramid') return footprint(s);
  return [];
}
/** How tall a roundable corner's edge is (its vertical edge from z = 0 to this), 0 for a revolve's outline point. */
export function cornerHeight(s: Shape3): number {
  if (s.kind === 'extrude') return s.height ?? 20;
  if (s.kind === 'revolve') return 0;
  return s.size?.[1] ?? 0;
}
