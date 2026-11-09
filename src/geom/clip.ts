// polygon-clipping can fail on nearly-degenerate input (float noise where
// edges almost coincide). These wrappers retry on a coarser grid, and only
// then fall back to doing the operation one polygon at a time, so a single
// bad sliver never breaks a whole piece. The first attempt is the plain call,
// so results are unchanged whenever it succeeds.
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';

const snapPoly = (p: Polygon, g: number): Polygon => p.map((r) => r.map(([x, y]) => [Math.round(x / g) * g, Math.round(y / g) * g] as [number, number]));

function retry<T>(f: (g: number) => T): T {
  let err: unknown;
  for (const g of [0, 1e-6, 1e-5, 1e-4]) {
    try {
      return f(g);
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

export function safeUnion(polys: Polygon[]): MultiPolygon {
  if (polys.length === 1) return [polys[0]];
  try {
    return retry((g) => {
      const ps = g ? polys.map((p) => snapPoly(p, g)) : polys;
      return polygonClipping.union(ps[0], ...ps.slice(1));
    });
  } catch {
    // one at a time, skipping a polygon that cannot be joined
    let acc: MultiPolygon = [polys[0]];
    for (const p of polys.slice(1)) {
      try {
        acc = retry((g) => polygonClipping.union(g ? acc.map((q) => snapPoly(q, g)) : acc, g ? snapPoly(p, g) : p));
      } catch {
        /* leave this one out */
      }
    }
    return acc;
  }
}

export function safeDifference(base: MultiPolygon, cuts: Polygon[]): MultiPolygon {
  if (!cuts.length) return base;
  try {
    return retry((g) => (g ? polygonClipping.difference(base.map((q) => snapPoly(q, g)), ...cuts.map((c) => snapPoly(c, g))) : polygonClipping.difference(base, ...cuts)));
  } catch {
    let acc = base;
    for (const c of cuts) {
      try {
        acc = retry((g) => polygonClipping.difference(g ? acc.map((q) => snapPoly(q, g)) : acc, g ? snapPoly(c, g) : c));
      } catch {
        /* leave this cut out */
      }
    }
    return acc;
  }
}
