// The workplane (milestone 121, SHAPES_TO_DIELINES_PLAN.md R2): *W*, then a click on a
// face, sets a plane new shapes stand on and turn to; *D* drops the selection onto it.
// Pure: what a shape placed on it is, and how far a selection drops.
import type { Design, Quat, Sculpt, V3 } from '../model/types';
import { kernelNow, scope } from './kernel';
import { buildShape } from './build';
import { Q_ID, qNorm } from './xform';

export type Workplane = { o: V3; n: V3 };

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The turn that takes +y (a shape's up) onto n. */
export function upTo(n: V3): Quat {
  const l = Math.hypot(...n) || 1;
  const v: V3 = [n[0] / l, n[1] / l, n[2] / l];
  const c = v[1];
  if (c > 1 - 1e-9) return [...Q_ID] as Quat;
  // upside down: half a turn about x
  if (c < -1 + 1e-9) return [1, 0, 0, 0];
  const ax = cross([0, 1, 0], v);
  return qNorm([ax[0], ax[1], ax[2], 1 + c]);
}

/** How far (along the plane's normal) the selection's lowest point is above the plane: dropping moves it back by this. */
export function dropDistance(sc: Sculpt, ids: string[], w: Workplane): number | null {
  const k = kernelNow();
  if (!k) return null;
  let lo = Infinity;
  scope(() => {
    for (const id of ids) {
      if (!sc.shapes[id]) continue;
      const m = buildShape(k, sc, id).getMesh();
      const np = m.numProp, vp = m.vertProperties;
      for (let i = 0; i < vp.length; i += np) lo = Math.min(lo, dot([vp[i] - w.o[0], vp[i + 1] - w.o[1], vp[i + 2] - w.o[2]], w.n));
    }
  });
  return Number.isFinite(lo) ? lo : null;
}

/** The offset that drops the selection onto the workplane (its lowest point on it). */
export function dropOffset(d: Design, ids: string[], w: Workplane): V3 | null {
  if (!d.sculpt) return null;
  const h = dropDistance(d.sculpt, ids, w);
  if (h === null || Math.abs(h) < 1e-9) return null;
  return [-w.n[0] * h, -w.n[1] * h, -w.n[2] * h];
}
