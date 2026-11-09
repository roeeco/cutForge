// Hinge angle: one number from 0° to 360° for how a grown panel turns about
// its parent edge, replacing the separate Up/Down choice in the interface.
//
// Measured from the parent's material face (its top, for a panel on the
// floor), through the inside: 90° stands the new panel upright on top, 180°
// continues flat outward, 270° hangs straight down, 0°/360° fold it onto or
// under the parent. The model keeps storing the fold angle (0–180) and the
// face it rises from (`dir`), so existing projects need no migration:
// Up a = a, Down a = 360 − a.
import type { ConnectionKind, Design } from './types';
import type { GrowDir } from './frame';
import { edgeLength, growFrame, toWorld } from './frame';
import { connectionsFor, matOf } from './materials';
import { defaultOffset, hasSideWalls, seatingOf } from './ops';
import type { EdgeArg } from './edges';

const EPS = 1e-6;

export function norm360(h: number): number {
  const r = ((h % 360) + 360) % 360;
  return Math.abs(r - 360) < EPS ? 0 : r;
}

export function hingeOf(angle: number, dir: GrowDir): number {
  return norm360(dir === 'up' ? angle : 360 - angle);
}

export function fromHinge(h: number): { angle: number; dir: GrowDir } {
  const x = norm360(h);
  return x <= 180 + EPS ? { angle: x, dir: 'up' } : { angle: 360 - x, dir: 'down' };
}

/** Upright on either face of the parent: square laser-cut joints fit. */
export function isSquare(h: number): boolean {
  const x = norm360(h);
  return Math.abs(x - 90) < EPS || Math.abs(x - 270) < EPS;
}

/** Leaning over the parent (top side 0–90°, under side 270–360°) rather than out past its edge. */
export function leansInward(h: number): boolean {
  const x = norm360(h);
  return (x > EPS && x < 90 - EPS) || (x > 270 + EPS && x < 360 - EPS);
}

/** Smallest angle to the parent face a panel can turn to before it lies on the parent. */
export const MIN_HINGE = 10;

export type HingeZone = 'ok' | 'support' | 'bad';
export type HingeReason = 'onPanel' | 'flat' | 'floor' | 'outward' | 'needsWalls';
export type HingeCheck = {
  zone: HingeZone;
  reason?: HingeReason;
  /** Connections that work at this angle (empty when nothing does). */
  kinds: ConnectionKind[];
  /** Growing is not possible until this is fixed. */
  blocking: boolean;
  /** Side walls next to this edge would fix it (or hold it better). */
  sideWalls: boolean;
};

/**
 * Can a panel turned to hinge angle `h` on this edge be built? Used to colour
 * the dial, to explain, and to offer side walls where they help.
 *
 * Only physically impossible angles are errors (red, blocking): lying on the
 * parent and going through the floor. Everything else can be built; amber
 * angles get a note (and side walls where they would hold the panel), and the
 * export check still flags a leaning panel that nothing holds.
 */
export function checkHinge(d: Design, parentId: string, edge: EdgeArg, h: number, height: number): HingeCheck {
  const x = norm360(h);
  const m = matOf(d, parentId);
  const parent = d.panels[parentId];
  if (x < MIN_HINGE - EPS || x > 360 - MIN_HINGE + EPS) return { zone: 'bad', reason: 'onPanel', kinds: [], blocking: true, sideWalls: false };
  const { angle, dir } = fromHinge(x);
  if (parent && belowFloor(d, parentId, edge, angle, dir, height)) return { zone: 'bad', reason: 'floor', kinds: [], blocking: true, sideWalls: false };
  const kinds = connectionsFor(m, isSquare(x) ? 90 : angle);
  const note = (reason: HingeReason, sideWalls = false): HingeCheck => ({ zone: 'support', reason, kinds, blocking: false, sideWalls });
  if (Math.abs(x - 180) < 0.5) return note('flat');
  if (isSquare(x) || m.kind !== 'plywood') return { zone: 'ok', kinds, blocking: false, sideWalls: false };
  // plywood off 90°: square-cut slots only hold it from side walls standing over the parent
  if (!leansInward(x)) return note('outward');
  return hasSideWalls(d, parentId, edge, dir) ? { zone: 'ok', kinds, blocking: false, sideWalls: false } : note('needsWalls', true);
}

/** Would the new panel dip below the floor (world y = 0)? */
function belowFloor(d: Design, parentId: string, edge: EdgeArg, angle: number, dir: GrowDir, height: number): boolean {
  const parent = d.panels[parentId];
  const m = matOf(d, parentId), t = m.thickness;
  const kind = connectionsFor(m, Math.abs(angle - 90) < EPS ? 90 : angle)[0];
  const f = growFrame(parent, edge, angle, dir, t, seatingOf(kind), defaultOffset(d, kind, parentId));
  const w = edgeLength(parent, edge);
  let lo = Infinity;
  for (const [px, py] of [[0, 0], [w, 0], [w, height], [0, height]])
    for (const z of [0, t]) lo = Math.min(lo, toWorld(f, px, py, z)[1]);
  return lo < -0.05;
}

/**
 * Snap a dragged hinge angle: 5° steps (1° with `fine`), pulled onto the
 * nearest multiple of 45° within 3°.
 */
export function snapHinge(raw: number, fine = false): number {
  const x = norm360(raw);
  const m45 = Math.round(x / 45) * 45;
  if (!fine && Math.abs(x - m45) <= 3) return norm360(m45);
  const step = fine ? 1 : 5;
  return norm360(Math.round(x / step) * step);
}
