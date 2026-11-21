// Stacking edges (milestone 177, BOXES_PLYWOOD_PLAN.md E6), after boxes.py's stackable edges (a behaviour reference
// only: THIRD_PARTY.md). An upright board of a box reaches below its bottom edge at each end as a foot, and over the
// middle of its top edge rises a tongue; a box like it stands on its feet on the walls' tops at the corners, the
// tongues between its feet, so it cannot slide off either way (the side walls' tongues hold it front to back, the
// front's and back's side to side).
//
// The feet and the tongue are material added after the joints, as a flap that lies flat is: the board's edges, and
// so its joints, are as before. Where a box's base is fingered to a wall, the notches above a foot become slots in it
// (boxes.py's finger holes), which hold the base's fingers as the notches did.
import type { Design, MaterialProfile, P2, Panel, PanelStack } from './types';
import { toWorld } from './frame';

/** How far a foot's flank runs along the edge for each mm it drops (its flank at 60° to the edge). */
const RUN = 1 / Math.tan(Math.PI / 3);

/**
 * A board's stacking edges for this board (boxes.py's proportions: feet two boards tall and four long), kept to sizes
 * a 3 to 8 mm plywood box takes: feet 6 to 12 mm tall and 12 to 24 mm long, in from a wall's end by its corner
 * (`inset`), and a play of half a millimetre or twice the fit, whichever is more, between a tongue and the feet over it.
 */
export function stackFor(m: Pick<MaterialProfile, 'thickness' | 'clearance'>, inset = m.thickness): PanelStack {
  const t = m.thickness;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { h: clamp(2 * t, 6, 12), w: clamp(4 * t, 12, 24), inset, play: Math.max(0.5, 2 * m.clearance) };
}

/** The narrowest board that takes these stacking edges: both feet and a tongue whose top is at least a foot's height long. */
export function stackMinWidth(s: PanelStack): number {
  return 2 * (s.inset + s.w + s.play) + 2 * (s.h - s.play) * RUN + s.h;
}

/** The least width (mm, whole) a box's walls take with stacking edges on this board: its sizes' least with the word on. */
export const stackLeast = (m: Pick<MaterialProfile, 'thickness' | 'clearance'>) => Math.ceil(stackMinWidth(stackFor(m)));

/** A board's feet and tongue as polygons in its own coordinates (counter-clockwise), or none where they do not fit. */
export function stackPolys(p: Pick<Panel, 'w' | 'h' | 'stack'>): P2[][] {
  const s = p.stack;
  if (!s || !(s.h > 0) || !(s.w > 0) || p.w < stackMinWidth(s) - 1e-9) return [];
  const W = p.w, H = p.h, k = s.h * RUN, a = s.inset, b = s.inset + s.w;
  // each foot: its outer side square to the edge, its inner flank sloping back up to the edge
  const left: P2[] = [{ x: a, y: 0 }, { x: a, y: -s.h }, { x: b, y: -s.h }, { x: b + k, y: 0 }];
  const right: P2[] = [{ x: W - b - k, y: 0 }, { x: W - b, y: -s.h }, { x: W - a, y: -s.h }, { x: W - a, y: 0 }];
  // the tongue: between where the feet over it stand, `play` clear of their flanks and of the board above's edge
  const x0 = b + s.play, x1 = W - b - s.play, rise = s.h - s.play, r = rise * RUN;
  const tongue: P2[] = [{ x: x0, y: H }, { x: x1, y: H }, { x: x1 - r, y: H + rise }, { x: x0 + r, y: H + rise }];
  return [left, right, tongue];
}

/** Does the design stack (any board with stacking edges that fit)? */
export const stacks = (d: Design): boolean => Object.values(d.panels).some((p) => stackPolys(p).length > 0);

/**
 * How far up a box like this one stands when stacked on it: from the lowest foot to the highest top edge a foot
 * stands on (the world's y), or null when it does not stack.
 */
export function stackPitch(d: Design): number | null {
  let lo = Infinity, hi = -Infinity;
  for (const p of Object.values(d.panels)) {
    if (!stackPolys(p).length) continue;
    for (const x of [0, p.w]) {
      lo = Math.min(lo, toWorld(p.frame, x, -p.stack!.h, 0)[1]);
      hi = Math.max(hi, toWorld(p.frame, x, p.h, 0)[1]);
    }
  }
  return hi > lo ? hi - lo : null;
}

/** Give boards stacking edges for the design's board (`inset` from their ends, default the board's thickness). */
export function addStack(d: Design, ids: (string | null | undefined)[], inset?: number) {
  for (const id of ids) {
    const p = id ? d.panels[id] : undefined;
    if (p) p.stack = stackFor(d.material, inset);
  }
}
