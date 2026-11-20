// Size intent (milestone 93, DIELINE_DNA_PLAN.md D5a): a box's sizes stated
// the way a packaging designer states them. Stored geometry stays outside
// sizes (a tray's base is its outer footprint, its height the outer height);
// `Design.sizeAs` only says how the box's card shows and takes them, and a
// change of board keeps the size so stated.
//
// For a box whose walls are t thick (each wall's own thickness):
//   outside        the base's w × h, the tray's height
//   inside         less the walls on both sides; height less what is under
//                  (a cut base, or an open base's bottom flaps) and over (a
//                  closed top) the inside
//   crease         a fold lies where the two mid-planes meet (the fold
//                  overhaul), so from crease to crease is half a wall less
//                  on each side
import type { Design, Tray } from './types';
import { tOf } from './materials';
import { setPanelSize, setTrayHeight } from './ops';

export type SizeAs = 'outside' | 'inside' | 'crease';
export type BoxDims = { w: number; d: number; h: number };
export const SIZE_AS: SizeAs[] = ['outside', 'inside', 'crease'];

/** The boxes a design's intent applies to: trays that are not a lid of their own. */
export const statedBoxes = (d: Design): Tray[] => Object.values(d.trays ?? {}).filter((t) => !t.lidOf && d.panels[t.baseId]);

/** The wall standing on a base edge (by key), if any. */
function wallOn(d: Design, tray: Tray, edge: string): string | null {
  for (const c of Object.values(d.connections)) if (c.grown && c.trayId === tray.id && c.a.panelId === tray.baseId && c.a.edge === edge) return c.b.panelId;
  return null;
}

/**
 * What a box's walls take off its outside, per direction: across the width
 * (the walls on the base's sides e1 and e3), the depth (e0 and e2) and the
 * height (under and over the inside). A base that is not a rectangle uses its
 * walls' thickness on both sides.
 */
function walls(d: Design, tray: Tray): { w: number; d: number; under: number; over: number } {
  const base = d.panels[tray.baseId];
  const rect = base.sketch.kind === 'poly' && base.sketch.pts.length === 4 && !base.sketch.round;
  const wallT = (e: string) => {
    const id = wallOn(d, tray, e);
    return id ? tOf(d, id) : 0;
  };
  const anyWall = Object.values(d.connections).find((c) => c.grown && c.trayId === tray.id && c.a.panelId === tray.baseId);
  const t0 = anyWall ? tOf(d, anyWall.b.panelId) : tOf(d, tray.baseId);
  const w = rect ? wallT('e1') + wallT('e3') : 2 * t0;
  const dd = rect ? wallT('e0') + wallT('e2') : 2 * t0;
  const tb = tOf(d, tray.baseId);
  // a cut base lies under the walls' inside; an open base (a tube) has its bottom flaps there, a sleeve nothing
  const under = tray.base === 'open' ? (tray.bottom ? t0 : 0) : tb;
  const over = tray.top ? t0 : 0;
  return { w, d: dd, under, over };
}

/** A box's sizes in an intent (default: the design's). */
export function boxSize(d: Design, trayId: string, as: SizeAs = d.sizeAs ?? 'outside'): BoxDims | null {
  const tray = d.trays?.[trayId];
  const base = tray && d.panels[tray.baseId];
  if (!tray || !base) return null;
  const out = { w: base.w, d: base.h, h: tray.height };
  if (as === 'outside') return out;
  const k = as === 'inside' ? 1 : 0.5;
  const wl = walls(d, tray);
  return { w: out.w - k * wl.w, d: out.d - k * wl.d, h: out.h - k * (wl.under + wl.over) };
}

/** The outside sizes that give these sizes in an intent (only the ones given). */
export function outsideFor(d: Design, trayId: string, size: Partial<BoxDims>, as: SizeAs = d.sizeAs ?? 'outside'): Partial<BoxDims> {
  const tray = d.trays?.[trayId];
  if (!tray || !d.panels[tray.baseId] || as === 'outside') return { ...size };
  const k = as === 'inside' ? 1 : 0.5;
  const wl = walls(d, tray);
  const out: Partial<BoxDims> = {};
  if (size.w !== undefined) out.w = size.w + k * wl.w;
  if (size.d !== undefined) out.d = size.d + k * wl.d;
  if (size.h !== undefined) out.h = size.h + k * (wl.under + wl.over);
  return out;
}

/**
 * Set a box's sizes as stated in an intent. The base grows or shrinks from
 * its own origin, so every divider keeps its distance from the sides that do
 * not move (the left and the front).
 */
export function setBoxSize(d: Design, trayId: string, size: Partial<BoxDims>, as: SizeAs = d.sizeAs ?? 'outside') {
  const tray = d.trays?.[trayId];
  if (!tray || !d.panels[tray.baseId]) return;
  const o = outsideFor(d, trayId, size, as);
  if (o.w !== undefined || o.d !== undefined) setPanelSize(d, tray.baseId, o.w, o.d);
  if (o.h !== undefined) setTrayHeight(d, trayId, o.h);
}

/**
 * Run a change of board (or of a board's values) keeping every box's size as
 * the design states it: with an intent other than outside, the stated sizes
 * are read before and set again after, so a thicker board keeps the inside.
 */
export function keepingStatedSizes(d: Design, change: () => void) {
  const as = d.sizeAs ?? 'outside';
  if (as === 'outside') return change();
  const before = statedBoxes(d).map((t) => ({ id: t.id, s: boxSize(d, t.id, as) }));
  change();
  for (const b of before) if (b.s && d.trays?.[b.id]) setBoxSize(d, b.id, b.s, as);
}
