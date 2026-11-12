// World boxes of shapes (pure: no React, no three.js), used by the stage, the
// shape edits and the waffle's fixes.
import type { Sculpt, V3 } from '../model/types';
import { buildShape } from './build';
import { kernelNow } from './kernel';
import { parentMatrix } from './tree';
import { m4Apply } from './xform';

export type Box3 = { min: V3; max: V3 };

/** A shape's box in the world (its parent's transform applied to its own box's corners). */
export function worldBox(sc: Sculpt, id: string): Box3 | null {
  const k = kernelNow();
  if (!k || !sc.shapes[id]) return null;
  const m = buildShape(k, sc, id);
  if (m.isEmpty()) return null;
  const bb = m.boundingBox();
  const P = parentMatrix(sc, id);
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [bb.min[0], bb.max[0]])
    for (const y of [bb.min[1], bb.max[1]])
      for (const z of [bb.min[2], bb.max[2]]) {
        const p = m4Apply(P, [x, y, z]);
        for (let i = 0; i < 3; i++) (min[i] = Math.min(min[i], p[i])), (max[i] = Math.max(max[i], p[i]));
      }
  return { min, max };
}

export function unionBox(boxes: (Box3 | null)[]): Box3 | null {
  const bs = boxes.filter((b): b is Box3 => !!b);
  if (!bs.length) return null;
  return { min: [0, 1, 2].map((i) => Math.min(...bs.map((b) => b.min[i]))) as V3, max: [0, 1, 2].map((i) => Math.max(...bs.map((b) => b.max[i]))) as V3 };
}

/**
 * The grid point nearest `near` where a w × d footprint overlaps no top-level
 * shape's box: tried at `near`, then outward in +x in steps of w + 10 (at most
 * 40 tries); `near` itself when every try is taken.
 */
export function freeSpot(sc: Sculpt, w: number, d: number, near: { x: number; z: number }, step = 1): { x: number; z: number } {
  const g = (v: number) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;
  const boxes = sc.order.map((id) => worldBox(sc, id)).filter((b): b is Box3 => !!b);
  const x0 = g(near.x), z0 = g(near.z);
  for (let i = 0; i < 40; i++) {
    const x = g(x0 + i * (w + 10));
    const free = boxes.every((b) => x + w / 2 <= b.min[0] + 1e-6 || x - w / 2 >= b.max[0] - 1e-6 || z0 + d / 2 <= b.min[2] + 1e-6 || z0 - d / 2 >= b.max[2] - 1e-6);
    if (free) return { x, z: z0 };
  }
  return { x: x0, z: z0 };
}
