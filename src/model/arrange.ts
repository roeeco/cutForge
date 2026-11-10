// Arranging boards (milestone 31): several panels that share a plane (floor
// panels, or panels placed on the same face) are aligned and distributed the
// same way as shapes, by their footprints in that plane; several parallel
// dividers on one base are distributed into equal compartments.
import type { Design, Frame, P2 } from './types';
import type { AlignMode, DistributeMode } from './edit';
import { panelEdges } from './edges';
import { toLocal, toWorld } from './frame';
import { tOf } from './materials';
import { FLOOR_FRAME } from './place';
import { movePanel, movePlaced, parentConnection, setDividerOffset, solve } from './ops';
import { clearBox, spacedOffsets } from './dividers';

/** Where a group of boards lies: on the floor, or on one face of a host. */
export type Surface = { kind: 'floor' } | { kind: 'face'; host: string; face: 1 | -1 };
export type SurfaceWhy = 'notSameSurface' | 'grown' | 'tooFew';

/** A floor panel: a root panel lying on the floor (drawn there, or placed flat on it). */
function onFloor(d: Design, id: string): boolean {
  const p = d.panels[id];
  if (!p || parentConnection(d, id)) return false;
  if (p.place) return p.place.host === null;
  return Math.abs(p.frame.u[1]) < 1e-9 && Math.abs(p.frame.v[1]) < 1e-9;
}

/** The surface the boards share, or why they cannot be arranged together. */
export function commonPlane(d: Design, ids: string[]): { surface: Surface } | { why: SurfaceWhy } {
  if (ids.length < 2) return { why: 'tooFew' };
  if (ids.every((id) => onFloor(d, id))) return { surface: { kind: 'floor' } };
  const pl = ids.map((id) => d.panels[id]?.place);
  if (pl.every((x) => x && x.host !== null && x.host === pl[0]!.host && x.face === pl[0]!.face)) return { surface: { kind: 'face', host: pl[0]!.host!, face: pl[0]!.face } };
  if (ids.some((id) => parentConnection(d, id))) return { why: 'grown' };
  return { why: 'notSameSurface' };
}

function surfaceFrame(d: Design, s: Surface): Frame | null {
  return s.kind === 'floor' ? FLOOR_FRAME : (d.panels[s.host]?.frame ?? null);
}

/** A board's footprint box in the surface's coordinates (its outline, through its thickness). */
function footprint(d: Design, F: Frame, id: string) {
  const p = d.panels[id];
  const pts: P2[] = [];
  for (const e of panelEdges(p)) for (const z of [0, tOf(d, id)]) pts.push(toLocal(F, toWorld(p.frame, e.a.x, e.a.y, z)));
  return { id, minX: Math.min(...pts.map((q) => q.x)), maxX: Math.max(...pts.map((q) => q.x)), minY: Math.min(...pts.map((q) => q.y)), maxY: Math.max(...pts.map((q) => q.y)) };
}

/** Move a board in the surface's coordinates. */
function shift(d: Design, s: Surface, id: string, dx: number, dy: number) {
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return;
  const p = d.panels[id];
  // a placed panel moves on its host (the floor's coordinates are the floor frame's); a floor panel in world x, z (y runs along −Z)
  if (p.place) movePlaced(d, id, dx, dy);
  else movePanel(d, id, dx, -dy);
}

/** Align boards (≥2) on one surface; false when they do not share one. */
export function alignPanels(d: Design, ids: string[], mode: AlignMode): boolean {
  const c = commonPlane(d, ids);
  if (!('surface' in c)) return false;
  const F = surfaceFrame(d, c.surface);
  if (!F) return false;
  const items = ids.map((id) => footprint(d, F, id));
  const minX = Math.min(...items.map((i) => i.minX)), maxX = Math.max(...items.map((i) => i.maxX));
  const minY = Math.min(...items.map((i) => i.minY)), maxY = Math.max(...items.map((i) => i.maxY));
  for (const it of items) {
    const cx = (it.minX + it.maxX) / 2, cy = (it.minY + it.maxY) / 2;
    const dx = mode === 'left' ? minX - it.minX : mode === 'right' ? maxX - it.maxX : mode === 'hcenter' ? (minX + maxX) / 2 - cx : 0;
    const dy = mode === 'bottom' ? minY - it.minY : mode === 'top' ? maxY - it.maxY : mode === 'vcenter' ? (minY + maxY) / 2 - cy : 0;
    shift(d, c.surface, it.id, dx, dy);
  }
  solve(d);
  return true;
}

/** Distribute boards (≥3) with equal gaps or equal centre spacing, keeping the outer two where they are. */
export function distributePanels(d: Design, ids: string[], mode: DistributeMode): boolean {
  const c = commonPlane(d, ids);
  if (!('surface' in c) || ids.length < 3) return false;
  const F = surfaceFrame(d, c.surface);
  if (!F) return false;
  const items = ids.map((id) => footprint(d, F, id));
  const horiz = mode === 'hgap' || mode === 'hcenter';
  const lo = (i: (typeof items)[number]) => (horiz ? i.minX : i.minY), hi = (i: (typeof items)[number]) => (horiz ? i.maxX : i.maxY);
  const ctr = (i: (typeof items)[number]) => (lo(i) + hi(i)) / 2;
  items.sort((a, b) => ctr(a) - ctr(b));
  const first = items[0], last = items[items.length - 1];
  if (mode === 'hgap' || mode === 'vgap') {
    const gap = (hi(last) - lo(first) - items.reduce((s, i) => s + hi(i) - lo(i), 0)) / (items.length - 1);
    let pos = hi(first) + gap;
    for (let k = 1; k < items.length - 1; k++) {
      const delta = pos - lo(items[k]);
      shift(d, c.surface, items[k].id, horiz ? delta : 0, horiz ? 0 : delta);
      pos += hi(items[k]) - lo(items[k]) + gap;
    }
  } else {
    const step = (ctr(last) - ctr(first)) / (items.length - 1);
    for (let k = 1; k < items.length - 1; k++) {
      const delta = ctr(first) + k * step - ctr(items[k]);
      shift(d, c.surface, items[k].id, horiz ? delta : 0, horiz ? 0 : delta);
    }
  }
  solve(d);
  return true;
}

/**
 * Dividers that can be distributed together: two or more grown at 90° from
 * the same edge of the same rectangular base (so they are parallel). Their
 * row: what bounds them (the clear inside, or the nearest other divider or
 * wall face on either side).
 */
export function dividerGroup(d: Design, ids: string[]): { baseId: string; edge: string; lo: number; hi: number; t: number } | null {
  if (ids.length < 2) return null;
  const cs = ids.map((id) => parentConnection(d, id));
  if (cs.some((c) => !c || c.offset <= 0.5 || Math.abs(c.angle - 90) > 1e-6 || c.dir !== 'up')) return null;
  const base = cs[0]!.a.panelId, edge = cs[0]!.a.edge;
  if (cs.some((c) => c!.a.panelId !== base || c!.a.edge !== edge)) return null;
  const box = clearBox(d, base);
  if (!box || (edge !== 'e0' && edge !== 'e3')) return null;
  const t = tOf(d, ids[0]);
  let [lo, hi] = edge === 'e3' ? [box.x0, box.x1] : [box.y0, box.y1];
  const mine = cs.map((c) => c!.offset);
  const min = Math.min(...mine), max = Math.max(...mine);
  // the nearest other dividers from the same edge bound the row
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.panelId !== base || c.a.edge !== edge || ids.includes(c.b.panelId) || c.offset <= 0.5) continue;
    if (c.offset + t <= min + 1e-6) lo = Math.max(lo, c.offset + t);
    else if (c.offset >= max - 1e-6) hi = Math.min(hi, c.offset);
  }
  return { baseId: base, edge, lo, hi, t };
}

/** Equal compartments for parallel dividers on one base, between their outermost neighbours. */
export function distributeDividers(d: Design, ids: string[]): boolean {
  const g = dividerGroup(d, ids);
  if (!g) return false;
  const sorted = [...ids].sort((a, b) => parentConnection(d, a)!.offset - parentConnection(d, b)!.offset);
  const offs = spacedOffsets(g.lo, g.hi, sorted.length, g.t);
  sorted.forEach((id, k) => {
    const c = parentConnection(d, id)!;
    c.offset = Math.round(offs[k] * 1000) / 1000;
  });
  solve(d);
  return true;
}

export { setDividerOffset };
