// Test helper: sample 3D points and count how many manufactured panel solids contain each.
import type { Design, V3 } from '../src/model/types';
import { matDir, toLocal } from '../src/model/frame';
import { panelExtras, panelNotches, panelOutline } from '../src/model/geometry';
import { pointInPolygon } from '../src/geom/vec';
import { v3dot, v3sub } from '../src/geom/v3';

export function solidCounter(d: Design) {
  const t = d.material.thickness;
  const solids = d.order.map((id) => {
    const p = d.panels[id];
    const ex = panelExtras(d, p);
    return { p, outline: panelOutline(p, panelNotches(d, p)), holes: [...ex.holes, ...ex.cuts], m: matDir(p.frame) };
  });
  return (P: V3) => {
    let n = 0;
    for (const s of solids) {
      const z = v3dot(v3sub(P, s.p.frame.o), s.m);
      if (z <= 1e-6 || z >= t - 1e-6) continue;
      const l = toLocal(s.p.frame, P);
      if (!pointInPolygon(l, s.outline)) continue;
      if (s.holes.some((h) => pointInPolygon(l, h))) continue;
      n++;
    }
    return n;
  };
}

/** Max number of solids overlapping at any sample point in a box. */
export function maxOverlap(d: Design, min: V3, max: V3, step = 0.37): number {
  const count = solidCounter(d);
  let worst = 0;
  for (let x = min[0] + step / 3; x < max[0]; x += step)
    for (let y = min[1] + step / 3; y < max[1]; y += step)
      for (let z = min[2] + step / 3; z < max[2]; z += step) worst = Math.max(worst, count([x, y, z]));
  return worst;
}
