// Line up and mirror (milestone 132, SHAPES_TO_DIELINES_PLAN.md R13): shapes moved so their
// boxes' min, centre or max meet the anchor's (the last clicked) on one axis; mirrored across
// the selection's middle on one axis (its position reflected and its turn reflected).
import type { Design, Quat, V3 } from '../model/types';
import { worldBox, unionBox } from './box';
import { moveShapes } from './ops';

export type AlignAt = 'min' | 'mid' | 'max';

/** Move every shape but the anchor so its box meets the anchor's on `axis` (0 x, 1 up, 2 z). */
export function alignShapes(d: Design, ids: string[], anchor: string, axis: 0 | 1 | 2, at: AlignAt) {
  const sc = d.sculpt;
  if (!sc) return;
  const ab = worldBox(sc, anchor);
  if (!ab) return;
  const pick = (b: { min: V3; max: V3 }) => (at === 'min' ? b.min[axis] : at === 'max' ? b.max[axis] : (b.min[axis] + b.max[axis]) / 2);
  const target = pick(ab);
  for (const id of ids) {
    if (id === anchor) continue;
    const b = worldBox(sc, id);
    if (!b) continue;
    const off: V3 = [0, 0, 0];
    off[axis] = target - pick(b);
    if (Math.abs(off[axis]) > 1e-9) moveShapes(d, [id], off);
  }
}

/**
 * Mirror the shapes across the middle of their box on `axis`: each one's position is reflected
 * and its turn reflected (S R S, a turn again); an extrusion's sketch is reflected too. Shapes
 * symmetric in their own axes (boxes, cylinders, prisms) come out exactly mirrored.
 */
export function mirrorShapes(d: Design, ids: string[], axis: 0 | 1 | 2) {
  const sc = d.sculpt;
  if (!sc) return;
  const box = unionBox(ids.map((id) => worldBox(sc, id)));
  if (!box) return;
  const mid = (box.min[axis] + box.max[axis]) / 2;
  for (const id of ids) {
    const s = sc.shapes[id];
    if (!s) continue;
    const before = worldBox(sc, id);
    // the turn: S R S with S the reflection, as a quaternion: the axis's own component kept, the others negated
    const q = s.q;
    s.q = [axis === 0 ? q[0] : -q[0], axis === 1 ? q[1] : -q[1], axis === 2 ? q[2] : -q[2], q[3]] as Quat;
    if (s.sketch && (s.kind === 'extrude' || s.kind === 'revolve')) {
      // the sketch's own axis along the mirror's: x is x; y is −z on the floor and up on an upright plane.
      // Along the sketch's normal an extrusion is the same both ways: its place is enough.
      const flip = axis === 0 ? 'x' : (s.sketch.plane === 'floor' ? axis === 2 : axis === 1) ? 'y' : null;
      if (flip) {
        for (const p of Object.values(s.sketch.pts)) p[flip] = -p[flip];
        // reflected, arcs turn the other way and handles follow
        for (const g of Object.values(s.sketch.segs)) {
          if (g.k === 'arc') g.bulge = -g.bulge;
          if (g.k === 'bez') (g.ha = { ...g.ha, [flip]: -g.ha[flip] }), (g.hb = { ...g.hb, [flip]: -g.hb[flip] });
        }
      }
    }
    // its box's middle reflected across the selection's middle
    const after = worldBox(sc, id);
    if (!before || !after) continue;
    const c0 = (before.min[axis] + before.max[axis]) / 2, c1 = (after.min[axis] + after.max[axis]) / 2;
    const off: V3 = [0, 0, 0];
    off[axis] = 2 * mid - c0 - c1;
    moveShapes(d, [id], off);
  }
}
