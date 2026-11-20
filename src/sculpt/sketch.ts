// Sketch planes, sketch shapes and outline edits (WAFFLE_MODE.md §5.5–5.6).
// A sketch lives in its shape's local XY: on the floor, (x, y) is world (x, −z);
// on an upright plane turned by `ang` about the vertical, x runs along the
// plane and y is up, and the plane's axis (for Revolve) is the line x = 0.
import type { Design, P2, Quat, Sculpt, SculptPt, Shape3, SketchGraph, V3 } from '../model/types';
import { axisOutline, crossesAxis, footprint, segFrame, shapeMatrix } from './build';
import { outlineToGraph } from './round';
import { sketchState } from '../sketch/regions';
import { isLineCorner } from '../sketch/flatten';
import { removePt, setCorner, setPt, setSmooth, splitSeg } from '../sketch/ops';
import { segsAt } from '../sketch/model';
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

/** A sketch makes a body: it fills some area. */
export function sketchOk(sk: SketchGraph | SculptPt[]): boolean {
  return !sketchState(Array.isArray(sk) ? outlineToGraph(sk) : sk).empty;
}

/** Revolve suits an outline that touches or sits beside its plane's axis (within 10 mm) without crossing it. */
export function revolveSuits(pts: P2[]): boolean {
  if (crossesAxis(pts)) return false;
  return Math.min(...pts.map((p) => Math.abs(p.x))) <= 10;
}

/** A new extrusion or revolve from a closed outline on a plane. */
export function sketchShape(pl: SketchPlane, sk: SketchGraph | SculptPt[], mode: 'extrude' | 'revolve', height = 20): Omit<Shape3, 'id' | 'name'> {
  const g: SketchGraph = Array.isArray(sk) ? outlineToGraph(sk) : JSON.parse(JSON.stringify(sk));
  const base = { at: (pl.kind === 'floor' ? [0, 0, 0] : [...pl.o]) as V3, q: planeQuat(pl), sketch: { plane: pl.kind, v: 2 as const, ...g } };
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

/** The sketch in the frame its axis gives crosses the axis (Revolve can't be built). */
export function revolveBlocked(s: Shape3): boolean {
  if (s.kind !== 'revolve' || !s.sketch) return false;
  if (s.axis?.kind === 'seg' && !segFrame(s.sketch, s.axis.id)) return false;
  return crossesAxis(axisOutline(s));
}

// ---- point edits (Edit sketch on the stage, until the 2D sketcher replaces it) ----

function editSketch(d: Design, id: string, fn: (sk: SketchGraph) => unknown): boolean {
  const s = d.sculpt?.shapes[id];
  if (!s?.sketch) return false;
  const before = JSON.stringify(s.sketch);
  if (fn(s.sketch) === false) return false;
  // an edit that leaves nothing to build is undone
  if (!sketchOk(s.sketch)) {
    Object.assign(s.sketch, JSON.parse(before));
    return false;
  }
  if (s.axis?.kind === 'seg' && s.sketch.segs[s.axis.id]?.k !== 'line') s.axis = { kind: 'plane' };
  return true;
}
export const moveSketchPoint = (d: Design, id: string, pt: string, p: P2) => editSketch(d, id, (sk) => setPt(sk, pt, p));
/** A new point on a segment, at the segment's parameter t. */
export const insertSketchPoint = (d: Design, id: string, seg: string, t = 0.5) => editSketch(d, id, (sk) => !!splitSeg(sk, seg, t));
export const deleteSketchPoint = (d: Design, id: string, pt: string) => editSketch(d, id, (sk) => removePt(sk, pt));
/** Corner, Curve (smooth) or Round (with a radius) at a point. */
export function setSketchPointKind(d: Design, id: string, pt: string, kind: 'corner' | 'curve' | 'round', r = 5): boolean {
  return editSketch(d, id, (sk) => {
    const p = sk.pts[pt];
    if (!p) return false;
    if (kind === 'curve') {
      setCorner(sk, [pt], null);
      return setSmooth(sk, [pt], true);
    }
    setSmooth(sk, [pt], false);
    if (kind === 'round') return setCorner(sk, [pt], r > 0 ? { r } : null) === 0;
    setCorner(sk, [pt], null);
    return true;
  });
}

/**
 * The radius tool on a corner: `r` mm (0 = sharp) at a sketch point (by id) of an
 * extrusion or revolve, or at a footprint corner (by index) of a box, prism or pyramid.
 */
export function roundCorner(d: Design, id: string, key: number | string, r: number): boolean {
  const s = d.sculpt?.shapes[id];
  if (!s) return false;
  if (s.sketch) return typeof key === 'string' && setSketchPointKind(d, id, key, r > 0 ? 'round' : 'corner', r);
  if ((s.kind === 'box' || s.kind === 'prism' || s.kind === 'pyramid') && typeof key === 'number') {
    const n = footprint(s).length;
    const corners = Array.from({ length: n }, (_, j) => s.corners?.[j] ?? 0);
    corners[key] = Math.max(0, r);
    updateShape(d, id, { corners });
    return true;
  }
  return false;
}

/** A corner the radius tool can round: its key (a sketch point id or a footprint index), place in shape-local coordinates, and radius. */
export type Roundable = { key: string | number; x: number; y: number; r: number };
/** The corners the radius tool can round on a shape: a sketch's points where two straight lines meet, or a footprint's corners. */
export function roundable(s: Shape3): Roundable[] {
  if (s.sketch) {
    const sk = s.sketch;
    return Object.keys(sk.pts)
      .filter((id) => isLineCorner(sk, id))
      .map((id) => ({ key: id, x: sk.pts[id].x, y: sk.pts[id].y, r: sk.pts[id].r ?? 0 }));
  }
  if (s.kind === 'box' || s.kind === 'prism' || s.kind === 'pyramid') return footprint(s).map((p, i) => ({ key: i, x: p.x, y: p.y, r: p.r ?? 0 }));
  return [];
}
/** How tall a roundable corner's edge is (its vertical edge from z = 0 to this), 0 for a revolve's outline point. */
export function cornerHeight(s: Shape3): number {
  if (s.kind === 'extrude') return s.height ?? 20;
  if (s.kind === 'revolve') return 0;
  return s.size?.[1] ?? 0;
}

export { segsAt };
