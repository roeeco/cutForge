// When a plane or an axis is seen nearly edge-on (milestones 21 and 25).
// Pure helpers, so they can be tested without a renderer.

type Vec = { x: number; y: number; z: number } | [number, number, number];
const xyz = (v: Vec): [number, number, number] => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

/** Within this angle of edge-on (a plane) or of the view direction (an axis), the gizmo works by screen distance. */
export const GRAZING_DEG = 20;

/** Pointer positions this close to the gizmo centre (px) leave a turn where it was. */
export const RING_DEAD_PX = 12;

/**
 * Whether a turning ring with normal `n` is seen within GRAZING_DEG of
 * edge-on along the view direction `view`: then it is drawn as a flat line or
 * a thin ellipse, and a screen-facing ring of the same size takes its place.
 */
export function grazingRing(n: Vec, view: Vec): boolean {
  const [a, b, c] = xyz(n), [p, q, r] = xyz(view);
  const ln = Math.hypot(a, b, c), lv = Math.hypot(p, q, r);
  if (!ln || !lv) return false;
  return Math.abs((a * p + b * q + c * r) / (ln * lv)) < Math.sin((GRAZING_DEG * Math.PI) / 180);
}
