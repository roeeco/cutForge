// The Board tool's result (milestone 42), without the stage: what a ghost
// drawn on the floor or a face makes when the drag is released. Flat, a
// rectangle lying on it; standing, a board along the line; a standing line on
// a box's base becomes a divider from wall to wall (milestone 38), or a
// standing board when it does not run from wall to wall.
import type { Design, PanelPlace } from '../model/types';
import type { PanelGhost } from '../store/store';
import { addPlacedPanel, addRootPanel, MIN_PANEL, solve } from '../model/ops';
import { dividerLine, isBoxBase } from '../easy/recipes';

/** The panel a ghost stands for: its place on the host and its size (null while too small). */
export function ghostPlace(g: PanelGhost): { place: PanelPlace; w: number; h: number } | null {
  if (g.pose === 'flat') {
    const x0 = Math.min(g.a.x, g.b.x), y0 = Math.min(g.a.y, g.b.y);
    const w = Math.abs(g.b.x - g.a.x), h = Math.abs(g.b.y - g.a.y);
    if (w < MIN_PANEL || h < MIN_PANEL) return null;
    return { place: { host: g.host, face: g.face, x: x0, y: y0, rot: 0, pose: 'flat' }, w, h };
  }
  const w = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  if (w < MIN_PANEL) return null;
  const rot = (Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180) / Math.PI;
  return { place: { host: g.host, face: g.face, x: g.a.x, y: g.a.y, rot, pose: 'standing', side: g.side }, w, h: Math.max(MIN_PANEL, g.height) };
}

/** Does a standing line pressed here become a divider line: on a box's base, on its inner (material) face? */
export function drawsDivider(d: Design, pose: 'flat' | 'standing', host: string | null, face: 1 | -1): boolean {
  return pose === 'standing' && host !== null && face === 1 && isBoxBase(d, host);
}

/**
 * Make what a released ghost stands for (the Board tool, milestone 42): a
 * floor board, a board flat or standing on a face, or (a divider line) a
 * divider or a standing board on the base. Null when it is too small.
 */
export function boardFromGhost(d: Design, g: PanelGhost): { kind: 'flat' | 'standing' | 'divider'; id: string } | null {
  if (g.divider && g.host) {
    const r = dividerLine(d, g.host, g.a, g.b, g.height);
    return r ? { kind: r.kind, id: r.id } : null;
  }
  const gp = ghostPlace(g);
  if (!gp) return null;
  const { place, w, h } = gp;
  if (place.host === null && place.pose === 'flat') {
    // flat on the floor: an ordinary floor panel, as before
    const id = addRootPanel(d, place.x, -place.y, w, h);
    solve(d);
    return { kind: 'flat', id };
  }
  const id = addPlacedPanel(d, place, w, h);
  return id ? { kind: place.pose, id } : null;
}
