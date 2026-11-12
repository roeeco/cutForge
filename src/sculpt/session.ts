// The 2D sketch session (SKETCH_OVERHAUL.md §6.2): where a sketch is opened
// from, and what Finish writes into the design. The draft lives outside the
// design until Finish, so autosave and the design's history are untouched.
import type { Design, Sculpt, Shape3, SketchGraph } from '../model/types';
import { addShape, startHeight, type Heights } from './ops';
import { planeMatrix, revolveBlocked, setSketchMode, sketchMatrix, sketchShape, type SketchPlane } from './sketch';
import { sketchState } from '../sketch/regions';
import { m4Unscaled, type M4 } from './xform';
import { shapeColor } from './ui/colors';

/** Where the sketch sits: its plane, its local → world matrix, and whether that matrix is a rigid move (the underlay is shown only then). */
export type SketchFrame = { plane: SketchPlane; M: M4; rigid: boolean };

const isRigid = (M: M4) => {
  const U = m4Unscaled(M);
  return M.every((v, i) => Math.abs(v - U[i]) < 1e-9);
};

/** The frame of a shape's sketch (in its group's frame if it is in one). */
export function shapeFrame(sc: Sculpt, id: string): SketchFrame | null {
  const s = sc.shapes[id];
  if (!s?.sketch) return null;
  const M = sketchMatrix(sc, id);
  // the plane as the sketch tool would make it (for a new shape on the same plane)
  const ang = (((2 * Math.atan2(s.q[1], s.q[3]) * 180) / Math.PI) % 360 + 360) % 360;
  const plane: SketchPlane = s.sketch.plane === 'floor' ? { kind: 'floor' } : { kind: 'upright', o: [...s.at] as [number, number, number], ang };
  return { plane, M, rigid: isRigid(M) };
}

/** The frame of a new sketch on a plane. */
export function planeFrame(plane: SketchPlane): SketchFrame {
  return { plane, M: planeMatrix(plane), rigid: true };
}

/** The draft of a shape's sketch (a copy, without its plane). */
export function draftOf(s: Shape3): SketchGraph {
  const k = s.sketch!;
  return JSON.parse(JSON.stringify({ pts: k.pts, segs: k.segs, order: k.order }));
}

/** Why Finish is not possible now, or null. */
export function finishBlock(draft: SketchGraph, mode: 'extrude' | 'revolve', shape?: Shape3 | null): 'empty' | 'crossesAxis' | null {
  if (sketchState(draft).empty) return 'empty';
  if (mode === 'revolve') {
    const plane = shape?.sketch?.plane ?? 'upright';
    const axis = shape?.axis?.kind === 'seg' && draft.segs[shape.axis.id]?.k === 'line' ? shape.axis : { kind: 'plane' as const };
    const probe = { id: 'probe', name: '', kind: 'revolve', at: [0, 0, 0], q: [0, 0, 0, 1], sketch: { plane, v: 2, ...draft }, axis } as Shape3;
    if (revolveBlocked(probe)) return 'crossesAxis';
  }
  return null;
}

/**
 * Write a finished sketch into the design: the edited shape's sketch and kind,
 * or a new extrusion or revolve. Returns the shape's id.
 */
export function writeSketch(d: Design, o: { shapeId: string | null; plane: SketchPlane; mode: 'extrude' | 'revolve'; draft: SketchGraph; heights: Heights; into: string | null }): string {
  const h = startHeight('extrude', o.heights);
  if (o.shapeId && d.sculpt?.shapes[o.shapeId]?.sketch) {
    const s = d.sculpt.shapes[o.shapeId];
    s.sketch = { plane: s.sketch!.plane, v: 2, ...JSON.parse(JSON.stringify(o.draft)) };
    setSketchMode(d, o.shapeId, o.mode, h);
    if (s.axis?.kind === 'seg' && s.sketch!.segs[s.axis.id]?.k !== 'line') s.axis = { kind: 'plane' };
    return o.shapeId;
  }
  return addShape(d, { ...sketchShape(o.plane, o.draft, o.mode, h), color: shapeColor(Object.keys(d.sculpt?.shapes ?? {}).length) }, o.into);
}

