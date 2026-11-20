// Ready shapes as face graphs (milestone 128, SHAPES_TO_DIELINES_PLAN.md R9): Guided's pyramid
// and diamond, made with no kernel (Guided starts a thing at once). Their faces are keyed as
// the shape modeller keys a pyramid's and a diamond's (`bottom`, `side<k>`; `table`, `crown<k>`,
// `pavilion<k>`), so a change of size keeps every decoration by key.
import type { V3 } from './types';
import { polyhedron, type FaceIn, type Polyhedron } from './polyhedron';

export type SolidSpec = { kind: 'pyramid' | 'diamond'; w: number; h: number; n: number };

/** The limits Guided offers (R9). */
export const SOLID_LIMITS = {
  pyramid: { w: [40, 200], h: [30, 200], n: [3, 8] },
  diamond: { w: [40, 200], h: [30, 200], n: [6, 10] },
} as const;

/** A regular n-gon of points fitted to a w × w square, flat side at the front (as the modeller's `ngon`), at height y. */
function ring(n: number, w: number, y: number, k = 1): V3[] {
  const raw = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n;
    return [Math.cos(a), Math.sin(a)];
  });
  const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
  const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  // the body's x and y (y towards the back) become world x and −z
  return raw.map(([x, z]) => [k * ((x - cx) / sx) * w, y, -k * ((z - cy) / sy) * w] as V3);
}

/** A pyramid or a diamond's face graph (its faces counter-clockwise from outside), keyed by `name`. */
export function solidPoly(s: SolidSpec, name = s.kind): Polyhedron {
  const n = Math.round(s.n);
  const F: FaceIn[] = [];
  const face = (role: string, r: number[]) => F.push({ key: `${name}:${role}`, rings: [r], src: [{ shapeId: name, role }] });
  if (s.kind === 'pyramid') {
    const V = [...ring(n, s.w, 0), [0, s.h, 0] as V3];
    face('bottom', Array.from({ length: n }, (_, i) => n - 1 - i));
    for (let i = 0; i < n; i++) face(`side${i}`, [i, (i + 1) % n, n]);
    return polyhedron(V, F);
  }
  // a diamond: the crown 27% of the height, the table 55% of the width (R9's fixed proportions)
  const crown = s.h * 0.27, table = 0.55;
  const V = [[0, 0, 0] as V3, ...ring(n, s.w, s.h - crown), ...ring(n, s.w, s.h, table)];
  const G = (i: number) => 1 + (i % n), T = (i: number) => 1 + n + (i % n);
  face('table', Array.from({ length: n }, (_, i) => T(i)));
  for (let i = 0; i < n; i++) face(`crown${i}`, [G(i), G(i + 1), T(i + 1), T(i)]);
  for (let i = 0; i < n; i++) face(`pavilion${i}`, [G(i + 1), G(i), 0]);
  return polyhedron(V, F);
}
