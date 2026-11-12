// Drawing a polygon point by point, shared by the box polygon tool (G) and the
// waffle sketch tool (K): where the next point lands, and a typed length.
import type { P2 } from '../model/types';

export type PolyStep = {
  /** Angle step (radians) the segment snaps to, or null to place it on the grid. */
  angle: number | null;
  /** Round to the grid (mm). */
  grid: (x: number) => number;
  /** Distance (mm) at which a point closes on the first one. */
  closeTol: number;
  /** Extra snaps for a free point (e.g. a sketch's axis line); applied after the grid. */
  extra?: (p: P2) => P2;
};

/** The next vertex for a pointer position: the first point (to close), a stepped angle, or the grid. */
export function nextPolyPoint(pts: P2[], raw: P2, o: PolyStep): P2 {
  const last = pts[pts.length - 1];
  if (pts.length >= 3 && Math.hypot(raw.x - pts[0].x, raw.y - pts[0].y) < o.closeTol) return pts[0];
  if (last && o.angle) {
    const a = Math.round(Math.atan2(raw.y - last.y, raw.x - last.x) / o.angle) * o.angle;
    const len = Math.round(Math.hypot(raw.x - last.x, raw.y - last.y));
    return { x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len };
  }
  const g = { x: o.grid(raw.x), y: o.grid(raw.y) };
  return o.extra ? o.extra(g) : g;
}

/** A typed length along the rubber-band segment's direction, or null when nothing usable is typed. */
export function typedPoint(pts: P2[], cur: P2 | null, typed: string): P2 | null {
  const len = parseFloat(typed);
  const last = pts[pts.length - 1];
  if (!typed || !(len > 0) || !last || !cur) return null;
  const a = Math.atan2(cur.y - last.y, cur.x - last.x);
  return { x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len };
}
