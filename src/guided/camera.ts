// Guided's opening view (milestone 105): the thing seen from above and in front,
// about 50° up, so the inside of a box shows. Pure: the stage sets it through `requestCamera`.
import type { Design, V3 } from '../model/types';

/** The world box of the design's boards (their outlines on their frames), or null for an empty design. */
export function boardsBox(d: Design): { min: V3; max: V3 } | null {
  let min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const f = p.frame;
    for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) {
      const q: V3 = [f.o[0] + f.u[0] * x + f.v[0] * y, f.o[1] + f.u[1] * x + f.v[1] * y, f.o[2] + f.u[2] * x + f.v[2] * y];
      min = [Math.min(min[0], q[0]), Math.min(min[1], q[1]), Math.min(min[2], q[2])];
      max = [Math.max(max[0], q[0]), Math.max(max[1], q[1]), Math.max(max[2], q[2])];
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** Degrees above the horizon of Guided's opening view. */
export const GUIDED_ELEVATION = 50;

/**
 * The camera of Guided's opening view: in front of the thing (+z is the front), `up` degrees above it,
 * far enough that the whole thing fits a 45° view with room around it.
 */
export function guidedCamera(d: Design, up = GUIDED_ELEVATION): [V3, V3] {
  const b = boardsBox(d) ?? { min: [-100, 0, -100] as V3, max: [100, 0, 100] as V3 };
  const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const r = Math.max(60, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
  const dist = (r * 1.35) / Math.tan((45 * Math.PI) / 360);
  const a = (up * Math.PI) / 180;
  return [[c[0], c[1] + dist * Math.sin(a), c[2] + dist * Math.cos(a)], c];
}

/** Straight down on the thing (*From above*); a hair in front so the view keeps its up direction. */
export function aboveCamera(d: Design): [V3, V3] {
  return guidedCamera(d, 89.5);
}
