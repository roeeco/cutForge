// Measurements in a sketch (SKETCH_OVERHAUL.md §5.3).
import type { P2 } from '../model/types';
import { arcOf, segPoints } from './flatten';
import type { Sketch } from './model';
import { cornerAngleOf } from './ops';

/** A segment's length (mm): a line's, an arc's or a curve's along its flattened points. */
export function segLength(sk: Sketch, segId: string): number {
  const s = sk.segs[segId];
  if (s?.k === 'arc') {
    const f = arcOf(sk.pts[s.a], sk.pts[s.b], s.bulge);
    if (Number.isFinite(f.r)) return f.r * Math.abs(f.sweep);
  }
  const pts = segPoints(sk, segId, 0.005);
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return L;
}

/** The inside angle (degrees) at a point on a closed outline; null where a curve meets or more than two segments meet. */
export const cornerAngle = (sk: Sketch, ptId: string): number | null => cornerAngleOf(sk, ptId);

/**
 * A typed length and angle, "50<30": 50 mm at 30° counter-clockwise from the
 * right. Either may be a sum ("40+10<90"); an empty angle is null. Null when it cannot be read.
 */
export function parsePolar(s: string, evalNum: (x: string) => number | null = basicEval): { len: number; angle: number | null } | null {
  const [a, b] = s.split('<');
  const len = evalNum(a ?? '');
  if (len === null) return null;
  if (b === undefined || b.trim() === '') return { len, angle: null };
  const angle = evalNum(b);
  return angle === null ? null : { len, angle };
}
/** The end of a typed line from `from`. */
export function polarPoint(from: P2, len: number, angleDeg: number): P2 {
  const r = (angleDeg * Math.PI) / 180;
  return { x: from.x + len * Math.cos(r), y: from.y + len * Math.sin(r) };
}

function basicEval(x: string): number | null {
  const c = x.replace(/,/g, '.').replace(/\s/g, '');
  if (!c || !/^[-+*/().\d]+$/.test(c)) return null;
  try {
    const v = Function(`"use strict";return (${c})`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
