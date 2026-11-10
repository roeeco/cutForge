// Clear inside sizes: the gaps between walls and dividers standing on a panel,
// measured along the panel's own axes (material thickness and clearance included).
import type { Design } from './types';
import { toLocal, toWorld, frameNormal } from './frame';
import { v3dot } from '../geom/v3';
import { tOf } from './materials';

export function clearSpans(d: Design, baseId: string): { x: number[]; y: number[] } | null {
  const base = d.panels[baseId];
  if (!base) return null;
  const nB = frameNormal(base.frame);
  const occX: [number, number][] = [], occY: [number, number][] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || id === baseId) continue;
    if (Math.abs(v3dot(frameNormal(p.frame), nB)) > 0.02) continue; // must stand at 90°
    const t = tOf(d, id);
    const pts = [];
    for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) for (const z of [0, t]) pts.push(toLocal(base.frame, toWorld(p.frame, x, y, z)));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // footprint must touch the base area
    if (x1 < -0.01 || x0 > base.w + 0.01 || y1 < -0.01 || y0 > base.h + 0.01) continue;
    if (x1 - x0 <= t + 1e-6) occX.push([x0, x1]);
    else if (y1 - y0 <= t + 1e-6) occY.push([y0, y1]);
  }
  if (!occX.length && !occY.length) return null;
  return { x: gaps(occX, base.w), y: gaps(occY, base.h) };
}

function gaps(occ: [number, number][], L: number): number[] {
  const s = [...occ].sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let cur = 0;
  for (const [a, b] of s) {
    if (a - cur > 0.5) out.push(a - cur);
    cur = Math.max(cur, b);
  }
  if (L - cur > 0.5) out.push(L - cur);
  return out;
}
