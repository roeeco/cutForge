// The other shapes as faint outlines on a sketch's plane (SKETCH_OVERHAUL.md §6.4):
// each top-level shape's body moved into the sketch's frame and projected onto it.
import type { P2, Sculpt } from '../model/types';
import { buildShape, shapeKey } from './build';
import { kernelNow, scope } from './kernel';
import { m4InvAffine, type M4 } from './xform';

const cache = new Map<string, P2[][]>();

/** One shape's outline seen square-on to the sketch plane (sketch coordinates). */
function shapeUnderlay(sc: Sculpt, id: string, M: M4): P2[][] {
  const k = kernelNow();
  if (!k) return [];
  const key = `${shapeKey(sc, id)}|${M.map((v) => Math.round(v * 1e6)).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rings = scope(() => {
    const m = buildShape(k, sc, id);
    if (m.isEmpty()) return [];
    return m
      .transform(m4InvAffine(M) as never)
      .project()
      .toPolygons()
      .map((r) => r.map(([x, y]) => ({ x, y })));
  });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  cache.set(key, rings);
  return rings;
}

/** The top-level shapes except `except`, as outlines on the plane of M; empty while the kernel loads. */
export function underlay(sc: Sculpt | undefined, except: string | null, M: M4): { id: string; rings: P2[][] }[] {
  if (!sc || !kernelNow()) return [];
  return sc.order.filter((id) => id !== except && sc.shapes[id]).map((id) => ({ id, rings: shapeUnderlay(sc, id, M) }));
}
